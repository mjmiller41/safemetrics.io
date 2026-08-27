/**
 * Client for `GET /api/stats`.
 *
 * Mirrors the shapes in `worker/stats.ts`. The worker derives the tenant from the
 * token and refuses any domain it does not own, so the domain here is a request,
 * not an assertion of access.
 */

export type Timeframe = '24h' | '7d' | '30d' | 'all';

export interface StatsSummary {
  pageviews: number;
  visitors: number;
  /** 0–1, or null when there were no sessions to bounce. */
  bounceRate: number | null;
}

export interface SeriesPoint {
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
  domain: string;
  plan: string;
  domains: string[];
  timeframe: Timeframe;
  since: string | null;
  summary: StatsSummary;
  previous: StatsSummary | null;
  series: SeriesPoint[];
  topPages: Dimension[];
  topReferrers: Dimension[];
  topCountries: Dimension[];
  topDevices: Dimension[];
  topBrowsers: Dimension[];
  unavailable: string[];
}

export type StatsResult =
  | { ok: true; stats: DomainStats }
  | { ok: false; reason: 'no_domains' | 'not_owned' | 'unauthorized' | 'failed' };

export async function fetchStats(
  token: string,
  domain: string,
  timeframe: Timeframe,
): Promise<StatsResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/stats?domain=${encodeURIComponent(domain)}&timeframe=${timeframe}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    return { ok: false, reason: 'failed' };
  }

  if (response.ok) {
    return { ok: true, stats: (await response.json()) as DomainStats };
  }

  // Each of these means something different to the person looking at the screen, so
  // they are kept apart rather than collapsed into one "no data" state.
  if (response.status === 404) return { ok: false, reason: 'no_domains' };
  if (response.status === 403) return { ok: false, reason: 'not_owned' };
  if (response.status === 401 || response.status === 503) {
    return { ok: false, reason: 'unauthorized' };
  }
  return { ok: false, reason: 'failed' };
}

/** `1234` → `1,234`. */
export function formatCount(value: number): string {
  return value.toLocaleString();
}

/** `0.318` → `31.8%`. Null stays null so the caller can say "no data". */
export function formatPercent(value: number | null): string | null {
  return value === null ? null : `${(value * 100).toFixed(1)}%`;
}

export interface Delta {
  label: string;
  /** True when the change is good news, which is inverted for bounce rate. */
  positive: boolean;
}

/**
 * Percentage change against the previous window. Returns null when there is nothing
 * to compare against — a first week of data has no "vs last week".
 */
export function deltaFor(
  current: number,
  previous: number | null | undefined,
  opts: { suffix: string; lowerIsBetter?: boolean },
): Delta | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) {
    if (current === 0) return null;
    return { label: `new ${opts.suffix}`, positive: !opts.lowerIsBetter };
  }

  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0) return { label: `no change ${opts.suffix}`, positive: true };

  const rising = rounded > 0;
  return {
    label: `${rising ? '+' : ''}${rounded}% ${opts.suffix}`,
    positive: opts.lowerIsBetter ? !rising : rising,
  };
}

/**
 * Builds the SVG line and area paths for the traffic chart.
 *
 * The y-scale starts at zero rather than at the minimum: on small numbers an
 * auto-fitted baseline turns "3 views vs 4 views" into a dramatic cliff.
 */
export function chartPaths(
  values: number[],
  width = 500,
  height = 120,
  padY = 12,
): { line: string; area: string } | null {
  if (!values.length) return null;

  const max = Math.max(...values, 1);
  const usable = height - padY * 2;
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width);
  const y = (v: number) => padY + usable - (v / max) * usable;

  if (values.length === 1) {
    // One bucket has no line to draw; render it as a flat span so the card is not empty.
    const only = y(values[0]);
    return {
      line: `M 0,${only} L ${width},${only}`,
      area: `M 0,${only} L ${width},${only} L ${width},${height} L 0,${height} Z`,
    };
  }

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  return { line, area };
}

/** `2026-08-27` → `Aug 27`; `2026-08-27T14:00` → `14:00`. */
export function formatBucket(bucket: string): string {
  if (bucket.includes('T')) return bucket.slice(11);
  const date = new Date(`${bucket}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return bucket;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
