import { MUTED_MARK, SERIES, SURFACE } from '../../lib/palette'

/**
 * A 12-point trend for stat tiles: history in the de-emphasis hue, the current
 * period in the accent. Decoration-free — the value beside it carries the number.
 */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = width / (values.length - 1)
  const y = (value: number) => height - 3 - ((value - min) / span) * (height - 8)

  const path = values.map((value, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)} ${y(value).toFixed(1)}`).join(' ')
  const lastIndex = values.length - 1
  const tail = `M${((lastIndex - 1) * stepX).toFixed(1)} ${y(values[lastIndex - 1]).toFixed(1)} L${(lastIndex * stepX).toFixed(1)} ${y(values[lastIndex]).toFixed(1)}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <path d={path} fill="none" stroke={MUTED_MARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={tail} fill="none" stroke={SERIES[0]} strokeWidth="2" strokeLinecap="round" />
      <circle cx={lastIndex * stepX} cy={y(values[lastIndex])} r="3.5" fill={SERIES[0]} stroke={SURFACE} strokeWidth="2" />
    </svg>
  )
}
