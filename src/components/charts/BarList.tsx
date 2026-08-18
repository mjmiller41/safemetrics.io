import { useState } from 'react'
import type { Dimension } from '../../lib/data'
import { full, percent } from '../../lib/format'
import { SERIES } from '../../lib/palette'
import { ChartFrame, TableView, ViewToggle } from './TableView'

/**
 * One series, one colour. Ranking bars darker-where-bigger would double-encode
 * length as hue and burn the only free channel on information already shown.
 */
export function BarList({
  title,
  subtitle,
  label,
  items,
  limit = 6,
}: {
  title: string
  subtitle?: string
  /** Column header for the dimension, e.g. "Page". */
  label: string
  items: Dimension[]
  limit?: number
}) {
  const [table, setTable] = useState(false)
  const total = items.reduce((acc, item) => acc + item.visitors, 0)
  const shown = items.slice(0, limit)
  const max = Math.max(...shown.map((item) => item.visitors), 1)

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      action={<ViewToggle table={table} onChange={setTable} />}
    >
      {table ? (
        <TableView
          caption={`${title} by visitors`}
          columns={[label, 'Visitors', 'Share']}
          rows={items.map((item) => [
            item.name,
            full(item.visitors),
            percent((item.visitors / total) * 100),
          ])}
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((item) => (
            <li key={item.name} className="group">
              <div
                className="flex items-center gap-3"
                title={`${item.name} — ${full(item.visitors)} visitors (${percent(
                  (item.visitors / total) * 100,
                )})`}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-slate-200">{item.name}</span>
                    {item.detail && (
                      <span className="shrink-0 text-[11px] text-slate-500">{item.detail}</span>
                    )}
                  </div>
                  {/* Hit target covers the bar plus its air, not just painted pixels. */}
                  <div className="h-2.5 w-full rounded-sm bg-slate-800/70">
                    <div
                      className="h-2.5 rounded-r-[4px] transition-[width] duration-500 group-hover:brightness-110"
                      style={{
                        width: `${Math.max(2, (item.visitors / max) * 100)}%`,
                        backgroundColor: SERIES[0],
                      }}
                    />
                  </div>
                </div>
                {/* Value at the tip, in text ink — never in the series colour. */}
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-slate-300">
                  {full(item.visitors)}
                </span>
              </div>
            </li>
          ))}
          {items.length > limit && (
            <li className="pt-1 text-xs text-slate-500">
              +{items.length - limit} more in the table view
            </li>
          )}
        </ul>
      )}
    </ChartFrame>
  )
}
