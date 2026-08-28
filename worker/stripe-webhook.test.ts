import test from 'node:test';
import assert from 'node:assert/strict';

import { computeStripeSignature } from './stripe-signature.ts';
import { processStripeWebhook, type WebhookEnv } from './stripe-webhook.ts';
import { createTestDatabase, type FakeD1 } from './test-support/d1-fake.ts';

const SECRET = 'whsec_test_ynP4vXsQZ8kL2mNbR7tGjW9cF3dH6aE1';
const NOW = 1_760_000_000;

const PRO_MONTHLY = 'price_1U6Dz4PBWBDAqxdymkxssdMb';
const SCALE_MONTHLY = 'price_1U6Dz6PBWBDAqxdyNXNm7hRO';
/** A price belonging to a sibling product on the same Stripe account. */
const OTHER_PRODUCT_PRICE = 'price_1SquigglesNotOurs';

interface TenantRow {
  id: string;
  plan: string;
  monthly_event_limit: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  cancel_at_period_end: number;
  current_period_end: number | null;
  billing_event_at: number;
}

interface LedgerRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  tenant_id: string | null;
  detail: string | null;
}

function tenant(db: FakeD1, id = 'tenant_acme'): TenantRow {
  const row = db.one<TenantRow>('SELECT * FROM tenants WHERE id = ?', id);
  assert.ok(row, `tenant ${id} should exist`);
  return row;
}

function ledger(db: FakeD1, eventId: string): LedgerRow | null {
  return db.one<LedgerRow>('SELECT * FROM stripe_webhook_events WHERE id = ?', eventId);
}

/** Signs and delivers an event, exactly as Stripe would. */
async function deliver(
  db: FakeD1,
  event: Record<string, unknown>,
  options: {
    secret?: string;
    envSecret?: string | undefined;
    signedAt?: number;
    corruptSignature?: boolean;
    fetchSubscription?: (id: string) => Promise<any | null>;
  } = {},
) {
  const rawBody = JSON.stringify(event);
  const signedAt = options.signedAt ?? NOW;

  let signature = await computeStripeSignature(rawBody, signedAt, options.secret ?? SECRET);
  if (options.corruptSignature) {
    signature = signature.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));
  }

  const env: WebhookEnv = {
    DB: db as unknown as D1Database,
    STRIPE_WEBHOOK_SECRET: 'envSecret' in options ? options.envSecret : SECRET,
  };

  return processStripeWebhook({
    rawBody,
    signatureHeader: `t=${signedAt},v1=${signature}`,
    env,
    nowSeconds: NOW,
    fetchSubscription: options.fetchSubscription,
  });
}

function checkoutEvent(overrides: Record<string, any> = {}, eventOverrides: Record<string, any> = {}) {
  return {
    id: 'evt_checkout_1',
    type: 'checkout.session.completed',
    created: NOW,
    data: {
      object: {
        id: 'cs_test_1',
        mode: 'subscription',
        payment_status: 'paid',
        customer: 'cus_acme',
        subscription: 'sub_acme',
        client_reference_id: 'user_clerk_123',
        customer_details: { email: 'owner@acme.test' },
        metadata: { planId: 'pro' },
        ...overrides,
      },
    },
    ...eventOverrides,
  };
}

function subscriptionEvent(
  overrides: Record<string, any> = {},
  eventOverrides: Record<string, any> = {},
) {
  return {
    id: 'evt_sub_1',
    type: 'customer.subscription.updated',
    created: NOW + 100,
    data: {
      object: {
        id: 'sub_acme',
        customer: 'cus_acme',
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: NOW + 2_592_000,
        items: { data: [{ price: { id: PRO_MONTHLY, product: 'prod_V6QqyssPLNeRlG' } }] },
        ...overrides,
      },
    },
    ...eventOverrides,
  };
}

/** Seeds a tenant that has already completed checkout on the Pro tier. */
function withActiveProSubscription(db: FakeD1) {
  db.sqlite.exec(`
    UPDATE tenants SET
      plan = 'pro',
      monthly_event_limit = 250000,
      stripe_customer_id = 'cus_acme',
      stripe_subscription_id = 'sub_acme',
      subscription_status = 'active',
      billing_event_at = ${NOW}
    WHERE id = 'tenant_acme';
  `);
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

test('rejects an event whose signature does not verify, without touching the database', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, checkoutEvent(), { corruptSignature: true });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'invalid_signature');
  // The critical property: an unverified event must not reach any handler.
  assert.equal(tenant(db).plan, 'hobby');
  assert.equal(ledger(db, 'evt_checkout_1'), null);
});

