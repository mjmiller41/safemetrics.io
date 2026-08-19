export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

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
        const rawHashInput = `${clientIp}-${userAgent}-${today}-safemetrics-salt`;
        
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

        // Ingest into D1 Database (Lookup or Auto-register domain under default tenant)
        let domainRecord = await env.DB.prepare(
          'SELECT id, tenant_id FROM domains WHERE domain_name = ?'
        ).bind(domainName).first<{ id: string; tenant_id: string }>();

        let tenantId = domainRecord?.tenant_id;
        let domainId = domainRecord?.id;

        if (!domainRecord) {
          // Auto-provision initial default tenant if first time seeing this domain
          tenantId = 'tenant_default';
          domainId = `dom_${Date.now().toString(36)}`;
          
          await env.DB.prepare(
            'INSERT OR IGNORE INTO tenants (id, name, slug, plan) VALUES (?, ?, ?, ?)'
          ).bind(tenantId, 'Primary Workspace', 'primary', 'pro').run();

          await env.DB.prepare(
            'INSERT OR IGNORE INTO domains (id, tenant_id, domain_name) VALUES (?, ?, ?)'
          ).bind(domainId, tenantId, domainName).run();
        }

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
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 2. Real-Time Stats API: GET /api/stats?domain=...&timeframe=...
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      const domainName = url.searchParams.get('domain') || 'fleadays.com';
      try {
        const stats = await env.DB.prepare(`
          SELECT 
            COUNT(DISTINCT session_hash) as unique_visitors,
            COUNT(*) as total_views
          FROM events e
          JOIN domains d ON e.domain_id = d.id
          WHERE d.domain_name = ?
        `).bind(domainName).first();

        const topPages = await env.DB.prepare(`
          SELECT url_path, COUNT(*) as views
          FROM events e
          JOIN domains d ON e.domain_id = d.id
          WHERE d.domain_name = ?
          GROUP BY url_path
          ORDER BY views DESC
          LIMIT 5
        `).bind(domainName).all();

        const topReferrers = await env.DB.prepare(`
          SELECT referrer, COUNT(*) as visitors
          FROM events e
          JOIN domains d ON e.domain_id = d.id
          WHERE d.domain_name = ?
          GROUP BY referrer
          ORDER BY visitors DESC
          LIMIT 5
        `).bind(domainName).all();

        return new Response(JSON.stringify({
          domain: domainName,
          stats,
          topPages: topPages.results,
          topReferrers: topReferrers.results
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 3. Stripe Checkout Session Endpoint: POST /api/checkout
    if (url.pathname === '/api/checkout' && request.method === 'POST') {
      try {
        const bodyText = await request.text();
        const payload = JSON.parse(bodyText || '{}');
        const { priceId, planId, successUrl, cancelUrl, userEmail, userId } = payload;

        if (!priceId) {
          return new Response(JSON.stringify({ error: 'Missing priceId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const stripeKey = env.STRIPE_SECRET_KEY || 'sk_live_REDACTED_ROTATE_THIS_KEY';
        const origin = url.origin;

        const params = new URLSearchParams();
        params.append('mode', 'subscription');
        params.append('line_items[0][price]', priceId);
        params.append('line_items[0][quantity]', '1');
        params.append('success_url', successUrl || `${origin}/?checkout=success&plan=${planId || 'pro'}`);
        params.append('cancel_url', cancelUrl || `${origin}/?checkout=cancel`);
        if (userEmail) params.append('customer_email', userEmail);
        if (userId) params.append('client_reference_id', userId);
        params.append('metadata[planId]', planId || 'pro');

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
          return new Response(JSON.stringify({ error: data.error?.message || 'Failed to create Stripe checkout session' }), {
            status: stripeRes.status,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        return new Response(JSON.stringify({ url: data.url, id: data.id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 4. Stripe Webhook Listener: POST /api/webhook
    if (url.pathname === '/api/webhook' && request.method === 'POST') {
      try {
        const bodyText = await request.text();
        const event = JSON.parse(bodyText || '{}');

        if (event.type === 'checkout.session.completed') {
          const session = event.data?.object;
          const planId = session?.metadata?.planId || 'pro';
          const customerEmail = session?.customer_email || session?.customer_details?.email;
          const tenantId = session?.client_reference_id || 'tenant_default';

          // Update tenant plan in D1
          if (env.DB) {
            await env.DB.prepare(
              'UPDATE tenants SET plan = ? WHERE id = ?'
            ).bind(planId, tenantId).run();
          }
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 5. Fallback: Serve static SPA frontend from Cloudflare Pages / Assets
    return env.ASSETS.fetch(request);
  }
};
