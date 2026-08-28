import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { isOverQuota, loadDomainQuota, recordUsage, usagePeriod } from './quota.ts';
import { claimDomain } from './tenancy.ts';
import { createTestDatabase, type FakeD1 } from './test-support/d1-fake.ts';

const PERIOD = '2026-08';

async function seed(limit: number): Promise<FakeD1> {
  const db = createTestDatabase();
  db.sqlite.prepare('UPDATE tenants SET monthly_event_limit = ? WHERE id = ?').run(limit, 'tenant_acme');
  await claimDomain(db as any, 'tenant_acme', 'acme.test');
  return db;
}

describe('usagePeriod', () => {
  it('is the UTC calendar month', () => {
    assert.equal(usagePeriod(Date.parse('2026-08-27T23:59:59Z')), '2026-08');
    assert.equal(usagePeriod(Date.parse('2026-09-01T00:00:00Z')), '2026-09');
  });
});

describe('loadDomainQuota', () => {
  it('returns null for a domain nobody registered', async () => {
    const db = await seed(10);
    assert.equal(await loadDomainQuota(db as any, 'not-registered.test', PERIOD), null);
  });

  it('resolves the domain, tenant and ceiling with no usage recorded yet', async () => {
    const db = await seed(500);
    const quota = (await loadDomainQuota(db as any, 'acme.test', PERIOD))!;

    assert.equal(quota.tenantId, 'tenant_acme');
    assert.equal(quota.monthlyEventLimit, 500);
    assert.equal(quota.used, 0, 'a tenant with no usage row reads as zero, not null');
    assert.equal(isOverQuota(quota), false);
  });

  it('counts only the period asked for', async () => {
    const db = await seed(500);
    await recordUsage(db as any, 'tenant_acme', PERIOD);
    await recordUsage(db as any, 'tenant_acme', PERIOD);
    await recordUsage(db as any, 'tenant_acme', '2026-07');

    assert.equal((await loadDomainQuota(db as any, 'acme.test', PERIOD))!.used, 2);
    assert.equal((await loadDomainQuota(db as any, 'acme.test', '2026-07'))!.used, 1);
    assert.equal(
      (await loadDomainQuota(db as any, 'acme.test', '2026-09'))!.used,
      0,
      'a new month starts the allowance again',
    );
  });
});

describe('isOverQuota', () => {
  it('blocks once usage reaches the ceiling, not after it passes', async () => {
    const db = await seed(2);
    await recordUsage(db as any, 'tenant_acme', PERIOD);
    assert.equal(isOverQuota((await loadDomainQuota(db as any, 'acme.test', PERIOD))!), false);

    await recordUsage(db as any, 'tenant_acme', PERIOD);
    assert.equal(isOverQuota((await loadDomainQuota(db as any, 'acme.test', PERIOD))!), true);
  });

  it('treats a missing or zero limit as unmetered rather than as reject-everything', () => {
    const base = { domainId: 'd', tenantId: 't', used: 9_999_999 };
    assert.equal(isOverQuota({ ...base, monthlyEventLimit: 0 }), false);
    assert.equal(isOverQuota({ ...base, monthlyEventLimit: null as any }), false);
  });
});

describe('recordUsage', () => {
  it('creates the row on first use and increments thereafter', async () => {
    const db = await seed(100);

    await recordUsage(db as any, 'tenant_acme', PERIOD);
    assert.equal(
      db.one<{ events: number }>(
        'SELECT events FROM tenant_usage WHERE tenant_id = ? AND period = ?', 'tenant_acme', PERIOD,
      )!.events,
      1,
    );

    await recordUsage(db as any, 'tenant_acme', PERIOD);
    await recordUsage(db as any, 'tenant_acme', PERIOD);
    assert.equal(
      db.one<{ events: number }>(
        'SELECT events FROM tenant_usage WHERE tenant_id = ? AND period = ?', 'tenant_acme', PERIOD,
      )!.events,
      3,
    );
  });
});