test('rejects an event signed with the wrong secret', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, checkoutEvent(), { secret: 'whsec_wrong_secret' });

  assert.equal(result.status, 400);
  assert.equal(tenant(db).plan, 'hobby');
});

test('answers 5xx when the endpoint secret is not configured, so Stripe retries', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, checkoutEvent(), { envSecret: undefined });

  // A missing secret is our bug, not a bad request. 5xx keeps the event alive in
  // Stripe's retry queue until the deploy is fixed.
  assert.equal(result.status, 500);
  assert.equal(result.body.error, 'webhook_not_configured');
  assert.equal(tenant(db).plan, 'hobby');
});

test('rejects a correctly signed but stale-timestamped delivery', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, checkoutEvent(), { signedAt: NOW - 7200 });

  assert.equal(result.status, 400);
  assert.equal(result.body.reason, 'timestamp_out_of_tolerance');
});

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

test('checkout.session.completed links Stripe ids and activates the purchased tier', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, checkoutEvent());

  assert.equal(result.status, 200);
  assert.equal(result.body.outcome, 'processed');

  const row = tenant(db);
  assert.equal(row.plan, 'pro');
  assert.equal(row.monthly_event_limit, 250_000);
  assert.equal(row.stripe_customer_id, 'cus_acme');
  assert.equal(row.stripe_subscription_id, 'sub_acme');
  assert.equal(row.subscription_status, 'active');
  assert.equal(row.billing_event_at, NOW);

  const entry = ledger(db, 'evt_checkout_1');
  assert.equal(entry?.status, 'processed');
  assert.equal(entry?.tenant_id, 'tenant_acme');
});

test('activates the Scale tier, which the original plan CHECK constraint forbade', async () => {
  const db = createTestDatabase();

  // Regression guard for migration 0003: before it, `plan = 'scale'` failed the
  // CHECK constraint ('hobby','pro','business') and every Scale purchase errored.
  const result = await deliver(db, checkoutEvent({ metadata: { planId: 'scale' } }));

  assert.equal(result.status, 200);
  assert.equal(tenant(db).plan, 'scale');
  assert.equal(tenant(db).monthly_event_limit, 2_500_000);
});

test('grants the tier that was paid for, not the one named in metadata', async () => {
  const db = createTestDatabase();

  // A session paying the Pro price while claiming Scale. `/api/checkout` derives
  // both from one looked-up plan so it cannot produce this any more, but metadata
  // travels through Stripe and the money is the stronger claim either way.
  const result = await deliver(
    db,
    checkoutEvent({ metadata: { planId: 'scale' } }),
    { fetchSubscription: async () => ({ items: { data: [{ price: { id: PRO_MONTHLY } }] } }) },
  );

  assert.equal(result.status, 200);
  assert.equal(tenant(db).plan, 'pro');
  assert.equal(tenant(db).monthly_event_limit, 250_000);
});

test('resolves the tenant from a Clerk user id in client_reference_id', async () => {
  const db = createTestDatabase();

  // /api/checkout puts the Clerk *user* id here, not a tenant id.
  const result = await deliver(
    db,
    checkoutEvent({ client_reference_id: 'user_clerk_123', customer_details: {} }),
  );

  assert.equal(result.body.tenantId, 'tenant_acme');
  assert.equal(tenant(db).plan, 'pro');
});

test('falls back to matching the customer email case-insensitively', async () => {
  const db = createTestDatabase();

  // Seeded user email is 'Owner@Acme.test'; Stripe reports a lowercased address.
  const result = await deliver(
    db,
    checkoutEvent({ client_reference_id: null, customer_details: { email: 'owner@acme.test' } }),
  );

  assert.equal(result.body.tenantId, 'tenant_acme');
  assert.equal(tenant(db).plan, 'pro');
});

test('reads the tier from Stripe when the session carries no planId metadata', async () => {
  const db = createTestDatabase();
  let requested: string | null = null;

  const result = await deliver(db, checkoutEvent({ metadata: {} }), {
    fetchSubscription: async (id) => {
      requested = id;
      return { items: { data: [{ price: { id: SCALE_MONTHLY, product: 'prod_V6QqyyUstlYJqe' } }] } };
    },
  });

  assert.equal(requested, 'sub_acme');
  assert.equal(result.body.outcome, 'processed');
  assert.equal(tenant(db).plan, 'scale');
});

test('ignores a checkout for a different product on the shared Stripe account', async () => {
  const db = createTestDatabase();

  // SafeMetrics shares acct_1U5ATy... with sibling products; their events arrive here
  // too and must never be applied to a SafeMetrics tenant.
  const result = await deliver(
    db,
    checkoutEvent({ metadata: { planId: 'other_product_team' } }),
    { fetchSubscription: async () => ({ items: { data: [{ price: { id: OTHER_PRODUCT_PRICE } }] } }) },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.outcome, 'ignored');
  assert.equal(tenant(db).plan, 'hobby');
  assert.equal(ledger(db, 'evt_checkout_1')?.status, 'ignored');
});

