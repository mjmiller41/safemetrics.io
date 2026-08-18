import { useState } from 'react'
import type { Bucket } from '../../lib/data'
import { full, niceMax } from '../../lib/format'
import { GRID, SERIES, SURFACE } from '../../lib/palette'
import { useSize } from '../../lib/useSize'
import { ChartFrame, TableView, ViewToggle } from './TableView'

const PAD = { top: 14, right: 18, bottom: 26, left: 46 }
const PLOT_HEIGHT = 220

type Props = {
  buckets: Bucket[]
  hourly: boolean
  title: string
  subtitle?: string
}

function labelFor(t: number, hourly: boolean): string {
  const date = new Date(t)
  return hourly
    ? date.toLocaleTimeString('en-US', { hour: 'numeric' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fullLabelFor(t: number, hourly: boolean): string {
  const date = new Date(t)
  return hourly
    ? date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric' })
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Visitors and pageviews share one y-axis — they are the same unit (counts), so
 * a single scale is honest. Two scales on one plot would invent a correlation.
 */
export function TimeSeries({ buckets, hourly, title, subtitle }: Props) {
  const { ref, width } = useSize<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [active, setActive] = useState<number | null>(null)

  const height = PLOT_HEIGHT + PAD.top + PAD.bottom
  const plotWidth = Math.max(120, width - PAD.left - PAD.right)
  const max = niceMax(Math.max(...buckets.map((b) => b.pageviews)))
  const stepX = buckets.length > 1 ? plotWidth / (buckets.length - 1) : 0

  const x = (i: number) => PAD.left + i * stepX
  const y = (value: number) => PAD.top + PLOT_HEIGHT - (value / max) * PLOT_HEIGHT

  const line = (key: 'visitors' | 'pageviews') =>
    buckets.map((b, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(b[key]).toFixed(1)}`).join(' ')

  const area =
    `${line('visitors')} L${x(buckets.length - 1).toFixed(1)} ${(PAD.top + PLOT_HEIGHT).toFixed(1)}` +
    ` L${x(0).toFixed(1)} ${(PAD.top + PLOT_HEIGHT).toFixed(1)} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))
  // Keep x labels from colliding: show at most ~7 across the axis.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7))

  const point = active !== null ? buckets[active] : null

  function pick(clientX: number, target: SVGSVGElement) {
    const box = target.getBoundingClientRect()
    const relative = clientX - box.left - PAD.left
    const index = Math.round(relative / (stepX || 1))
    setActive(Math.min(buckets.length - 1, Math.max(0, index)))
  }

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      action={<ViewToggle table={table} onChange={setTable} />}
    >
      {/* Legend — always present for two or more series, so identity never
          depends on matching a colour to a line by eye. */}
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1">
        {[
          { name: 'Visitors', color: SERIES[0] },
          { name: 'Pageviews', color: SERIES[1] },
        ].map((series) => (
          <li key={series.name} className="flex items-center gap-2 text-xs text-slate-300">
            <svg width="14" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="14" y2="4" stroke={series.color} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {series.name}
          </li>
        ))}
      </ul>

      {table ? (
        <TableView
          caption={`${title}, per ${hourly ? 'hour' : 'day'}`}
          columns={[hourly ? 'Hour' : 'Day', 'Visitors', 'Pageviews']}
          rows={buckets.map((b) => [fullLabelFor(b.t, hourly), full(b.visitors), full(b.pageviews)])}
        />
      ) : (
        <div ref={ref} className="relative">
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${Math.max(width, 200)} ${height}`}
            role="img"
            aria-label={`${title}. Use the table view for exact values.`}
            tabIndex={0}
            className="touch-pan-y focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive((prev) => prev ?? buckets.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                setActive((prev) => {
                  const next = (prev ?? buckets.length - 1) + (e.key === 'ArrowRight' ? 1 : -1)
                  return Math.min(buckets.length - 1, Math.max(0, next))
                })
              }
            }}
          >
            {/* Gridlines: hairline, solid, one step off the surface. */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={GRID}
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick) + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] tabular-nums"
                >
                  {tick.toLocaleString('en-US')}
                </text>
              </g>
            ))}

            {buckets.map((b, i) =>
              i % labelEvery === 0 ? (
                <text
                  key={b.t}
                  x={x(i)}
                  y={height - 8}
                  textAnchor={i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle'}
                  className="fill-slate-500 text-[10px]"
                >
                  {labelFor(b.t, hourly)}
                </text>
              ) : null,
            )}

            {/* Area wash on the primary series only — two overlapping fills
                would muddy both. */}
            <path d={area} fill={SERIES[0]} fillOpacity="0.1" />
            <path d={line('pageviews')} fill="none" stroke={SERIES[1]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={line('visitors')} fill="none" stroke={SERIES[0]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {active !== null && point && (
              <g pointerEvents="none">
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={PAD.top}
                  y2={PAD.top + PLOT_HEIGHT}
                  stroke={GRID}
                  strokeWidth="1"
                />
                {/* 2px surface ring keeps the markers legible where they cross. */}
                <circle cx={x(active)} cy={y(point.pageviews)} r="4" fill={SERIES[1]} stroke={SURFACE} strokeWidth="2" />
                <circle cx={x(active)} cy={y(point.visitors)} r="4" fill={SERIES[0]} stroke={SURFACE} strokeWidth="2" />
              </g>
            )}
          </svg>

          {active !== null && point && (
            <div
              role="status"
              className="pointer-events-none absolute top-2 z-10 w-44 rounded-lg border border-slate-700 bg-slate-950/95 p-2.5 shadow-xl"
              style={{
                left: Math.min(Math.max(x(active) - 88, 0), Math.max(0, width - 176)),
              }}
            >
              <p className="mb-1.5 text-[11px] text-slate-400">{fullLabelFor(point.t, hourly)}</p>
              {/* Values lead, labels follow — the reader already knows the series. */}
              {[
                { name: 'Visitors', value: point.visitors, color: SERIES[0] },
                { name: 'Pageviews', value: point.pageviews, color: SERIES[1] },
              ].map((row) => (
                <div key={row.name} className="flex items-baseline gap-2">
                  <svg width="12" height="8" aria-hidden="true" className="shrink-0">
                    <line x1="0" y1="4" x2="12" y2="4" stroke={row.color} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span className="text-sm font-semibold tabular-nums text-slate-50">{full(row.value)}</span>
                  <span className="text-[11px] text-slate-400">{row.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ChartFrame>
  )
}
