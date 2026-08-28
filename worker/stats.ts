/**
 * Analytics queries behind `GET /api/stats`.
 *
 * Everything here is scoped to a single `domain_id`, which the caller has already
 * proven their tenant owns. Nothing in this file re-checks ownership — passing a
 * domain the caller does not own would happily return its numbers.
 *
 * Window boundaries are computed in JavaScript and bound as strings rather than
 * using SQLite's `datetime('now', ...)`. `created_at` is written by
 * `CURRENT_TIMESTAMP` as `YYYY-MM-DD HH:MM:SS` in UTC, which compares correctly
 * lexicographically, and passing the boundary in makes the queries deterministic to
 * test without freezing the clock.
 */

export type Timeframe = '24h' | '7d' | '30d' | 'all';

export const TIMEFRAMES: readonly Timeframe[] = ['24h', '7d', '30d', 'all'];

/** Hours covered by each timeframe. `all` has no boundary. */
const TIMEFRAME_HOURS: Record<Exclude<Timeframe, 'all'>, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

export function isTimeframe(value: string | null | undefined): value is Timeframe {
  return !!value && (TIMEFRAMES as readonly string[]).includes(value);
}

export interface StatsSummary {
  pageviews: number;
  visitors: number;
  /**
   * Share of sessions that viewed exactly one page, 0–1. Null when there were no
   * sessions at all — a bounce rate of 0% and "no traffic" are different claims.
   */
  bounceRate: number | null;
}

export interface SeriesPoint {
  /** `YYYY-MM-DDTHH:00` for the hourly window, `YYYY-MM-DD` otherwise. */
  bucket: string;
  views: number;
  visitors: number;
}

export interface Dimension {
  name: string;
  views: number;
  visitors: number;
}

export interface DomainStats {
  timeframe: Timeframe;
  /** Inclusive lower bound applied, or null for `all`. */
  since: string | null;
  summary: StatsSummary;
  /** The equivalent window immediately before `since`. Null for `all`. */
  previous: StatsSummary | null;
  series: SeriesPoint[];
  topPages: Dimension[];
  topReferrers: Dimension[];
  topCountries: Dimension[];
  topDevices: Dimension[];
  topBrowsers: Dimension[];
  /**
   * Metrics the UI has a slot for but the data cannot support, so the client can
   * say so instead of rendering a plausible-looking zero.
   */
  unavailable: readonly string[];
}

/**
 * Metrics with no backing data. Session duration needs the tracker to report
 * timing, which it does not; goals need a way to define and record them.
 */
export const UNAVAILABLE_METRICS = ['dwellTime', 'goals'] as const;

interface Window {
  since: string | null;
  previousSince: string | null;
}

/** Formats an epoch as the `YYYY-MM-DD HH:MM:SS` UTC form D1 stores. */
function sqlTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 19).replace('T', ' ');
}

export function windowFor(timeframe: Timeframe, nowMs: number): Window {
  if (timeframe === 'all') return { since: null, previousSince: null };
  const spanMs = TIMEFRAME_HOURS[timeframe] * 3_600_000;
  return {
    since: sqlTimestamp(nowMs - spanMs),
    previousSince: sqlTimestamp(nowMs - spanMs * 2),
  };
}

/**
 * Hourly buckets over 24 hours, daily otherwise. A month of hourly points would be
 * 720 values in a chart 500px wide.
 */
function bucketExpression(timeframe: Timeframe): string {
  return timeframe === '24h'
    ? "strftime('%Y-%m-%dT%H:00', created_at)"
    : "date(created_at)";
}

/**
 * Only pageviews count toward these numbers. Custom events go into the same table
 * with a different `event_name`, and counting them as pageviews would inflate every
 * figure on the dashboard.
 *
 * An unset `event_name` counts as a pageview: the column is nullable and only the
 * worker ever fills it, so a null means the row was written by hand or by an older
 * path. Dropping those would quietly under-report rather than fail loudly.
 */
const PAGEVIEW_FILTER = "COALESCE(event_name, 'pageview') = 'pageview'";