test('ignores a one-off payment checkout', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, checkoutEvent({ mode: 'payment' }));

  assert.equal(result.body.outcome, 'ignored');
  assert.equal(tenant(db).plan, 'hobby');
});

test('ignores a checkout session whose payment has not cleared', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, checkoutEvent({ payment_status: 'unpaid' }));

  assert.equal(result.body.outcome, 'ignored');
  assert.equal(tenant(db).plan, 'hobby');
});

test('acknowledges but loudly records a purchase it cannot attribute to an account', async () => {
  const db = createTestDatabase();

  const result = await deliver(
    db,
    checkoutEvent({
      client_reference_id: 'user_nobody',
      customer_details: { email: 'stranger@example.test' },
      customer: 'cus_unknown',
      subscription: 'sub_unknown',
    }),
  );

  // 200, because retrying will not make the account appear — but the ledger keeps it
  // for manual reconciliation rather than dropping it.
  assert.equal(result.status, 200);
  const entry = ledger(db, 'evt_checkout_1');
  assert.equal(entry?.status, 'failed');
  assert.match(entry?.detail ?? '', /unresolved tenant/);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('replaying an identical event is a no-op', async () => {
  const db = createTestDatabase();

  const first = await deliver(db, checkoutEvent());
  assert.equal(first.body.outcome, 'processed');

  // Simulate an operator downgrading the tenant between deliveries. A redelivery
  // must not silently re-upgrade them.
  db.sqlite.exec("UPDATE tenants SET plan = 'hobby' WHERE id = 'tenant_acme';");

  const replay = await deliver(db, checkoutEvent());

  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicate, true);
  assert.equal(tenant(db).plan, 'hobby');
  assert.equal(ledger(db, 'evt_checkout_1')?.attempts, 1);
});

test('replaying a subscription update is a no-op', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  const upgrade = subscriptionEvent({
    items: { data: [{ price: { id: SCALE_MONTHLY, product: 'prod_V6QqyyUstlYJqe' } }] },
  });

  assert.equal((await deliver(db, upgrade)).body.outcome, 'processed');
  assert.equal(tenant(db).plan, 'scale');

  const replay = await deliver(db, upgrade);
  assert.equal(replay.body.duplicate, true);
  assert.equal(tenant(db).plan, 'scale');
});

test('a failed event is retried rather than treated as a duplicate', async () => {
  const db = createTestDatabase();

  // First delivery arrives before the tenant is linked, so it fails and asks for a retry.
  const first = await deliver(db, subscriptionEvent());
  assert.equal(first.status, 500);
  assert.equal(ledger(db, 'evt_sub_1')?.status, 'failed');

  // The checkout event lands in between and links the account.
  withActiveProSubscription(db);

  const retry = await deliver(db, subscriptionEvent());
  assert.equal(retry.status, 200);
  assert.equal(retry.body.outcome, 'processed');
  assert.equal(ledger(db, 'evt_sub_1')?.attempts, 2);
});

// ---------------------------------------------------------------------------
// customer.subscription.updated
// ---------------------------------------------------------------------------

test('syncs an upgrade from Pro to Scale', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  const result = await deliver(
    db,
    subscriptionEvent({
      items: { data: [{ price: { id: SCALE_MONTHLY, product: 'prod_V6QqyyUstlYJqe' } }] },
    }),
  );

  assert.equal(result.body.outcome, 'processed');
  assert.equal(tenant(db).plan, 'scale');
  assert.equal(tenant(db).monthly_event_limit, 2_500_000);
});

test('syncs a downgrade from Scale to Pro', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);
  db.sqlite.exec("UPDATE tenants SET plan = 'scale' WHERE id = 'tenant_acme';");

  const result = await deliver(db, subscriptionEvent({ items: { data: [{ price: { id: PRO_MONTHLY } }] } }));

  assert.equal(result.body.outcome, 'processed');
  assert.equal(tenant(db).plan, 'pro');
  assert.equal(tenant(db).monthly_event_limit, 250_000);
});

test('revokes the paid tier when the subscription is cancelled', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  const result = await deliver(db, subscriptionEvent({ status: 'canceled' }));

  assert.equal(result.body.outcome, 'processed');
  assert.equal(tenant(db).plan, 'hobby');
  assert.equal(tenant(db).monthly_event_limit, 10_000);
  assert.equal(tenant(db).subscription_status, 'canceled');
  // The Stripe linkage is kept so a later resubscribe still resolves the tenant.
  assert.equal(tenant(db).stripe_customer_id, 'cus_acme');
});

