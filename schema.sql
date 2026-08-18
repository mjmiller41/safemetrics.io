-- SafeMetrics Multi-Tenant Production Schema (Cloudflare D1)

-- 1. Tenants / Workspaces
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'hobby' CHECK(plan IN ('hobby', 'pro', 'business')),
    monthly_event_limit INTEGER DEFAULT 10000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users / Team Memberships
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'admin' CHECK(role IN ('owner', 'admin', 'member', 'viewer')),
    api_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Websites & Tracked Domains
CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain_name TEXT NOT NULL,
    is_public INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, domain_name)
);

-- 4. Anonymized Ingestion Events
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    event_type TEXT DEFAULT 'pageview',
    event_name TEXT,
    url_path TEXT NOT NULL,
    referrer TEXT,
    country TEXT,
    city TEXT,
    device TEXT,
    browser TEXT,
    os TEXT,
    session_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Performance Indexes for Real-Time Aggregations
CREATE INDEX IF NOT EXISTS idx_events_domain_time ON events(domain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_tenant_time ON events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domains_lookup ON domains(domain_name);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
