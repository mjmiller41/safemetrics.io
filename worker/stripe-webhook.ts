/**
 * Durable Stripe webhook processing for SafeMetrics.
 *
 * Guarantees this module is responsible for:
 *
 *  - **Authenticity.** Nothing touches the database until the raw body has passed
 *    HMAC signature verification against `STRIPE_WEBHOOK_SECRET`.
 *  - **Idempotency.** Every event is claimed by its Stripe event id in
 *    `stripe_webhook_events` before processing, so redeliveries are no-ops.
 *  - **Correct retry signalling.** Permanent problems answer 4xx (Stripe gives up);
 *    transient ones answer 5xx (Stripe retries with backoff). Nothing is dropped
 *    silently — every outcome, including ignored events, lands in the ledger.
 *  - **Ownership.** SafeMetrics shares a Stripe account with sibling products, so
 *    events for prices we do not recognise are explicitly ignored rather than
 *    misapplied to a SafeMetrics tenant.
 *
 * See `migrations/0002_stripe_billing.sql` for the schema this depends on.
 */

import { verifyStripeSignature, type VerifyFailureReason } from './stripe-signature.ts';
import { FREE_PLAN, eventLimitFor, planById, planForStripePrice, type PlanId } from './plans.ts';

export interface WebhookEnv {
  DB: D1Database;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Subscription statuses that should keep a paid tier switched on.
 *
 * `past_due` is deliberately included: Stripe is still retrying the invoice and
 * cutting access off at the first failed charge punishes customers for an expiring
 * card. Access is revoked when Stripe gives up and moves to `canceled`/`unpaid`.
 */
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** Event types we act on. Anything else is acknowledged and recorded as ignored. */
const HANDLED_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

/** Fetches a subscription from the Stripe REST API. Injectable for tests. */
export type SubscriptionFetcher = (subscriptionId: string) => Promise<any | null>;

export interface ProcessOptions {
  /** Raw request body, byte-for-byte as Stripe sent it. */
  rawBody: string;
  signatureHeader: string | null | undefined;
  env: WebhookEnv;
  nowSeconds?: number;
  fetchSubscription?: SubscriptionFetcher;
}

interface TenantRow {
  id: string;
  plan: string;
  billing_event_at: number | null;
}

/** Outcome of a handler: what to record and what to tell Stripe. */
interface HandlerOutcome {
  status: 'processed' | 'ignored' | 'failed';
  tenantId?: string | null;
  detail?: string;
  /** HTTP status to return. Defaults to 200 for processed/ignored, 500 for failed. */
  httpStatus?: number;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Verifies and processes one webhook delivery.
 *
 * Returns a status/body pair rather than a `Response` so it can be unit-tested
 * without constructing Workers runtime objects.
 */
export async function processStripeWebhook(options: ProcessOptions): Promise<WebhookResult> {
  const { rawBody, signatureHeader, env, nowSeconds } = options;

  // 1. Authenticate before anything else.
  const verification = await verifyStripeSignature({
    payload: rawBody,
    header: signatureHeader,
    secret: env.STRIPE_WEBHOOK_SECRET,
    nowSeconds,
  });

  if (!verification.ok) {
    return signatureFailureResponse(verification.reason);
  }

  // 2. Parse. A verified body that will not parse is a permanent problem.
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error('[stripe-webhook] verified payload was not valid JSON');
    return { status: 400, body: { error: 'invalid_payload' } };
  }

  const eventId = typeof event?.id === 'string' ? event.id : null;
  const eventType = typeof event?.type === 'string' ? event.type : null;
  if (!eventId || !eventType) {
    console.error('[stripe-webhook] payload missing id or type');
    return { status: 400, body: { error: 'invalid_event' } };
  }

  const eventCreated = Number.isFinite(event?.created) ? Number(event.created) : 0;