test('customer.subscription.deleted revokes access regardless of the reported status', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  const result = await deliver(
    db,
    subscriptionEvent({ status: 'active' }, { id: 'evt_sub_del', type: 'customer.subscription.deleted' }),
  );

  assert.equal(result.body.outcome, 'processed');
  assert.equal(tenant(db).plan, 'hobby');
});

test('keeps the tier live when a subscription is set to cancel at period end', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  const result = await deliver(db, subscriptionEvent({ cancel_at_period_end: true }));

  assert.equal(result.body.outcome, 'processed');
  // "Will not renew" is not "access ends now" — the customer paid through the period.
  assert.equal(tenant(db).plan, 'pro');
  assert.equal(tenant(db).cancel_at_period_end, 1);
});

test('keeps the tier live while an invoice is past due', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  // Stripe is still retrying the charge; cutting access at the first failure would
  // punish customers for an expiring card.
  const result = await deliver(db, subscriptionEvent({ status: 'past_due' }));

  assert.equal(tenant(db).plan, 'pro');
  assert.equal(tenant(db).subscription_status, 'past_due');
});

test('revokes the tier once Stripe gives up and marks the subscription unpaid', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  const result = await deliver(db, subscriptionEvent({ status: 'unpaid' }));

  assert.equal(tenant(db).plan, 'hobby');
});

test('records the current period end from the subscription item', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  // Recent Stripe API versions moved current_period_end onto the item.
  const result = await deliver(
    db,
    subscriptionEvent({
      current_period_end: undefined,
      items: { data: [{ price: { id: PRO_MONTHLY }, current_period_end: NOW + 999 }] },
    }),
  );

  assert.equal(result.body.outcome, 'processed');
  assert.equal(tenant(db).current_period_end, NOW + 999);
});

test('asks Stripe to retry when a subscription has no linked tenant yet', async () => {
  const db = createTestDatabase();

  // Stripe does not guarantee ordering, so subscription.updated can beat the
  // checkout event that creates the link. A 5xx lets the retry succeed.
  const result = await deliver(db, subscriptionEvent());

  assert.equal(result.status, 500);
  assert.equal(ledger(db, 'evt_sub_1')?.status, 'failed');
  assert.match(ledger(db, 'evt_sub_1')?.detail ?? '', /no tenant linked/);
});

test('ignores a subscription for a different product on the shared account', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  const result = await deliver(
    db,
    subscriptionEvent({ items: { data: [{ price: { id: OTHER_PRODUCT_PRICE } }] } }),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.outcome, 'ignored');
  assert.equal(tenant(db).plan, 'pro');
});

// ---------------------------------------------------------------------------
// Ordering and unsupported events
// ---------------------------------------------------------------------------

test('drops an out-of-order event that is older than the state already applied', async () => {
  const db = createTestDatabase();
  withActiveProSubscription(db);

  // Newer cancellation is applied first...
  await deliver(db, subscriptionEvent({ status: 'canceled' }, { id: 'evt_new', created: NOW + 500 }));
  assert.equal(tenant(db).plan, 'hobby');

  // ...then a delayed older "active" event arrives and must not resurrect the tier.
  const stale = await deliver(
    db,
    subscriptionEvent({ status: 'active' }, { id: 'evt_old', created: NOW + 200 }),
  );

  assert.equal(stale.body.outcome, 'ignored');
  assert.equal(tenant(db).plan, 'hobby');
});

test('acknowledges unsupported event types without acting on them', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, {
    id: 'evt_invoice',
    type: 'invoice.payment_succeeded',
    created: NOW,
    data: { object: {} },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.outcome, 'ignored');
  // Still recorded, so "we never received it" and "we chose not to act" stay distinguishable.
  assert.equal(ledger(db, 'evt_invoice')?.status, 'ignored');
});

test('rejects a verified payload that is not valid JSON', async () => {
  const db = createTestDatabase();
  const rawBody = 'not json';
  const signature = await computeStripeSignature(rawBody, NOW, SECRET);

  const result = await processStripeWebhook({
    rawBody,
    signatureHeader: `t=${NOW},v1=${signature}`,
    env: { DB: db as unknown as D1Database, STRIPE_WEBHOOK_SECRET: SECRET },
    nowSeconds: NOW,
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'invalid_payload');
});

test('rejects a verified payload with no event id', async () => {
  const db = createTestDatabase();

  const result = await deliver(db, { type: 'checkout.session.completed', created: NOW, data: {} });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'invalid_event');
});
