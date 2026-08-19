-- 0003_fix_plan_check_constraint.sql
--
-- Corrects the `tenants.plan` CHECK constraint.
--
-- The original schema allowed ('hobby','pro','business'), but the application has
-- always called the top tier 'scale' (see src/lib/stripe-prices.json, src/lib/stripe.ts
-- and worker/plans.ts). A Scale purchase would otherwise fail the CHECK, the webhook
-- handler would 500, and Stripe would retry the event until it gave up.
--
-- SQLite cannot alter a CHECK in place, so `tenants` has to be rebuilt.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE LOOKS OVER-BUILT
--
-- `users`, `domains` and `events` all declare
--     REFERENCES tenants(id) ON DELETE CASCADE
-- so `DROP TABLE tenants` performs an implicit DELETE FROM that fires those cascades
-- and empties all three tables.
--
-- The usual SQLite escape hatches DO NOT WORK ON D1. All three of these were run
-- against a local D1 instance seeded with one tenant, one user and one domain, and
-- all three came out with users=0, domains=0:
--
--     PRAGMA foreign_keys = OFF;        -- users 1 -> 0
--     PRAGMA defer_foreign_keys = true; -- users 1 -> 0
--     PRAGMA legacy_alter_table = ON;   -- users 1 -> 0  (rename-based rebuild)
--
-- D1 runs statements through its own layer and ignores these pragmas, so there is no
-- way to suppress the cascade. The only reliable approach is to copy the child rows
-- out, let the cascade happen, and put them back — which is what this file does.
--
-- Apply with (single file, no wrapping transaction):
--   wrangler d1 export safemetrics-db --remote --output=backup-before-0003.sql
--   wrangler d1 execute safemetrics-db --remote --file=migrations/0003_fix_plan_check_constraint.sql
--
-- Then confirm nothing was lost — these counts must match the backup:
--   wrangler d1 execute safemetrics-db --remote --command="SELECT \
--     (SELECT COUNT(*) FROM tenants) tenants, (SELECT COUNT(*) FROM users) users, \
--     (SELECT COUNT(*) FROM domains) domains, (SELECT COUNT(*) FROM events) events;"
--
-- NOTE: this stages a full copy of `events`. That table is the analytics firehose, so
-- on a busy database this needs a maintenance window and roughly double the storage
-- for the duration. Check `SELECT COUNT(*) FROM events;` before running.
-- ---------------------------------------------------------------------------

-- 1. Stage the cascade-exposed children. CREATE TABLE ... AS SELECT produces a plain
--    table with no foreign keys, so these copies survive the drop below.
DROP TABLE IF EXISTS _m0003_users;
DROP TABLE IF EXISTS _m0003_domains;
DROP TABLE IF EXISTS _m0003_events;

CREATE TABLE _m0003_users AS SELECT * FROM users;
CREATE TABLE _m0003_domains AS SELECT * FROM domains;
CREATE TABLE _m0003_events AS SELECT * FROM events;

-- 2. Rebuild `tenants` with the corrected CHECK.
DROP TABLE IF EXISTS _m0003_tenants_new;
CREATE TABLE _m0003_tenants_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'hobby' CHECK(plan IN ('hobby', 'pro', 'scale')),
    monthly_event_limit INTEGER DEFAULT 10000,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    current_period_end INTEGER,
    billing_event_at INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO _m0003_tenants_new (
    id, name, slug, plan, monthly_event_limit,
    stripe_customer_id, stripe_subscription_id, subscription_status,
    cancel_at_period_end, current_period_end, billing_event_at, created_at
)
SELECT
    id, name, slug,
    -- 'business' was the old name for what the product calls 'scale'.
    CASE plan WHEN 'business' THEN 'scale' ELSE plan END,
    monthly_event_limit,
    stripe_customer_id, stripe_subscription_id, subscription_status,
    cancel_at_period_end, current_period_end, billing_event_at, created_at
FROM tenants;

-- This empties users/domains/events via ON DELETE CASCADE. Step 1 has the copies.
DROP TABLE tenants;

ALTER TABLE _m0003_tenants_new RENAME TO tenants;

-- 3. Restore the children. Parents before dependants: `events` references `domains`.
INSERT INTO domains SELECT * FROM _m0003_domains;
INSERT INTO users SELECT * FROM _m0003_users;
INSERT INTO events SELECT * FROM _m0003_events;

DROP TABLE _m0003_users;
DROP TABLE _m0003_domains;
DROP TABLE _m0003_events;

-- 4. Indexes lived on the dropped table and must be recreated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_customer
    ON tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_subscription
    ON tenants(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
