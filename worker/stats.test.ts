import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { isTimeframe, loadDomainStats, windowFor } from './stats.ts';
import { createTestDatabase, type FakeD1 } from './test-support/d1-fake.ts';

/**
 * A fixed "now" so window boundaries are deterministic. Events are seeded at
 * offsets from it rather than at wall-clock time.
 */
const NOW = Date.parse('2026-08-27T12:00:00Z');
const HOUR = 3_600_000;

function sqlTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 19).replace('T', ' ');
}

function seedDomain(db: FakeD1, domainId = 'dom_acme', domainName = 'acme.test'): string {
  db.sqlite.exec(
    `INSERT INTO domains (id, tenant_id, domain_name)
     VALUES ('${domainId}', 'tenant_acme', '${domainName}')`,
  );
  return domainId;
}

let seq = 0;

interface EventSeed {
  hoursAgo?: number;
  path?: string;
  session?: string;
  referrer?: string;
  country?: string;
  device?: string;
  browser?: string;
  name?: string;
  domainId?: string;
}

function addEvent(db: FakeD1, seed: EventSeed = {}): void {
  const {
    hoursAgo = 1,
    path = '/',
    session = 'sess_a',
    referrer = 'Direct',
    country = 'US',
    device = 'Desktop',
    browser = 'Chrome',
    name = 'pageview',
    domainId = 'dom_acme',
  } = seed;

  db.sqlite
    .prepare(
      `INSERT INTO events
         (id, tenant_id, domain_id, event_type, event_name, url_path, referrer,
          country, city, device, browser, os, session_hash, created_at)
       VALUES (?, 'tenant_acme', ?, 'pageview', ?, ?, ?, ?, 'Austin', ?, ?, 'Linux', ?, ?)`,
    )
    .run(
      `evt_${seq++}`,
      domainId,
      name,
      path,
      referrer,
      country,
      device,
      browser,
      session,
      sqlTimestamp(NOW - hoursAgo * HOUR),
    );
}

describe('isTimeframe', () => {
  it('accepts the four supported windows and rejects anything else', () => {
    for (const tf of ['24h', '7d', '30d', 'all']) assert.equal(isTimeframe(tf), true);
    for (const tf of ['1h', '', null, undefined, '7D', 'DROP TABLE']) {
      assert.equal(isTimeframe(tf as any), false);
    }
  });
});

describe('windowFor', () => {
  it('puts the previous window immediately before the current one', () => {
    const { since, previousSince } = windowFor('24h', NOW);
    assert.equal(since, '2026-08-26 12:00:00');
    assert.equal(previousSince, '2026-08-25 12:00:00');
  });

  it('has no boundary for the all-time window', () => {
    assert.deepEqual(windowFor('all', NOW), { since: null, previousSince: null });
  });
});

