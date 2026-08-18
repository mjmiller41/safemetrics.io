/**
 * Chart palette.
 *
 * Validated for the dark chart surface (#0f172a / slate-900) with the dataviz
 * validator: lightness band PASS, chroma floor PASS, worst adjacent CVD ΔE 32.4
 * (tritan) PASS, contrast vs surface PASS.
 *
 *   node scripts/validate_palette.js "#199e70,#9085e9,#c98500,#3987e5,#d95926" \
 *     --mode dark --surface "#0f172a"
 *
 * Slots are assigned in fixed order and never cycled — colour follows the
 * entity, not its current rank.
 */
export const SERIES = [
  '#199e70', // 1 aqua   — primary metric (visitors)
  '#9085e9', // 2 violet — secondary metric (pageviews)
  '#c98500', // 3 yellow
  '#3987e5', // 4 blue
  '#d95926', // 5 orange
] as const

/** The surface colour charts are painted on — used for gaps and rings. */
export const SURFACE = '#0f172a'

/** One step off the surface: gridlines and axis rules. Hairline, solid. */
export const GRID = '#1e293b'

/** De-emphasised mark colour, for sparkline history behind the current period. */
export const MUTED_MARK = '#475569'
