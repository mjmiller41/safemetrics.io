/**
 * Monthly ingestion quota.
 *
 * `tenants.monthly_event_limit` was written on every tenant from the start but
 * never read, so every plan was unlimited in practice. This enforces it.
 *
 * The check is deliberately soft: two beacons arriving at once can both pass a
 * check that only one of them should have. Making it exact would need a
 * transaction on the hot ingestion path, and the cost of being a handful of events
 * over a monthly ceiling is nil.
 */

export interface DomainQuota {
  domainId: string;
  tenantId: string;
  monthlyEventLimit: number;
  used: number;
}

/** `YYYY-MM` in UTC. Billing months are the same for every tenant. */
export function usagePeriod(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

/**
 * Resolves a beacon's domain to its tenant, plan ceiling, and usage so far, in one
 * query. Returns null when the domain is not registered.
 *
 * Ingestion is unauthenticated and runs on every pageview of every customer site,
 * so this is the whole read path — a separate lookup per fact would multiply the
 * busiest query in the system.
 */
export async function loadDomainQuota(
  db: D1Database,
  domainName: string,
  period: string,
): Promise<DomainQuota | null> {
  const row = await db
    .prepare(
      `SELECT d.id AS domain_id,
              d.tenant_id AS tenant_id,
              t.monthly_event_limit AS monthly_event_limit,
              COALESCE(u.events, 0) AS used
       FROM domains d
       JOIN tenants t ON t.id = d.tenant_id
       LEFT JOIN tenant_usage u ON u.tenant_id = d.tenant_id AND u.period = ?
       WHERE d.domain_name = ?`,
    )
    .bind(period, domainName)
    .first<{ domain_id: string; tenant_id: string; monthly_event_limit: number; used: number }>();

  if (!row) return null;

  return {
    domainId: row.domain_id,
    tenantId: row.tenant_id,
    monthlyEventLimit: row.monthly_event_limit,
    used: row.used,
  };
}

/** True when this tenant has already used its allowance for the period. */
export function isOverQuota(quota: DomainQuota): boolean {
  // A limit of 0 or below is treated as unmetered rather than as "reject
  // everything", so a misconfigured tenant keeps collecting instead of going dark.
  if (!quota.monthlyEventLimit || quota.monthlyEventLimit <= 0) return false;
  return quota.used >= quota.monthlyEventLimit;
}

/** Adds one to the tenant's count for the period, creating the row on first use. */
export function recordUsage(db: D1Database, tenantId: string, period: string): Promise<unknown> {
  return db
    .prepare(
      `INSERT INTO tenant_usage (tenant_id, period, events, updated_at)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(tenant_id, period)
       DO UPDATE SET events = events + 1, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(tenantId, period)
    .run();
}