  // 3. Claim the event id. This is the idempotency gate.
  let claim: { attempts: number } | null;
  try {
    claim = await claimEvent(env.DB, eventId, eventType, eventCreated);
  } catch (err: any) {
    // The ledger is unavailable. Processing without it risks double-applying, so
    // ask Stripe to retry instead.
    console.error(`[stripe-webhook] could not claim ${eventId}: ${err?.message}`);
    return { status: 500, body: { error: 'claim_failed' } };
  }

  if (!claim) {
    // Already reached a terminal state on an earlier delivery.
    return { status: 200, body: { received: true, duplicate: true, eventId } };
  }

  // 4. Dispatch.
  let outcome: HandlerOutcome;
  try {
    outcome = await dispatch(event, eventType, eventCreated, env, options.fetchSubscription);
  } catch (err: any) {
    const detail = err?.message ? String(err.message) : 'unknown error';
    console.error(`[stripe-webhook] ${eventType} ${eventId} threw: ${detail}`);
    await recordOutcome(env.DB, eventId, { status: 'failed', detail }).catch(() => {});
    return { status: 500, body: { error: 'handler_failed', eventId } };
  }

  // 5. Record the terminal state, then answer.
  await recordOutcome(env.DB, eventId, outcome).catch((err: any) => {
    console.error(`[stripe-webhook] could not record outcome for ${eventId}: ${err?.message}`);
  });

  if (outcome.status === 'failed') {
    console.error(`[stripe-webhook] ${eventType} ${eventId} failed: ${outcome.detail}`);
    return {
      status: outcome.httpStatus ?? 500,
      body: { error: 'handler_failed', reason: outcome.detail, eventId },
    };
  }