describe('loadDomainStats', () => {
  it('reports zeroes and a null bounce rate for a domain with no events', async () => {
    const db = createTestDatabase();
    seedDomain(db);

    const stats = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);

    assert.equal(stats.summary.pageviews, 0);
    assert.equal(stats.summary.visitors, 0);
    // Not 0 — "nobody bounced" and "nobody visited" are different claims.
    assert.equal(stats.summary.bounceRate, null);
    assert.deepEqual(stats.series, []);
    assert.deepEqual(stats.topPages, []);
  });

  it('counts pageviews and distinct sessions', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    addEvent(db, { session: 'a', path: '/' });
    addEvent(db, { session: 'a', path: '/pricing' });
    addEvent(db, { session: 'b', path: '/' });

    const stats = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);

    assert.equal(stats.summary.pageviews, 3);
    assert.equal(stats.summary.visitors, 2);
  });

  it('treats a single-pageview session as a bounce', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    addEvent(db, { session: 'bounced' });
    addEvent(db, { session: 'engaged', path: '/' });
    addEvent(db, { session: 'engaged', path: '/pricing' });

    const stats = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);

    assert.equal(stats.summary.bounceRate, 0.5);
  });

  it('excludes events outside the window', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    addEvent(db, { hoursAgo: 2, session: 'inside' });
    addEvent(db, { hoursAgo: 40, session: 'outside' });

    const day = await loadDomainStats(db as any, 'dom_acme', '24h', NOW);
    assert.equal(day.summary.pageviews, 1);

    const week = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);
    assert.equal(week.summary.pageviews, 2);
  });

  it('compares against the immediately preceding window', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    // Two in the last 24h, one in the 24h before that.
    addEvent(db, { hoursAgo: 2, session: 'now_a' });
    addEvent(db, { hoursAgo: 3, session: 'now_b' });
    addEvent(db, { hoursAgo: 30, session: 'prev_a' });

    const stats = await loadDomainStats(db as any, 'dom_acme', '24h', NOW);

    assert.equal(stats.summary.pageviews, 2);
    assert.equal(stats.previous?.pageviews, 1);
  });

  it('has no previous window to compare against for all-time', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    addEvent(db, { hoursAgo: 5000 });

    const stats = await loadDomainStats(db as any, 'dom_acme', 'all', NOW);

    assert.equal(stats.summary.pageviews, 1, 'all-time includes ancient events');
    assert.equal(stats.previous, null);
    assert.equal(stats.since, null);
  });

  it('never counts another domain’s events', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    seedDomain(db, 'dom_other', 'other.test');
    addEvent(db, { session: 'mine' });
    addEvent(db, { session: 'theirs', domainId: 'dom_other' });

    const mine = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);
    assert.equal(mine.summary.pageviews, 1);

    const theirs = await loadDomainStats(db as any, 'dom_other', '7d', NOW);
    assert.equal(theirs.summary.pageviews, 1);
  });

  it('ignores custom events so they do not inflate pageviews', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    addEvent(db, { session: 'a' });
    addEvent(db, { session: 'a', name: 'signup' });

    const stats = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);

    assert.equal(stats.summary.pageviews, 1);
    assert.equal(stats.topPages.length, 1);
  });

  it('buckets hourly over 24h and daily over longer windows', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    addEvent(db, { hoursAgo: 1 });
    addEvent(db, { hoursAgo: 2 });

    const day = await loadDomainStats(db as any, 'dom_acme', '24h', NOW);
    assert.deepEqual(day.series.map((p) => p.bucket), ['2026-08-27T10:00', '2026-08-27T11:00']);

    const week = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);
    assert.deepEqual(week.series.map((p) => p.bucket), ['2026-08-27']);
    assert.equal(week.series[0].views, 2);
  });

  it('ranks each breakdown by views, descending', async () => {
    const db = createTestDatabase();
    seedDomain(db);
    addEvent(db, { path: '/', session: 'a', country: 'US', browser: 'Chrome', referrer: 'Direct' });
    addEvent(db, { path: '/', session: 'b', country: 'US', browser: 'Chrome', referrer: 'google.com' });
    addEvent(db, { path: '/pricing', session: 'c', country: 'DE', browser: 'Firefox', referrer: 'Direct' });

    const stats = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);

    assert.deepEqual(stats.topPages.map((p) => [p.name, p.views]), [['/', 2], ['/pricing', 1]]);
    assert.deepEqual(stats.topCountries.map((c) => [c.name, c.views]), [['US', 2], ['DE', 1]]);
    assert.deepEqual(stats.topBrowsers.map((b) => [b.name, b.views]), [['Chrome', 2], ['Firefox', 1]]);
    assert.deepEqual(stats.topReferrers.map((r) => [r.name, r.views]), [['Direct', 2], ['google.com', 1]]);
  });

  it('declares the metrics it cannot supply', async () => {
    const db = createTestDatabase();
    seedDomain(db);

    const stats = await loadDomainStats(db as any, 'dom_acme', '7d', NOW);

    assert.deepEqual([...stats.unavailable], ['dwellTime', 'goals']);
  });
});
