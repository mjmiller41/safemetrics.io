/**
 * The real analytics dashboard, at `/stats`.
 *
 * Everything here is live data or an honest gap — there are no demo figures. The
 * marketing page keeps its own simulated dashboard; mixing the two on one screen
 * would leave no way to tell which numbers were real.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowUpRight, BarChart2, Clock, Eye, Globe, Layers, LogIn, Sparkles, Users,
} from 'lucide-react';

import { fetchAccount } from '../lib/account';
import {
  chartPaths, deltaFor, fetchStats, formatBucket, formatCount, formatPercent,
  type DomainStats, type Timeframe,
} from '../lib/stats';

const TIMEFRAMES: readonly Timeframe[] = ['24h', '7d', '30d', 'all'];

type TabId = 'routes' | 'sources' | 'geo' | 'tech' | 'goals';
const TABS: readonly TabId[] = ['routes', 'sources', 'geo', 'tech', 'goals'];

type StatsState =
  | { kind: 'loading' }
  | { kind: 'ready'; stats: DomainStats }
  | { kind: 'error'; reason: 'no_domains' | 'not_owned' | 'unauthorized' | 'failed' };

interface StatsPageProps {
  isSignedIn: boolean;
  getToken?: () => Promise<string | null>;
}

/**
 * Bar width as a share of the largest row, not of the total. Against a total, a
 * realistic long tail renders every bar as an invisible sliver.
 */
function barWidth(value: number, rows: { views: number }[]): number {
  const max = Math.max(...rows.map(r => r.views), 1);
  return Math.round((value / max) * 100);
}

/** `US` → `United States`. Falls back to the raw value for `Unknown` and the like. */
function countryName(code: string): string {
  if (!code || code.length !== 2) return code || 'Unknown';
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Thins axis labels to at most 7 so they cannot overlap on a narrow chart. */
function axisLabels(all: string[]): string[] {
  if (all.length <= 7) return all;
  const step = (all.length - 1) / 6;
  return Array.from({ length: 7 }, (_, i) => all[Math.round(i * step)]);
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg bg-cosmic-950/70 border border-slate-800/80 text-xs text-slate-500 text-center">
      {children}
    </div>
  );
}

function Tile({ label, icon, value, caption, captionTone = 'good' }: {
  label: string;
  icon: React.ReactNode;
  value: string;
  caption: string;
  captionTone?: 'good' | 'bad' | 'muted';
}) {
  const tone = captionTone === 'bad' ? 'text-amber-400'
    : captionTone === 'muted' ? 'text-slate-500'
    : 'text-emerald-400';
  return (
    <div className="p-4 rounded-xl bg-cosmic-950/80 border border-cyan-500/15">
      <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-extrabold text-white">{value}</div>
      <div className={`text-[11px] mt-1 font-medium ${tone}`}>{caption}</div>
    </div>
  );
}

