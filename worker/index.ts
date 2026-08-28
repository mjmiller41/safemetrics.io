import { handleStripeWebhookRequest } from './stripe-webhook.ts';
import { bearerTokenFrom, verifyClerkToken, type AuthFailureReason } from './clerk-auth.ts';
import { claimDomain, ensureTenantForUser, findDomain, listDomains, normalizeDomain, type TenantContext } from './tenancy.ts';
import { isTimeframe, loadDomainStats, TIMEFRAMES, type Timeframe } from './stats.ts';
import { FREE_PLAN, planById, priceForPlan, type BillingInterval } from './plans.ts';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Stripe API key. Set with `wrangler secret put STRIPE_SECRET_KEY`. */
  STRIPE_SECRET_KEY?: string;
  /** Endpoint signing secret. Set with `wrangler secret put STRIPE_WEBHOOK_SECRET`. */
  STRIPE_WEBHOOK_SECRET?: string;
  /**
   * Clerk Frontend API origin, e.g. `https://clerk.safemetrics.io`. Public, so it
   * lives in `wrangler.jsonc` vars rather than a secret. Without it every
   * authenticated endpoint answers 503 rather than trusting unverified tokens.
   */
  CLERK_ISSUER?: string;
  /** Salt for the daily visitor hash. Set with `wrangler secret put SESSION_SALT`. */
  SESSION_SALT?: string;
}

