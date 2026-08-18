import { useState } from 'react'
import { RANGES, ago, useDemoData, useLiveFeed, useNow, type Range } from '../lib/data'
import { compact, duration, full, percent, signed } from '../lib/format'
import { BarList } from './charts/BarList'
import { Donut } from './charts/Donut'
import { Sparkline } from './charts/Sparkline'
import { TimeSeries } from './charts/TimeSeries'
import { StatTile } from './StatTile'

/**
 * The live demo dashboard. Same component the marketing page embeds and the
 * /demo route renders full-width.
 */
export function Dashboard({ live = true }: { live?: boolean }) {
  const [range, setRange] = useState<Range>('7d')
  const data = useDemoData(range)
  const { online, events } = useLiveFeed(live)
  const now = useNow(live)

  const trend = data.buckets.slice(-12).map((bucket) => bucket.visitors)
  const rangeLabel = RANGES.find((option) => option.id === range)?.label ?? ''

  return (
    <div className="space-y-4">
      {/* One filter row, above everything it scopes. Date range first. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 glass-card rounded-lg px-3 py-1.5 text-sm text-slate-300">
          <span className="h-2 w-2 rounded-full bg-cyan-400" aria-hidden="true" />
          demo.safemetrics.io
        </div>

        <div
          className="flex glass-card rounded-lg p-0.5"
          role="group"
          aria-label="Date range"
        >
          {RANGES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRange(option.id)}
              aria-pressed={range === option.id}
              title={option.label}
              className={`rounded-md px-3 py-1 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                range === option.id
                  ? 'bg-slate-800 text-slate-50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.short}
            </button>
          ))}
        </div>

        {live && (
          <div className="ml-auto flex items-center gap-2 glass-card rounded-lg px-3 py-1.5 text-sm">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-semibold tabular-nums text-slate-50">{online}</span>
            <span className="text-slate-400">online now</span>
          </div>
        )}
      </div>

      {/* Hero figure — exactly one per view — plus its supporting tiles. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card rounded-xl p-4 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium text-slate-400">Unique visitors</p>
          <p className="mt-1 text-5xl font-semibold leading-none text-slate-50">
            {compact(data.totals.visitors)}
          </p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-xs">
              <span className={data.deltas.visitors >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {signed(data.deltas.visitors)}
              </span>{' '}
              <span className="text-slate-500">vs previous period</span>
            </p>
            <Sparkline values={trend} />
          </div>
        </div>

        <StatTile label="Pageviews" value={compact(data.totals.pageviews)} delta={data.deltas.pageviews} />
        <StatTile
          label="Bounce rate"
          value={percent(data.totals.bounceRate, 0)}
          delta={data.deltas.bounceRate}
          goodWhenUp={false}
        />
        <StatTile
          label="Avg. visit duration"
          value={duration(data.totals.avgDuration)}
          delta={data.deltas.avgDuration}
        />
      </div>

      <TimeSeries
        buckets={data.buckets}
        hourly={data.hourly}
        title="Visitors and pageviews"
        subtitle={`${rangeLabel} · ${data.hourly ? 'hourly' : 'daily'} buckets`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="Top pages" subtitle="By pageviews" label="Page" items={data.pages} />
        <BarList title="Top sources" subtitle="Where visitors came from" label="Source" items={data.referrers} />
        <BarList title="Countries" subtitle="Derived from IP, then discarded" label="Country" items={data.countries} />
        <Donut title="Devices" subtitle="Share of visitors" items={data.devices} />
      </div>

      {live && (
        <section className="glass-card rounded-xl p-4 sm:p-5">
          <header className="mb-3 flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold text-slate-100">Live pageviews</h3>
            <p className="text-xs text-slate-500">Everything SafeMetrics stores about a visit</p>
          </header>
          <ul className="divide-y divide-slate-800">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-mono text-slate-200">{event.path}</span>
                <span className="text-slate-400">
                  {event.flag} {event.country}
                </span>
                <span className="text-slate-500">
                  {event.device} · {event.browser}
                </span>
                <span className="ml-auto text-xs tabular-nums text-slate-500">{ago(event.at, now)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-500">
            No cookie, no device ID, no IP address is retained — a visit is counted with a daily
            rotating hash that cannot be reversed or joined across days.
          </p>
        </section>
      )}

      <p className="text-xs text-slate-500">
        Demo data is generated in your browser. Totals for {rangeLabel.toLowerCase()}:{' '}
        {full(data.totals.visitors)} visitors, {full(data.totals.pageviews)} pageviews.
      </p>
    </div>
  )
}
