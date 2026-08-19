-- 0002_stripe_billing.sql
--
-- Adds the durable Stripe billing state the webhook needs.
--
-- This migration is deliberately additive only (ALTER TABLE ADD COLUMN + CREATE
-- TABLE). It never drops or rebuilds a table, so it cannot cascade-delete anything
-- and is safe to apply to production unattended.
--
-- The related `plan` CHECK-constraint correction is a table rebuild and lives
-- separately in 0003_fix_plan_check_constraint.sql. Apply 0003 as well, or Scale
-- purchases will be rejected by the old constraint.
--
-- Apply with:
--   wrangler d1 execute safemetrics-db --remote --file=migrations/0002_stripe_billing.sql

-- Stripe linkage on the tenant record.
ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN subscription_status TEXT;
ALTER TABLE tenants ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN current_period_end INTEGER;

-- Stripe `event.created` (unix seconds) of the last billing event applied to this
-- tenant. Stripe does not guarantee delivery order, so the webhook compares against
-- this and drops events that are older than the state we already hold.
ALTER TABLE tenants ADD COLUMN billing_event_at INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_customer
    ON tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_subscription
    ON tenants(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Idempotency + durability ledger for Stripe webhook deliveries.
--
-- Every verified event is claimed here before it is processed. Stripe redelivers on
-- any non-2xx, so the primary key on the Stripe event id is what makes a replay a
-- no-op. Terminal rows double as the failure log: nothing is silently dropped, and
-- `status`/`detail` can be queried to find events needing manual reconciliation, e.g.
--
--   SELECT * FROM stripe_webhook_events WHERE status IN ('failed','processing')
--   ORDER BY updated_at DESC;
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    -- Stripe event id, e.g. evt_1A2b3C...
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    -- processing = claimed but unfinished (a stuck row means we crashed mid-handler)
    -- processed  = applied to a tenant
    -- ignored    = intentionally not applied (another product, stale, or unsupported)
    -- failed     = handler errored; see `detail`
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK(status IN ('processing', 'processed', 'ignored', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 1,
    tenant_id TEXT,
    -- Human-readable audit note: what was applied, or why it was ignored/failed.
    detail TEXT,
    event_created INTEGER,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
    ON stripe_webhook_events(status, updated_at DESC);
