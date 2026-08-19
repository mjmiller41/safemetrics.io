-- 0003_fix_plan_check_constraint.sql
--
-- Corrects the `tenants.plan` CHECK constraint.
--
-- The original schema allowed ('hobby','pro','business'), but the application has
-- always called the top tier 'scale' (see src/lib/stripe-prices.json, src/lib/stripe.ts
-- and worker/plans.ts). A Scale purchase would therefore be rejected by the CHECK.
-- SQLite cannot alter a CHECK in place, so `tenants` has to be rebuilt.
--
-- ---------------------------------------------------------------------------
-- WARNING — read before running.
--
-- `users`, `domains` and `events` all declare
--     REFERENCES tenants(id) ON DELETE CASCADE
-- With foreign keys enabled, `DROP TABLE tenants` performs an implicit DELETE FROM,
-- which fires those cascades and empties all three tables.
--
-- `PRAGMA defer_foreign_keys` does NOT prevent this — it defers constraint *checking*,
-- not cascade *actions*. This was verified directly: with defer_foreign_keys the
-- users table came out empty; with `PRAGMA foreign_keys = OFF` the rows survived.
--
-- So the `PRAGMA foreign_keys = OFF` below is load-bearing, and this file must be
-- executed as a single unit, outside an explicit transaction (the pragma is a no-op
-- inside one). Take a backup first:
--
--   wrangler d1 export safemetrics-db --remote --output=backup-before-0003.sql
--   wrangler d1 execute safemetrics-db --remote --file=migrations/0003_fix_plan_check_constraint.sql
--
-- Then confirm nothing was lost:
--   wrangler d1 execute safemetrics-db --remote \
--     --command="SELECT (SELECT COUNT(*) FROM tenants) AS tenants, (SELECT COUNT(*) FROM users) AS users;"
-- ---------------------------------------------------------------------------

PRAGMA foreign_keys = OFF;

CREATE TABLE tenants_rebuild_0003 (
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

INSERT INTO tenants_rebuild_0003 (
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

DROP TABLE tenants;

ALTER TABLE tenants_rebuild_0003 RENAME TO tenants;

-- Indexes live on the table, so they went with the drop and must be recreated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_customer
    ON tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_subscription
    ON tenants(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

PRAGMA foreign_keys = ON;
