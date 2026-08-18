import { signed } from '../lib/format'
import { Sparkline } from './charts/Sparkline'

/**
 * Stat tile contract: label · value · delta (signed, vs a named period) · trend.
 * The value uses proportional figures — tabular-nums makes a display-size number
 * look loose.
 */
export function StatTile({
  label,
  value,
  delta,
  goodWhenUp = true,
  trend,
  comparison = 'vs previous period',
}: {
  label: string
  value: string
  delta?: number
  goodWhenUp?: boolean
  trend?: number[]
  comparison?: string
}) {
  const positive = delta !== undefined && delta > 0
  const good = delta === undefined || delta === 0 ? null : positive === goodWhenUp

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold leading-none text-slate-50">{value}</p>
          {delta !== undefined && (
            <p className="mt-2 text-xs">
              <span
                className={
                  good === null ? 'text-slate-400' : good ? 'text-emerald-400' : 'text-rose-400'
                }
              >
                {signed(delta)}
              </span>{' '}
              <span className="text-slate-500">{comparison}</span>
            </p>
          )}
        </div>
        {trend && <Sparkline values={trend} />}
      </div>
    </div>
  )
}
