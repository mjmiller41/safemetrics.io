/** Compact number for stat tiles and hero figures: 1,284 / 12.9K / 4.2M. */
export function compact(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** Full number with thousands separators — table cells and tooltips. */
export function full(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function percent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

/** Signed delta for stat tiles: +12.4% / −3.1%. */
export function signed(n: number, digits = 1): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${Math.abs(n).toFixed(digits)}%`
}

/** Seconds as a duration: 1m 42s. */
export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/** Round an axis maximum up to a clean number (1,000 / 2,500 / 10,000). */
export function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10
  return step * magnitude
}
