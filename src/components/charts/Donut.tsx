import { useState } from 'react'
import type { Dimension } from '../../lib/data'
import { full, percent } from '../../lib/format'
import { SERIES, SURFACE } from '../../lib/palette'
import { ChartFrame, TableView, ViewToggle } from './TableView'

const RADIUS = 54
const THICKNESS = 16
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** The 2px surface gap, expressed along the arc. */
const GAP = 2

/** Part-to-whole at a glance, three segments. Never used to compare close values. */
export function Donut({
  title,
  subtitle,
  items,
}: {
  title: string
  subtitle?: string
  items: Dimension[]
}) {
  const [table, setTable] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const total = items.reduce((acc, item) => acc + item.visitors, 0) || 1

  let offset = 0
  const segments = items.map((item, i) => {
    const fraction = item.visitors / total
    const length = Math.max(GAP + 1, fraction * CIRCUMFERENCE)
    const segment = {
      ...item,
      color: SERIES[i % SERIES.length],
      share: fraction * 100,
      dash: `${length - GAP} ${CIRCUMFERENCE - length + GAP}`,
      offset,
    }
    offset += length
    return segment
  })

  const focused = segments.find((segment) => segment.name === active) ?? segments[0]

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      action={<ViewToggle table={table} onChange={setTable} />}
    >
      {table ? (
        <TableView
          caption={`${title} by visitors`}
          columns={['Device', 'Visitors', 'Share']}
          rows={items.map((item) => [
            item.name,
            full(item.visitors),
            percent((item.visitors / total) * 100),
          ])}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative">
            <svg width="136" height="136" viewBox="0 0 136 136" role="img" aria-label={title}>
              <g transform="rotate(-90 68 68)">
                {segments.map((segment) => (
                  <circle
                    key={segment.name}
                    cx="68"
                    cy="68"
                    r={RADIUS}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={THICKNESS}
                    strokeDasharray={segment.dash}
                    strokeDashoffset={-segment.offset}
                    opacity={active && active !== segment.name ? 0.45 : 1}
                    className="cursor-pointer transition-opacity"
                    tabIndex={0}
                    onPointerEnter={() => setActive(segment.name)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(segment.name)}
                    onBlur={() => setActive(null)}
                  >
                    <title>{`${segment.name}: ${full(segment.visitors)} visitors (${percent(segment.share)})`}</title>
                  </circle>
                ))}
              </g>
              {/* The centre carries the focused segment, so the value is readable
                  without hovering anything. */}
              <text x="68" y="64" textAnchor="middle" className="fill-slate-50 text-xl font-semibold">
                {percent(focused?.share ?? 0, 0)}
              </text>
              <text x="68" y="82" textAnchor="middle" className="fill-slate-400 text-[11px]">
                {focused?.name}
              </text>
            </svg>
          </div>

          <ul className="min-w-[9rem] flex-1 space-y-2">
            {segments.map((segment) => (
              <li
                key={segment.name}
                className="flex items-center gap-2.5 text-sm"
                onPointerEnter={() => setActive(segment.name)}
                onPointerLeave={() => setActive(null)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: segment.color, outline: `2px solid ${SURFACE}` }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-slate-300">{segment.name}</span>
                <span className="tabular-nums text-slate-400">{percent(segment.share, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartFrame>
  )
}