function rangeClause(since: string | null, until: string | null): { sql: string; args: string[] } {
  const parts: string[] = [];
  const args: string[] = [];
  if (since) {
    parts.push('created_at >= ?');
    args.push(since);
  }
  if (until) {
    parts.push('created_at < ?');
    args.push(until);
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', args };
}

async function summaryFor(
  db: D1Database,
  domainId: string,
  since: string | null,
  until: string | null,
): Promise<StatsSummary> {
  const range = rangeClause(since, until);

  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS pageviews, COUNT(DISTINCT session_hash) AS visitors
       FROM events
       WHERE domain_id = ? AND ${PAGEVIEW_FILTER}${range.sql}`,
    )
    .bind(domainId, ...range.args)
    .first<{ pageviews: number; visitors: number }>();

  // A bounce is a session that viewed exactly one page. Derived from the pageview
  // rows themselves; nothing records an explicit exit.
  const bounce = await db
    .prepare(
      `SELECT COUNT(*) AS sessions, SUM(CASE WHEN views = 1 THEN 1 ELSE 0 END) AS bounced
       FROM (
         SELECT session_hash, COUNT(*) AS views
         FROM events
         WHERE domain_id = ? AND ${PAGEVIEW_FILTER}${range.sql}
         GROUP BY session_hash
       )`,
    )
    .bind(domainId, ...range.args)
    .first<{ sessions: number; bounced: number | null }>();

  const sessions = bounce?.sessions ?? 0;

  return {
    pageviews: totals?.pageviews ?? 0,
    visitors: totals?.visitors ?? 0,
    bounceRate: sessions > 0 ? (bounce?.bounced ?? 0) / sessions : null,
  };
}

async function dimension(
  db: D1Database,
  domainId: string,
  column: 'url_path' | 'referrer' | 'country' | 'device' | 'browser',
  since: string | null,
  limit: number,
): Promise<Dimension[]> {
  const range = rangeClause(since, null);
  const { results } = await db
    .prepare(
      `SELECT ${column} AS name, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS visitors
       FROM events
       WHERE domain_id = ? AND ${PAGEVIEW_FILTER}${range.sql}
       GROUP BY ${column}
       ORDER BY views DESC, name ASC
       LIMIT ?`,
    )
    .bind(domainId, ...range.args, limit)
    .all<Dimension>();
  return results;
}

async function series(
  db: D1Database,
  domainId: string,
  timeframe: Timeframe,
  since: string | null,
): Promise<SeriesPoint[]> {
  const range = rangeClause(since, null);
  const bucket = bucketExpression(timeframe);
  const { results } = await db
    .prepare(
      `SELECT ${bucket} AS bucket, COUNT(*) AS views, COUNT(DISTINCT session_hash) AS visitors
       FROM events
       WHERE domain_id = ? AND ${PAGEVIEW_FILTER}${range.sql}
       GROUP BY bucket
       ORDER BY bucket ASC`,
    )
    .bind(domainId, ...range.args)
    .all<SeriesPoint>();
  return results;
}

export async function loadDomainStats(
  db: D1Database,
  domainId: string,
  timeframe: Timeframe,
  nowMs: number,
): Promise<DomainStats> {
  const { since, previousSince } = windowFor(timeframe, nowMs);

  const [summary, previous, points, topPages, topReferrers, topCountries, topDevices, topBrowsers] =
    await Promise.all([
      summaryFor(db, domainId, since, null),
      previousSince && since
        ? summaryFor(db, domainId, previousSince, since)
        : Promise.resolve(null),
      series(db, domainId, timeframe, since),
      dimension(db, domainId, 'url_path', since, 8),
      dimension(db, domainId, 'referrer', since, 8),
      dimension(db, domainId, 'country', since, 8),
      dimension(db, domainId, 'device', since, 5),
      dimension(db, domainId, 'browser', since, 5),
    ]);

  return {
    timeframe,
    since,
    summary,
    previous,
    series: points,
    topPages,
    topReferrers,
    topCountries,
    topDevices,
    topBrowsers,
    unavailable: UNAVAILABLE_METRICS,
  };
}