/** HTTP status for each way authentication can fail. */
const AUTH_FAILURE_STATUS: Record<AuthFailureReason, number> = {
  not_configured: 503,
  jwks_unavailable: 503,
  missing_token: 401,
  malformed_token: 401,
  unsupported_algorithm: 401,
  unknown_key: 401,
  bad_signature: 401,
  expired: 401,
  not_yet_valid: 401,
  issuer_mismatch: 401,
  missing_subject: 401,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS Headers for public beacon ingestion
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 0. Health Endpoint: GET /api/health
    // Unauthenticated liveness probe. Its only job is to prove the Worker is
    // actually routed to this hostname -- if the custom domain binding is
    // missing, this path falls through to the SPA and returns HTML instead.
    if (url.pathname === '/api/health' && request.method === 'GET') {
      let database = 'unbound';
      if (env.DB) {
        try {
          await env.DB.prepare('SELECT 1').first();
          database = 'ok';
        } catch (err: any) {
          database = `error: ${err.message}`;
        }
      }

      return new Response(JSON.stringify({
        ok: database === 'ok',
        service: 'safemetrics-app',
        worker: true,
        database,
      }), {
        status: database === 'ok' ? 200 : 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 1. Ingestion Endpoint: POST /api/event
    if (url.pathname === '/api/event' && request.method === 'POST') {
      try {
        const bodyText = await request.text();
        const payload = JSON.parse(bodyText || '{}');
        const domainName = payload.d || payload.domain;
        const path = payload.u ? new URL(payload.u).pathname : payload.path || '/';
        const referrer = payload.r || payload.referrer || 'Direct';
        const eventName = payload.n || payload.name || 'pageview';

        if (!domainName) {
          return new Response(JSON.stringify({ error: 'Missing domain' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Anonymized daily rotating hash (IP + User-Agent + Daily Salt)
        const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';
        const userAgent = request.headers.get('user-agent') || 'Unknown';
        const today = new Date().toISOString().split('T')[0];
        // The salt is what stops the visitor hash from being a reversible lookup of
        // (ip, user-agent) pairs, so it has to be a secret rather than a literal in
        // a bundle anyone can download. Set it with `wrangler secret put SESSION_SALT`.
        const rawHashInput = `${clientIp}-${userAgent}-${today}-${env.SESSION_SALT ?? 'safemetrics-salt'}`;

        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawHashInput));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sessionHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

        // Geo and device metadata from Cloudflare Edge
        const cf: any = (request as any).cf || {};
        const country = cf.country || 'Unknown';
        const city = cf.city || 'Unknown';

        // Extract device info
        let device = 'Desktop';
        let browser = 'Chrome';
        let os = 'Unknown';
        const ua = userAgent.toLowerCase();
        if (/mobile|android|iphone|ipad|phone/i.test(ua)) device = 'Mobile';
        else if (/tablet|ipad/i.test(ua)) device = 'Tablet';

        if (/firefox/i.test(ua)) browser = 'Firefox';
        else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
        else if (/edg/i.test(ua)) browser = 'Edge';

        if (/windows/i.test(ua)) os = 'Windows';
        else if (/macintosh|mac os/i.test(ua)) os = 'macOS';
        else if (/linux/i.test(ua)) os = 'Linux';
        else if (/ios|iphone|ipad/i.test(ua)) os = 'iOS';
        else if (/android/i.test(ua)) os = 'Android';

        // The domain must already be registered by its owner via POST /api/domains.
        //
        // This used to auto-create the domain under a shared `tenant_default` on the
        // `pro` plan, which meant anyone who pointed the beacon at this endpoint got
        // a paid workspace and their traffic was pooled with every other stranger's.
        // Unknown domains are now dropped: 202 rather than an error, because the
        // beacon is fire-and-forget and a misconfigured site should not fill a
        // visitor's console with failures.
        const domainRecord = await findDomain(env.DB, domainName);
        if (!domainRecord) {
          return new Response(JSON.stringify({ ok: false, reason: 'domain_not_registered' }), {
            status: 202,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const tenantId = domainRecord.tenant_id;
        const domainId = domainRecord.id;

        // Insert event record
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        ctx.waitUntil(
          env.DB.prepare(`
            INSERT INTO events (id, tenant_id, domain_id, event_type, event_name, url_path, referrer, country, city, device, browser, os, session_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            eventId, tenantId, domainId, 'pageview', eventName, path, referrer, country, city, device, browser, os, sessionHash
          ).run()
        );

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err: any) {
        // The beacon is public and unauthenticated, so the reason stays in the logs
        // rather than being handed to whoever sent the request.
        console.error(`[event] ${err?.message}`);
        return new Response(JSON.stringify({ error: 'ingest_failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 2a. Current account: GET /api/me
    //
    // Also the provisioning hook: the first authenticated request a Clerk user ever
    // makes is what creates their tenant and `users` row.
    if (url.pathname === '/api/me' && request.method === 'GET') {
      const auth = await authenticate(request, env);
      if (!auth.ok) return auth.response;

      const domains = await listDomains(env.DB, auth.context.tenantId);
      return json({
        userId: auth.context.userId,
        tenantId: auth.context.tenantId,
        plan: auth.context.plan,
        monthlyEventLimit: auth.context.monthlyEventLimit,
        provisioned: auth.context.provisioned,
        domains: domains.map((domain) => domain.domain_name),
      }, 200, corsHeaders);
    }

    // 2b. Register a site: POST /api/domains { domain }
    if (url.pathname === '/api/domains' && request.method === 'POST') {
      const auth = await authenticate(request, env);
      if (!auth.ok) return auth.response;

      let body: any;
      try {
        body = JSON.parse((await request.text()) || '{}');
      } catch {
        return json({ error: 'invalid_json' }, 400, corsHeaders);
      }

      const claim = await claimDomain(env.DB, auth.context.tenantId, body.domain);
      if (!claim.ok) {
        return claim.reason === 'taken'
          ? json({ error: 'domain_already_registered' }, 409, corsHeaders)
          : json({ error: 'invalid_domain' }, 400, corsHeaders);
      }

      return json(
        { domain: claim.domain.domain_name, created: claim.created },
        claim.created ? 201 : 200,
        corsHeaders,
      );
    }

    // 2c. Real-Time Stats API: GET /api/stats?domain=...
    //
    // Authenticated and scoped: a caller only ever sees domains their own tenant
    // owns. This used to be open to the internet with a hardcoded default domain.
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      const auth = await authenticate(request, env);
      if (!auth.ok) return auth.response;

      const requested = url.searchParams.get('domain');
      const owned = await listDomains(env.DB, auth.context.tenantId);

      if (!owned.length) {
        return json({ error: 'no_domains_registered', domains: [] }, 404, corsHeaders);
      }

      const domainName = requested ? normalizeDomain(requested) : owned[0].domain_name;
      const domain = owned.find((entry) => entry.domain_name === domainName);
      if (!domainName || !domain) {
        return json({ error: 'domain_not_owned' }, 403, corsHeaders);
      }

      const requestedTimeframe = url.searchParams.get('timeframe');
      if (requestedTimeframe && !isTimeframe(requestedTimeframe)) {
        return json({ error: 'invalid_timeframe', allowed: TIMEFRAMES }, 400, corsHeaders);
      }
      const timeframe: Timeframe = isTimeframe(requestedTimeframe) ? requestedTimeframe : '7d';

      try {
        // Queried by domain id, not name: the ownership check above resolved the row,
        // and re-joining on the name would re-derive something already established.
        const stats = await loadDomainStats(env.DB, domain.id, timeframe, Date.now());

        return json({
          domain: domainName,
          tenantId: auth.context.tenantId,
          plan: auth.context.plan,
          domains: owned.map((entry) => entry.domain_name),
          ...stats,
        }, 200, corsHeaders);
      } catch (err: any) {
        console.error(`[stats] ${domainName} (${timeframe}): ${err?.message}`);
        return json({ error: 'stats_unavailable' }, 500, corsHeaders);
      }
    }

    // 3. Stripe Checkout Session Endpoint: POST /api/checkout
    if (url.pathname === '/api/checkout' && request.method === 'POST') {
      // Authenticated so the session can be tied to a real tenant. The identifiers
      // below come from the verified token, never from the request body: a caller
      // must not be able to attribute a purchase to somebody else's account.
      const auth = await authenticate(request, env);
      if (!auth.ok) return auth.response;

      try {
        const bodyText = await request.text();
        const payload = JSON.parse(bodyText || '{}');
        const userId = auth.context.userId;
        const userEmail = auth.email;

        // The tier is looked up, and the price is derived from it. Both used to come
        // straight from the request body, which let a caller pair any price on the
        // Stripe account with any tier — pay for `pro`, be granted `scale`. Nothing
        // the caller sends decides what is charged or what is granted.
        const plan = planById(payload.planId);
        if (!plan || plan.id === FREE_PLAN) {
          return json({ error: 'unknown_plan' }, 400, corsHeaders);
        }

        const interval: BillingInterval =
          payload.interval === 'year' || payload.interval === 'yearly' ? 'year' : 'month';
        const priceId = priceForPlan(plan, interval);
        if (!priceId) {
          console.error(`[checkout] no ${interval} price configured for ${plan.id}`);
          return json({ error: 'plan_not_purchasable' }, 400, corsHeaders);
        }

        // Never fall back to a literal key here — a hardcoded secret ships inside the
        // deployed worker bundle. Set it with `wrangler secret put STRIPE_SECRET_KEY`.
        const stripeKey = env.STRIPE_SECRET_KEY;
        if (!stripeKey) {
          console.error('[checkout] STRIPE_SECRET_KEY is not configured');
          return json({ error: 'Billing is not configured' }, 500, corsHeaders);
        }
        const origin = url.origin;

        // Redirect targets are built here rather than taken from the body: a caller
        // supplying its own would turn a checkout link into an open redirect through
        // the Stripe domain.
        const params = new URLSearchParams();
        params.append('mode', 'subscription');
        params.append('line_items[0][price]', priceId);
        params.append('line_items[0][quantity]', '1');
        params.append('success_url', `${origin}/?checkout=success&plan=${plan.id}`);
        params.append('cancel_url', `${origin}/?checkout=cancel`);
        if (userEmail) params.append('customer_email', userEmail);
        if (userId) params.append('client_reference_id', userId);
        params.append('metadata[planId]', plan.id);

        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        const data: any = await stripeRes.json();
        if (!stripeRes.ok || !data.url) {
          // Stripe's message can name internal account state, so it is logged rather
          // than returned.
          console.error(`[checkout] stripe rejected the session: ${data.error?.message ?? stripeRes.status}`);
          return json({ error: 'checkout_failed' }, 502, corsHeaders);
        }

        return json({ url: data.url, id: data.id }, 200, corsHeaders);
      } catch (err: any) {
        console.error(`[checkout] ${err?.message}`);
        return json({ error: 'checkout_failed' }, 500, corsHeaders);
      }
    }

    // 4. Stripe Webhook Listener: POST /api/webhook
    //
    // Signature verification, idempotency, and tier sync all live in
    // worker/stripe-webhook.ts. Note that CORS headers are deliberately not applied:
    // this endpoint is server-to-server only and must never be callable from a page.
    if (url.pathname === '/api/webhook' && request.method === 'POST') {
      return handleStripeWebhookRequest(request, env);
    }

    // 5. Fallback: Serve static SPA frontend from Cloudflare Pages / Assets
    return env.ASSETS.fetch(request);
  }
};

type Authenticated =
  | { ok: true; context: TenantContext; email: string | null }
  | { ok: false; response: Response };

/**
 * Verifies the caller's Clerk token and resolves (provisioning if needed) their
 * tenant. Every authenticated endpoint goes through here, so provisioning happens
 * on whichever request the user makes first.
 */
async function authenticate(request: Request, env: Env): Promise<Authenticated> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const verification = await verifyClerkToken({
    token: bearerTokenFrom(request),
    issuer: env.CLERK_ISSUER,
  });

  if (!verification.ok) {
    if (verification.reason === 'not_configured') {
      console.error('[auth] CLERK_ISSUER is not configured');
    }
    return {
      ok: false,
      response: json(
        { error: 'unauthorized', reason: verification.reason },
        AUTH_FAILURE_STATUS[verification.reason],
        corsHeaders,
      ),
    };
  }

  try {
    const context = await ensureTenantForUser(env.DB, verification.claims);
    return { ok: true, context, email: verification.claims.email };
  } catch (err: any) {
    console.error(`[auth] could not provision tenant for ${verification.claims.sub}: ${err?.message}`);
    return { ok: false, response: json({ error: 'provisioning_failed' }, 500, corsHeaders) };
  }
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