export default function StatsPage({ isSignedIn, getToken }: StatsPageProps) {
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');
  const [activeTab, setActiveTab] = useState<TabId>('routes');
  const [state, setState] = useState<StatsState>({ kind: 'loading' });

  // Kept in a ref so a token refresh cannot retrigger the effects below and reset
  // the visitor's chosen site mid-read.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Which sites this account owns. Also what provisions the tenant on first visit.
  useEffect(() => {
    const mintToken = getTokenRef.current;
    if (!isSignedIn || !mintToken) return;
    let cancelled = false;

    (async () => {
      const token = await mintToken();
      if (cancelled || !token) return;
      const account = await fetchAccount(token);
      if (cancelled || !account) return;

      setDomains(account.domains);
      setSelectedDomain(current => current || account.domains[0] || '');
      if (!account.domains.length) setState({ kind: 'error', reason: 'no_domains' });
    })();

    return () => { cancelled = true; };
  }, [isSignedIn]);

  useEffect(() => {
    const mintToken = getTokenRef.current;
    if (!isSignedIn || !mintToken || !selectedDomain) return;
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      const token = await mintToken();
      if (cancelled) return;
      if (!token) {
        setState({ kind: 'error', reason: 'unauthorized' });
        return;
      }

      const result = await fetchStats(token, selectedDomain, timeframe);
      if (cancelled) return;
      setState(result.ok
        ? { kind: 'ready', stats: result.stats }
        : { kind: 'error', reason: result.reason });
    })();

    return () => { cancelled = true; };
  }, [isSignedIn, selectedDomain, timeframe]);

  if (!isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <LogIn className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Sign in to see your stats</h1>
        <p className="text-sm text-slate-400">
          Analytics are scoped to the account that owns the site, so this page needs you
          signed in. Use the Log In button above.
        </p>
      </div>
    );
  }

  const stats = state.kind === 'ready' ? state.stats : null;
  const chart = stats ? chartPaths(stats.series.map(p => p.views)) : null;
  const labels = stats ? axisLabels(stats.series.map(p => formatBucket(p.bucket))) : [];

  const visitorDelta = stats ? deltaFor(stats.summary.visitors, stats.previous?.visitors, { suffix: 'vs previous' }) : null;
  const viewDelta = stats ? deltaFor(stats.summary.pageviews, stats.previous?.pageviews, { suffix: 'vs previous' }) : null;
  const bounceDelta = stats && stats.summary.bounceRate !== null
    ? deltaFor(stats.summary.bounceRate, stats.previous?.bounceRate, { suffix: 'vs previous', lowerIsBetter: true })
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Your stats</h1>
          <p className="text-xs text-slate-400 mt-1">
            Live data for the sites this account owns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-cosmic-950 border border-slate-800 rounded-lg p-1">
            <Globe className="w-4 h-4 text-cyan-400 ml-2" />
            <select
              value={selectedDomain}
              onChange={e => setSelectedDomain(e.target.value)}
              disabled={!domains.length}
              className="bg-transparent text-sm font-semibold text-white focus:outline-none pr-3 cursor-pointer disabled:cursor-not-allowed"
            >
              {!domains.length && <option value="">No sites yet</option>}
              {domains.map(d => (
                <option key={d} value={d} className="bg-cosmic-900 text-slate-200">{d}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-cosmic-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded transition uppercase ${
                  timeframe === tf
                    ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {state.kind === 'loading' && <Panel>Loading…</Panel>}

      {state.kind === 'error' && (
        <Panel>
          {state.reason === 'no_domains' && (
            <>No sites registered yet. Use <strong className="text-slate-300">Add Website</strong> above, then put the snippet on it.</>
          )}
          {state.reason === 'not_owned' && 'That site belongs to another account.'}
          {state.reason === 'unauthorized' && 'Your session expired. Sign in again.'}
          {state.reason === 'failed' && 'Could not load stats. Try again shortly.'}
        </Panel>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Tile
              label="Unique Sessions"
              icon={<Users className="w-4 h-4 text-cyan-400" />}
              value={formatCount(stats.summary.visitors)}
              caption={visitorDelta?.label ?? 'no prior window'}
              captionTone={visitorDelta ? (visitorDelta.positive ? 'good' : 'bad') : 'muted'}
            />
            <Tile
              label="Pageviews"
              icon={<Eye className="w-4 h-4 text-indigo-400" />}
              value={formatCount(stats.summary.pageviews)}
              caption={viewDelta?.label ?? 'no prior window'}
              captionTone={viewDelta ? (viewDelta.positive ? 'good' : 'bad') : 'muted'}
            />
            <Tile
              label="Bounce Rate"
              icon={<BarChart2 className="w-4 h-4 text-teal-400" />}
              value={formatPercent(stats.summary.bounceRate) ?? '—'}
              caption={bounceDelta?.label ?? (stats.summary.bounceRate === null ? 'no sessions yet' : 'no prior window')}
              captionTone={bounceDelta ? (bounceDelta.positive ? 'good' : 'bad') : 'muted'}
            />
            {/* Dwell needs per-visit timing the tracker does not collect. */}
            <Tile
              label="Mean Session Dwell"
              icon={<Clock className="w-4 h-4 text-cyan-400" />}
              value="Not tracked"
              caption="needs page timing"
              captionTone="muted"
            />
          </div>

          <div className="mb-8 p-5 rounded-xl bg-cosmic-950/90 border border-slate-800">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Traffic</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {timeframe === '24h' ? 'hourly' : 'daily'} &bull; Zero PII
              </span>
            </div>

            <div className="h-44 w-full relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="statsArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="statsLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#818cf8" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <line x1="0" y1="90" x2="500" y2="90" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                {chart && <path d={chart.area} fill="url(#statsArea)" />}
                {chart && <path d={chart.line} fill="none" stroke="url(#statsLine)" strokeWidth="3" strokeLinecap="round" />}
              </svg>

              {!chart && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                  No pageviews in this window yet.
                </div>
              )}
            </div>

            {/* Omitted entirely when empty, or the top border draws a stray rule under
                an already-empty chart. */}
            {labels.length > 0 && (
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-2 pt-2 border-t border-slate-850">
                {labels.map((label, i) => <span key={`${label}-${i}`}>{label}</span>)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4 text-xs font-semibold">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg transition capitalize flex items-center gap-1.5 ${
                  activeTab === tab
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'routes' && <Layers className="w-3.5 h-3.5" />}
                {tab === 'sources' && <ArrowUpRight className="w-3.5 h-3.5" />}
                {tab === 'geo' && <Globe className="w-3.5 h-3.5" />}
                {tab === 'tech' && <BarChart2 className="w-3.5 h-3.5" />}
                {tab === 'goals' && <Sparkles className="w-3.5 h-3.5" />}
                <span>{tab}</span>
              </button>
            ))}
          </div>

          {activeTab === 'routes' && (
            <div className="space-y-2">
              {!stats.topPages.length && <Panel>No pageviews recorded in this window.</Panel>}
              {stats.topPages.map((page, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-cosmic-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="font-mono text-cyan-300 font-medium truncate max-w-xs">{page.name}</span>
                  <div className="flex items-center gap-6">
                    <span className="text-slate-400">{formatCount(page.visitors)} visitors</span>
                    <span className="font-mono text-white font-bold">{formatCount(page.views)}</span>
                    <div className="w-16 h-1.5 bg-slate-850 rounded-full overflow-hidden hidden sm:block">
                      <div style={{ width: `${barWidth(page.views, stats.topPages)}%` }} className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'sources' && (
            <div className="space-y-2">
              {!stats.topReferrers.length && <Panel>No referrers recorded in this window.</Panel>}
              {stats.topReferrers.map((ref, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-cosmic-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-200 font-medium">{ref.name}</span>
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-white font-bold">{formatCount(ref.views)}</span>
                    <div className="w-16 h-1.5 bg-slate-850 rounded-full overflow-hidden hidden sm:block">
                      <div style={{ width: `${barWidth(ref.views, stats.topReferrers)}%` }} className="h-full bg-gradient-to-r from-teal-400 to-cyan-500 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'geo' && (
            <div className="grid sm:grid-cols-2 gap-3">
              {!stats.topCountries.length && <Panel>No visitor locations recorded in this window.</Panel>}
              {stats.topCountries.map((c, i) => (
                <div key={i} className="p-3 rounded-lg bg-cosmic-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[10px] font-bold font-mono">{c.name}</span>
                    <span className="text-slate-200">{countryName(c.name)}</span>
                  </div>
                  <span className="font-mono text-white font-bold">{formatCount(c.visitors)}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'tech' && (
            <div className="grid sm:grid-cols-2 gap-6">
              {([['Devices', stats.topDevices], ['Browsers', stats.topBrowsers]] as const).map(([title, rows]) => (
                <div key={title} className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{title}</div>
                  {!rows.length && <Panel>{`No ${title.toLowerCase()} recorded.`}</Panel>}
                  {rows.map((row, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-cosmic-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-200 font-medium">{row.name}</span>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-white font-bold">{formatCount(row.views)}</span>
                        <div className="w-16 h-1.5 bg-slate-850 rounded-full overflow-hidden hidden sm:block">
                          <div style={{ width: `${barWidth(row.views, [...rows])}%` }} className="h-full bg-gradient-to-r from-indigo-400 to-cyan-500 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'goals' && (
            // Goals need a way to define and record conversions. Nothing does yet, so an
            // invented figure here would sit beside real traffic with nothing to mark it.
            <div className="p-4 rounded-lg bg-cosmic-950/70 border border-slate-800/80 text-xs text-slate-400 space-y-2">
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <Sparkles className="w-4 h-4 text-cyan-400" /> Goals are not tracked yet
              </div>
              <p>
                The tracker can already send custom events via{' '}
                <code className="font-mono text-cyan-300">safemetrics('signup')</code>, but nothing
                defines a goal or counts conversions against it. This panel stays empty until it
                can be honest.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
