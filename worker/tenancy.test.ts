import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { claimDomain, ensureTenantForUser, findDomain, listDomains, normalizeDomain } from './tenancy.ts';
import { createTestDatabase } from './test-support/d1-fake.ts';

const identity = (overrides: Record<string, unknown> = {}) => ({
  sub: 'user_new',
  email: 'new@acme.test',
  name: 'New User',
  orgId: null,
  ...overrides,
}) as any;

describe('ensureTenantForUser', () => {
  it('provisions a tenant and an owner row on first sight', async () => {
    const db = createTestDatabase();
    const context = await ensureTenantForUser(db as any, identity());

    assert.equal(context.provisioned, true);
    assert.equal(context.plan, 'hobby');

    const user = db.one<{ tenant_id: string; email: string; role: string }>(
      'SELECT tenant_id, email, role FROM users WHERE id = ?',
      'user_new',
    );
    assert.equal(user?.tenant_id, context.tenantId);
    assert.equal(user?.email, 'new@acme.test');
    assert.equal(user?.role, 'owner');
  });

  it('is idempotent — a second request reuses the tenant instead of creating another', async () => {
    const db = createTestDatabase();
    const first = await ensureTenantForUser(db as any, identity());
    const second = await ensureTenantForUser(db as any, identity());

    assert.equal(second.tenantId, first.tenantId);
    assert.equal(second.provisioned, false);
    assert.equal(db.query('SELECT id FROM tenants').length, 2); // the seeded one plus ours
  });

  it('gives unrelated users separate tenants', async () => {
    const db = createTestDatabase();
    const a = await ensureTenantForUser(db as any, identity({ sub: 'user_a' }));
    const b = await ensureTenantForUser(db as any, identity({ sub: 'user_b' }));
    assert.notEqual(a.tenantId, b.tenantId);
  });

  it('puts members of the same Clerk organization in one tenant', async () => {
    const db = createTestDatabase();
    const a = await ensureTenantForUser(db as any, identity({ sub: 'user_a', orgId: 'org_acme' }));
    const b = await ensureTenantForUser(db as any, identity({ sub: 'user_b', orgId: 'org_acme' }));
    assert.equal(a.tenantId, b.tenantId);
  });

  it('reports the existing tenant plan for an already-provisioned user', async () => {
    const db = createTestDatabase();
    db.sqlite.exec("UPDATE tenants SET plan = 'pro' WHERE id = 'tenant_acme'");

    const context = await ensureTenantForUser(db as any, identity({ sub: 'user_clerk_123' }));
    assert.equal(context.tenantId, 'tenant_acme');
    assert.equal(context.plan, 'pro');
    assert.equal(context.provisioned, false);
  });

  it('is the row the Stripe webhook resolves a checkout against', async () => {
    const db = createTestDatabase();
    const context = await ensureTenantForUser(db as any, identity({ sub: 'user_buyer' }));

    // Mirrors resolveTenant()'s client_reference_id -> users.id lookup.
    const resolved = db.one<{ id: string }>(
      'SELECT id FROM tenants WHERE id = (SELECT tenant_id FROM users WHERE id = ?)',
      'user_buyer',
    );
    assert.equal(resolved?.id, context.tenantId);
  });
});

describe('claimDomain', () => {
  it('registers a normalised domain to the tenant', async () => {
    const db = createTestDatabase();
    const claim = await claimDomain(db as any, 'tenant_acme', 'https://WWW.Example.com/pricing');

    assert.equal(claim.ok && claim.created, true);
    assert.equal(claim.ok && claim.domain.domain_name, 'example.com');
    assert.deepEqual(
      (await listDomains(db as any, 'tenant_acme')).map((d) => d.domain_name),
      ['example.com'],
    );
  });

  it('is idempotent for the owning tenant', async () => {
    const db = createTestDatabase();
    await claimDomain(db as any, 'tenant_acme', 'example.com');
    const again = await claimDomain(db as any, 'tenant_acme', 'example.com');

    assert.equal(again.ok && again.created, false);
    assert.equal(db.query('SELECT id FROM domains').length, 1);
  });

  it('refuses a domain another tenant already owns', async () => {
    const db = createTestDatabase();
    db.sqlite.exec("INSERT INTO tenants (id, name, slug) VALUES ('tenant_other', 'Other', 'other')");
    await claimDomain(db as any, 'tenant_other', 'example.com');

    assert.deepEqual(await claimDomain(db as any, 'tenant_acme', 'example.com'), {
      ok: false,
      reason: 'taken',
    });
  });

  it('rejects junk input', async () => {
    const db = createTestDatabase();
    for (const bad of ['', 'localhost', 'not a domain', 'http://', '::1']) {
      const claim = await claimDomain(db as any, 'tenant_acme', bad);
      assert.deepEqual(claim, { ok: false, reason: 'invalid_domain' }, `expected ${bad} to be rejected`);
    }
  });
});

describe('findDomain', () => {
  it('matches the hostname the beacon reports, however it is written', async () => {
    const db = createTestDatabase();
    await claimDomain(db as any, 'tenant_acme', 'example.com');

    for (const variant of ['example.com', 'EXAMPLE.com', 'www.example.com', 'https://example.com/x']) {
      const found = await findDomain(db as any, variant);
      assert.equal(found?.tenant_id, 'tenant_acme', `expected ${variant} to resolve`);
    }
    assert.equal(await findDomain(db as any, 'unregistered.test'), null);
  });
});

describe('normalizeDomain', () => {
  it('reduces equivalent spellings to one hostname', () => {
    assert.equal(normalizeDomain('  HTTPS://WWW.Example.com:8443/a/b?c=1 '), 'example.com');
    assert.equal(normalizeDomain('example.com.'), 'example.com');
    assert.equal(normalizeDomain('sub.example.co.uk'), 'sub.example.co.uk');
  });

  it('returns null for values that are not hostnames', () => {
    for (const bad of [null, undefined, '', ' ', 'localhost', 'exa mple.com', '-example.com', 'example']) {
      assert.equal(normalizeDomain(bad as any), null, `expected ${String(bad)} to be rejected`);
    }
  });
});
