-- 0005_tenant_usage.sql
--
-- Per-tenant, per-month ingestion counter.
--
-- `tenants.monthly_event_limit` has existed since the first schema but nothing
-- ever read it, so every plan was effectively unlimited and the free tier had no
-- ceiling. Enforcing it needs a running count.
--
-- A counter rather than `SELECT COUNT(*) FROM events`: the count would run on
-- every single beacon hit and grow more expensive exactly as a site gets busier,
-- which is the moment it can least afford it. This is one indexed upsert instead.
--
-- `period` is `YYYY-MM` in UTC. Rows are kept rather than cleared so past months
-- stay auditable against invoices.
--
-- Additive and non-destructive.
CREATE TABLE IF NOT EXISTS tenant_usage (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    events INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, period)
);
