/**
 * Tenant provisioning and ownership checks.
 *
 * Every authenticated caller is backed by a row in `users` keyed on their Clerk user
 * id. That row is what makes a Stripe purchase attributable: `/api/checkout` sends
 * the Clerk user id as `client_reference_id`, and the webhook resolves it back to a
 * tenant through this table (see `resolveTenant` in `stripe-webhook.ts`). Before
 * this existed, `users` was never written to and every completed checkout ended up
 * as `unresolved tenant`.
 */

import { FREE_PLAN, eventLimitFor } from './plans.ts';

export interface ClerkIdentity {
  sub: string;
  email: string | null;
  name: string | null;
  orgId: string | null;
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  plan: string;
  monthlyEventLimit: number;
  /** True when this request is what created the tenant. */
  provisioned: boolean;
}

interface UserRow {
  id: string;
  tenant_id: string;
}

interface TenantRow {
  id: string;
  plan: string;
  monthly_event_limit: number;
}

/**
 * Returns the caller's tenant, creating it on first sight.
 *
 * A Clerk organization is the tenant when the session carries one, so teammates
 * signing in under the same org land in the same workspace instead of each getting a
 * private one. Personal sessions get a tenant derived from the user id.
 */
export async function ensureTenantForUser(
  db: D1Database,
  identity: ClerkIdentity,
): Promise<TenantContext> {
  const existing = await db
    .prepare('SELECT id, tenant_id FROM users WHERE id = ?')
    .bind(identity.sub)
    .first<UserRow>();

  if (existing) {
    const tenant = await loadTenant(db, existing.tenant_id);
    if (tenant) {
      return {
        tenantId: tenant.id,
        userId: existing.id,
        plan: tenant.plan,
        monthlyEventLimit: tenant.monthly_event_limit,
        provisioned: false,
      };
    }
    // The user row outlived its tenant (manual deletion). Re-provision rather than
    // 500 on every subsequent request.
    await db.prepare('DELETE FROM users WHERE id = ?').bind(identity.sub).run();
  }

  const tenantId = tenantIdFor(identity);
  const name = workspaceNameFor(identity);

  await db
    .prepare(
      `INSERT INTO tenants (id, name, slug, plan, monthly_event_limit)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(tenantId, name, slugFor(tenantId), FREE_PLAN, eventLimitFor(FREE_PLAN))
    .run();

  await db
    .prepare(
      `INSERT INTO users (id, tenant_id, email, full_name, role)
       VALUES (?, ?, ?, ?, 'owner')
       ON CONFLICT(id) DO UPDATE SET tenant_id = excluded.tenant_id`,
    )
    .bind(identity.sub, tenantId, identity.email ?? `${identity.sub}@users.noreply.clerk`, identity.name)
    .run();

  const tenant = await loadTenant(db, tenantId);

  return {
    tenantId,
    userId: identity.sub,
    plan: tenant?.plan ?? FREE_PLAN,
    monthlyEventLimit: tenant?.monthly_event_limit ?? eventLimitFor(FREE_PLAN),
    provisioned: true,
  };
}

async function loadTenant(db: D1Database, tenantId: string): Promise<TenantRow | null> {
  return db
    .prepare('SELECT id, plan, monthly_event_limit FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<TenantRow>();
}

export interface DomainRow {
  id: string;
  domain_name: string;
  tenant_id: string;
}

export async function listDomains(db: D1Database, tenantId: string): Promise<DomainRow[]> {
  const { results } = await db
    .prepare('SELECT id, domain_name, tenant_id FROM domains WHERE tenant_id = ? ORDER BY created_at')
    .bind(tenantId)
    .all<DomainRow>();
  return results;
}

export type DomainClaim =
  | { ok: true; domain: DomainRow; created: boolean }
  | { ok: false; reason: 'invalid_domain' | 'taken' };

/**
 * Registers a domain to a tenant.
 *
 * Domain names are globally unique (migration 0004): analytics are keyed on the
 * hostname the beacon reports, so two tenants claiming the same hostname would make
 * every event ambiguous. A second claim is rejected rather than silently shared.
 */
export async function claimDomain(
  db: D1Database,
  tenantId: string,
  rawDomain: string,
): Promise<DomainClaim> {
  const domainName = normalizeDomain(rawDomain);
  if (!domainName) return { ok: false, reason: 'invalid_domain' };

  const existing = await db
    .prepare('SELECT id, domain_name, tenant_id FROM domains WHERE domain_name = ?')
    .bind(domainName)
    .first<DomainRow>();

  if (existing) {
    if (existing.tenant_id !== tenantId) return { ok: false, reason: 'taken' };
    return { ok: true, domain: existing, created: false };
  }

  const id = `dom_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await db
    .prepare('INSERT INTO domains (id, tenant_id, domain_name) VALUES (?, ?, ?)')
    .bind(id, tenantId, domainName)
    .run();

  return { ok: true, domain: { id, domain_name: domainName, tenant_id: tenantId }, created: true };
}

/** Looks up a domain by hostname, whoever owns it. */
export async function findDomain(db: D1Database, rawDomain: string): Promise<DomainRow | null> {
  const domainName = normalizeDomain(rawDomain);
  if (!domainName) return null;
  return db
    .prepare('SELECT id, domain_name, tenant_id FROM domains WHERE domain_name = ?')
    .bind(domainName)
    .first<DomainRow>();
}

/**
 * Normalises user input into a bare hostname: accepts `https://Example.com/path`,
 * `example.com.`, or `www.example.com` and returns a lowercase registrable host.
 * Returns null for anything that is not a plausible hostname.
 */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;

  if (value.includes('://')) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  } else {
    value = value.split('/')[0];
  }

  value = value.replace(/\.+$/, '');
  if (value.startsWith('www.')) value = value.slice(4);
  // Strip an explicit port, which is never part of the identity of a site here.
  value = value.replace(/:\d+$/, '');

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) {
    return null;
  }
  if (value.length > 253) return null;

  return value;
}

function tenantIdFor(identity: ClerkIdentity): string {
  const source = identity.orgId ?? identity.sub;
  return `tenant_${source.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`;
}

function slugFor(tenantId: string): string {
  return tenantId.replace(/^tenant_/, '').toLowerCase();
}

function workspaceNameFor(identity: ClerkIdentity): string {
  if (identity.orgId) return 'Team Workspace';
  if (identity.name) return `${identity.name}'s Workspace`;
  if (identity.email) return `${identity.email.split('@')[0]}'s Workspace`;
  return 'My Workspace';
}