  return {
    status: 200,
    body: {
      received: true,
      eventId,
      outcome: outcome.status,
      ...(outcome.detail ? { detail: outcome.detail } : {}),
      ...(outcome.tenantId ? { tenantId: outcome.tenantId } : {}),
    },
  };
}

/** Convenience wrapper that turns a `Request` into a `Response`. */
export async function handleStripeWebhookRequest(
  request: Request,
  env: WebhookEnv,
): Promise<Response> {
  const rawBody = await request.text();
  const result = await processStripeWebhook({
    rawBody,
    signatureHeader: request.headers.get('stripe-signature'),
    env,
    fetchSubscription: createSubscriptionFetcher(env.STRIPE_SECRET_KEY),
  });

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function signatureFailureResponse(reason: VerifyFailureReason | undefined): WebhookResult {
  // Our own misconfiguration — a 5xx keeps Stripe retrying so events survive until
  // the secret is set, rather than being discarded during a bad deploy.
  if (reason === 'missing_secret') {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return { status: 500, body: { error: 'webhook_not_configured' } };
  }

  // Everything else is a request that will never become valid; 400 stops retries.
  console.warn(`[stripe-webhook] rejected unsigned/invalid delivery: ${reason}`);
  return { status: 400, body: { error: 'invalid_signature', reason } };
}

// ---------------------------------------------------------------------------
// Idempotency ledger
// ---------------------------------------------------------------------------

/**
 * Attempts to claim an event for processing.
 *
 * Returns the attempt number when the caller should process the event, or null when
 * a previous delivery already finished it. Rows left in `processing` (a crash
 * mid-handler) or `failed` are re-claimed and retried — every handler below is
 * written to be safe to run twice.
 */
async function claimEvent(
  db: D1Database,
  eventId: string,
  eventType: string,
  eventCreated: number,
): Promise<{ attempts: number } | null> {
  const row = await db
    .prepare(
      `INSERT INTO stripe_webhook_events (id, type, status, event_created)
       VALUES (?, ?, 'processing', ?)
       ON CONFLICT(id) DO UPDATE SET
         attempts = stripe_webhook_events.attempts + 1,
         status = 'processing',
         updated_at = CURRENT_TIMESTAMP
       WHERE stripe_webhook_events.status IN ('processing', 'failed')
       RETURNING attempts`,
    )
    .bind(eventId, eventType, eventCreated)
    .first<{ attempts: number }>();

  return row ? { attempts: row.attempts } : null;
}

async function recordOutcome(
  db: D1Database,
  eventId: string,
  outcome: HandlerOutcome,
): Promise<void> {
  await db
    .prepare(
      `UPDATE stripe_webhook_events
       SET status = ?, tenant_id = ?, detail = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(outcome.status, outcome.tenantId ?? null, outcome.detail ?? null, eventId)
    .run();
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function dispatch(
  event: any,
  eventType: string,
  eventCreated: number,
  env: WebhookEnv,
  fetchSubscription?: SubscriptionFetcher,
): Promise<HandlerOutcome> {
  if (!HANDLED_EVENT_TYPES.has(eventType)) {
    return { status: 'ignored', detail: `unhandled event type: ${eventType}` };
  }

  if (eventType === 'checkout.session.completed') {
    return handleCheckoutCompleted(event.data?.object, eventCreated, env, fetchSubscription);
  }

  return handleSubscriptionChanged(event.data?.object, eventType, eventCreated, env);
}

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

/**
 * Links the Stripe customer/subscription to a tenant and activates the purchased tier.
 *
 * The tier comes from `metadata.planId`, which `/api/checkout` sets when it creates
 * the session. If that is missing (a session created outside our own endpoint) we
 * fall back to reading the price off the subscription via the Stripe API.
 */
async function handleCheckoutCompleted(
  session: any,
  eventCreated: number,
  env: WebhookEnv,
  fetchSubscription?: SubscriptionFetcher,
): Promise<HandlerOutcome> {
  if (!session) return { status: 'failed', detail: 'missing session object', httpStatus: 400 };

  // One-off payments do not carry a tier; only subscription checkouts matter here.
  if (session.mode && session.mode !== 'subscription') {
    return { status: 'ignored', detail: `checkout mode is ${session.mode}` };
  }

  // An unpaid session (e.g. an async bank debit still clearing) grants nothing yet.
  // Stripe follows up with `checkout.session.async_payment_succeeded`.
  if (session.payment_status && session.payment_status === 'unpaid') {
    return { status: 'ignored', detail: 'checkout session is not paid yet' };
  }

  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);

  const plan = await resolvePurchasedPlan(session, subscriptionId, fetchSubscription);
  if (!plan) {
    // Either another product on the shared Stripe account, or a price we do not know.
    return {
      status: 'ignored',
      detail: 'checkout session does not map to a SafeMetrics plan',
    };
  }

  const email = normalizeEmail(session.customer_details?.email ?? session.customer_email);
  const tenant = await resolveTenant(env.DB, {
    subscriptionId,
    customerId,
    clientReferenceId: session.client_reference_id,
    email,
  });

  if (!tenant) {
    // The purchase is real but we cannot tell whose account it belongs to. Retrying
    // will not conjure an account, so acknowledge and leave a loud ledger entry for
    // manual reconciliation rather than making Stripe retry for three days.
    const detail =
      `unresolved tenant for checkout (customer=${customerId ?? 'none'}, ` +
      `client_reference_id=${session.client_reference_id ?? 'none'}, email=${email ?? 'none'})`;
    console.error(`[stripe-webhook] ${detail}`);
    return { status: 'failed', detail, httpStatus: 200 };
  }

  if (isStale(tenant, eventCreated)) {
    return { status: 'ignored', tenantId: tenant.id, detail: 'stale event, newer state already applied' };
  }

  await applyBilling(env.DB, tenant.id, {
    plan: plan.id,
    customerId,
    subscriptionId,
    subscriptionStatus: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    eventCreated,
  });

  console.log(`[stripe-webhook] activated ${plan.id} for tenant ${tenant.id}`);
  return { status: 'processed', tenantId: tenant.id, detail: `activated ${plan.id}` };
}

async function resolvePurchasedPlan(
  session: any,
  subscriptionId: string | null,
  fetchSubscription?: SubscriptionFetcher,
) {
  // Primary: metadata we set ourselves in /api/checkout.
  const fromMetadata = planById(session.metadata?.planId);
  if (fromMetadata && fromMetadata.id !== FREE_PLAN) return fromMetadata;

  // Secondary: a price on the session, if it happens to be expanded.
  const lineItemPrice = session.line_items?.data?.[0]?.price;
  const fromLineItem = planForStripePrice(idOf(lineItemPrice), idOf(lineItemPrice?.product));
  if (fromLineItem) return fromLineItem;

  // Fallback: ask Stripe what was actually subscribed to.
  if (subscriptionId && fetchSubscription) {
    const subscription = await fetchSubscription(subscriptionId);
    const price = subscription?.items?.data?.[0]?.price;
    return planForStripePrice(idOf(price), idOf(price?.product));
  }

  return null;
}

// ---------------------------------------------------------------------------
// customer.subscription.updated / .deleted
// ---------------------------------------------------------------------------

/**
 * Syncs upgrades, downgrades, and cancellations onto the tenant record.
 *
 * The tier is derived from the subscription's current price, then gated on the
 * subscription status: a cancelled or unpaid subscription drops the tenant to the
 * free tier regardless of which price it names.
 */
async function handleSubscriptionChanged(
  subscription: any,
  eventType: string,
  eventCreated: number,
  env: WebhookEnv,
): Promise<HandlerOutcome> {
  if (!subscription) {
    return { status: 'failed', detail: 'missing subscription object', httpStatus: 400 };
  }

  const subscriptionId = idOf(subscription);
  const customerId = idOf(subscription.customer);

  const price = subscription.items?.data?.[0]?.price;
  const plan = planForStripePrice(idOf(price), idOf(price?.product));
  if (!plan) {
    return {
      status: 'ignored',
      detail: 'subscription price does not map to a SafeMetrics plan',
    };
  }

  const tenant = await resolveTenant(env.DB, { subscriptionId, customerId });
  if (!tenant) {
    // This is a SafeMetrics subscription whose checkout event has not landed yet.
    // Stripe does not guarantee ordering, so a 5xx here lets the retry succeed once
    // the linking event has been processed.
    const detail = `no tenant linked to subscription ${subscriptionId ?? 'unknown'} yet`;
    console.error(`[stripe-webhook] ${detail}`);
    return { status: 'failed', detail, httpStatus: 500 };
  }

  if (isStale(tenant, eventCreated)) {
    return { status: 'ignored', tenantId: tenant.id, detail: 'stale event, newer state already applied' };
  }

  // `.deleted` always means access ends now, whatever status the object carries.
  const status: string = eventType === 'customer.subscription.deleted'
    ? 'canceled'
    : String(subscription.status ?? 'active');

  const entitled = ENTITLED_STATUSES.has(status);
  const effectivePlan: PlanId = entitled ? plan.id : FREE_PLAN;

  // `cancel_at_period_end` means "will not renew", not "access ends now" — the tier
  // stays live until Stripe actually flips the status.
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

  await applyBilling(env.DB, tenant.id, {
    plan: effectivePlan,
    customerId,
    subscriptionId,
    subscriptionStatus: status,
    cancelAtPeriodEnd,
    currentPeriodEnd: periodEndOf(subscription),
    eventCreated,
  });

  const detail = `${tenant.plan} -> ${effectivePlan} (subscription ${status}` +
    `${cancelAtPeriodEnd ? ', cancels at period end' : ''})`;
  console.log(`[stripe-webhook] tenant ${tenant.id}: ${detail}`);

  return { status: 'processed', tenantId: tenant.id, detail };
}

// ---------------------------------------------------------------------------
// Tenant resolution and persistence
// ---------------------------------------------------------------------------

interface TenantLookup {
  subscriptionId?: string | null;
  customerId?: string | null;
  clientReferenceId?: string | null;
  email?: string | null;
}

/**
 * Finds the tenant an event belongs to, most reliable signal first.
 *
 * `client_reference_id` is checked against both tables because `/api/checkout` puts
 * the Clerk *user* id there, while older sessions used a tenant id directly.
 */
async function resolveTenant(db: D1Database, lookup: TenantLookup): Promise<TenantRow | null> {
  const selectTenant = 'SELECT id, plan, billing_event_at FROM tenants';

  if (lookup.subscriptionId) {
    const row = await db
      .prepare(`${selectTenant} WHERE stripe_subscription_id = ?`)
      .bind(lookup.subscriptionId)
      .first<TenantRow>();
    if (row) return row;
  }

  if (lookup.customerId) {
    const row = await db
      .prepare(`${selectTenant} WHERE stripe_customer_id = ?`)
      .bind(lookup.customerId)
      .first<TenantRow>();
    if (row) return row;
  }

  if (lookup.clientReferenceId) {
    const byTenantId = await db
      .prepare(`${selectTenant} WHERE id = ?`)
      .bind(lookup.clientReferenceId)
      .first<TenantRow>();
    if (byTenantId) return byTenantId;

    const byUserId = await db
      .prepare(
        `${selectTenant} WHERE id = (SELECT tenant_id FROM users WHERE id = ?)`,
      )
      .bind(lookup.clientReferenceId)
      .first<TenantRow>();
    if (byUserId) return byUserId;
  }

  if (lookup.email) {
    const byEmail = await db
      .prepare(
        `${selectTenant} WHERE id = (
           SELECT tenant_id FROM users WHERE LOWER(email) = ? ORDER BY created_at LIMIT 1
         )`,
      )
      .bind(lookup.email)
      .first<TenantRow>();
    if (byEmail) return byEmail;
  }

  return null;
}

interface BillingState {
  plan: PlanId;
  customerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  eventCreated: number;
}

/**
 * Writes billing state to the tenant.
 *
 * The `billing_event_at < ?` guard makes this safe under concurrent redelivery: if a
 * newer event won the race, this write is a no-op rather than a regression.
 * Stripe ids are coalesced so a partial event never nulls out an existing link.
 */
async function applyBilling(db: D1Database, tenantId: string, state: BillingState): Promise<void> {
  await db
    .prepare(
      `UPDATE tenants SET
         plan = ?,
         monthly_event_limit = ?,
         stripe_customer_id = COALESCE(?, stripe_customer_id),
         stripe_subscription_id = COALESCE(?, stripe_subscription_id),
         subscription_status = ?,
         cancel_at_period_end = ?,
         current_period_end = COALESCE(?, current_period_end),
         billing_event_at = ?
       WHERE id = ? AND billing_event_at <= ?`,
    )
    .bind(
      state.plan,
      eventLimitFor(state.plan),
      state.customerId,
      state.subscriptionId,
      state.subscriptionStatus,
      state.cancelAtPeriodEnd ? 1 : 0,
      state.currentPeriodEnd,
      state.eventCreated,
      tenantId,
      state.eventCreated,
    )
    .run();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stripe fields are either a bare id or an expanded object; accept both. */
function idOf(value: any): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value.id === 'string') return value.id || null;
  return null;
}

function normalizeEmail(email: any): string | null {
  return typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;
}

/** Recent API versions moved `current_period_end` onto the subscription item. */
function periodEndOf(subscription: any): number | null {
  const candidate = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
  return Number.isFinite(candidate) ? Number(candidate) : null;
}

/**
 * True when we have already applied a *strictly newer* event to this tenant.
 * Equal timestamps are allowed through so a replay stays idempotent rather than
 * being misreported as stale.
 */
function isStale(tenant: TenantRow, eventCreated: number): boolean {
  return (tenant.billing_event_at ?? 0) > eventCreated;
}

/** Default subscription fetcher backed by the Stripe REST API. */
export function createSubscriptionFetcher(secretKey: string | undefined): SubscriptionFetcher {
  return async (subscriptionId: string) => {
    if (!secretKey) return null;

    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );

    if (!response.ok) {
      console.error(`[stripe-webhook] subscription lookup failed: ${response.status}`);
      return null;
    }
    return response.json();
  };
}
