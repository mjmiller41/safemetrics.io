import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Synthetic analytics for the public demo.
 *
 * Everything here is generated client-side from a seeded PRNG — no network, no
 * cookies, no real visitor data. That is also the product's point, so the demo
 * behaves like the real dashboard rather than a screenshot.
 */

export type Range = '24h' | '7d' | '30d' | '90d'

export const RANGES: { id: Range; label: string; short: string }[] = [
  { id: '24h', label: 'Last 24 hours', short: '24h' },
  { id: '7d', label: 'Last 7 days', short: '7d' },
  { id: '30d', label: 'Last 30 days', short: '30d' },
  { id: '90d', label: 'Last 90 days', short: '90d' },
]

export type Bucket = {
  /** Bucket start, epoch ms. */
  t: number
  visitors: number
  pageviews: number
}

export type Dimension = { name: string; visitors: number; detail?: string }

export type DemoData = {
  buckets: Bucket[]
  /** True when buckets are hourly rather than daily. */
  hourly: boolean
  totals: {
    visitors: number
    pageviews: number
    bounceRate: number
    avgDuration: number
  }
  /** Percentage change vs the previous equivalent period. */
  deltas: {
    visitors: number
    pageviews: number
    bounceRate: number
    avgDuration: number
  }
  pages: Dimension[]
  referrers: Dimension[]
  countries: Dimension[]
  devices: Dimension[]
  browsers: Dimension[]
}

/** Deterministic PRNG — same seed, same dashboard, every render. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Traffic is lower overnight and on weekends — makes the shape read as real. */
function hourWeight(hour: number): number {
  return 0.35 + 0.65 * Math.sin(Math.max(0, (hour - 5) / 19) * Math.PI) ** 1.4
}

function dayWeight(day: number): number {
  return day === 0 || day === 6 ? 0.62 : 1
}

const PAGES = [
  { name: '/', detail: 'Home' },
  { name: '/pricing', detail: 'Pricing' },
  { name: '/blog/cookie-free-analytics', detail: 'Blog post' },
  { name: '/docs/install', detail: 'Docs' },
  { name: '/vs/google-analytics', detail: 'Comparison' },
  { name: '/blog/gdpr-without-banners', detail: 'Blog post' },
  { name: '/changelog', detail: 'Changelog' },
  { name: '/docs/api', detail: 'Docs' },
  { name: '/about', detail: 'About' },
]

const REFERRERS = [
  { name: 'Direct / none', detail: 'No referrer' },
  { name: 'google.com', detail: 'Organic search' },
  { name: 'news.ycombinator.com', detail: 'Social' },
  { name: 'reddit.com/r/webdev', detail: 'Social' },
  { name: 'github.com', detail: 'Referral' },
  { name: 'bsky.app', detail: 'Social' },
  { name: 'duckduckgo.com', detail: 'Organic search' },
  { name: 'producthunt.com', detail: 'Referral' },
]

const COUNTRIES = [
  { name: 'United States', detail: '🇺🇸' },
  { name: 'Germany', detail: '🇩🇪' },
  { name: 'United Kingdom', detail: '🇬🇧' },
  { name: 'Netherlands', detail: '🇳🇱' },
  { name: 'Canada', detail: '🇨🇦' },
  { name: 'France', detail: '🇫🇷' },
  { name: 'Australia', detail: '🇦🇺' },
  { name: 'Sweden', detail: '🇸🇪' },
  { name: 'Japan', detail: '🇯🇵' },
]

const BROWSERS = [
  { name: 'Chrome' },
  { name: 'Safari' },
  { name: 'Firefox' },
  { name: 'Edge' },
  { name: 'Arc' },
]

const DEVICES = [{ name: 'Desktop' }, { name: 'Mobile' }, { name: 'Tablet' }]

/** Split a total across labels with a stable long-tail shape. */
function distribute<T extends { name: string; detail?: string }>(
  items: T[],
  total: number,
  rand: () => number,
  decay: number,
): Dimension[] {
  const weights = items.map((_, i) => decay ** i * (0.85 + rand() * 0.3))
  const sum = weights.reduce((a, b) => a + b, 0)
  return items.map((item, i) => ({
    name: item.name,
    detail: item.detail,
    visitors: Math.max(1, Math.round((weights[i] / sum) * total)),
  }))
}

function bucketCount(range: Range): number {
  return range === '24h' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : 90
}

/**
 * Build one period of buckets ending at `endMs`. `offset` steps the whole window
 * back by one period so we can compute a like-for-like delta.
 */
function buildBuckets(range: Range, endMs: number, offset: number): Bucket[] {
  const count = bucketCount(range)
  const hourly = range === '24h'
  const stepMs = hourly ? 3_600_000 : 86_400_000
  const rand = mulberry32(range === '24h' ? 11 : range === '7d' ? 22 : range === '30d' ? 33 : 44)
  const buckets: Bucket[] = []

  // Gentle upward trend across the window, plus per-bucket noise.
  for (let i = 0; i < count; i++) {
    const index = i - offset * count
    const t = endMs - (count - 1 - i) * stepMs - offset * count * stepMs
    const date = new Date(t)
    const seasonal = hourly ? hourWeight(date.getHours()) : dayWeight(date.getDay())
    const trend = 1 + (index / (count * 4))
    const noise = 0.82 + rand() * 0.36
    const base = hourly ? 96 : 1180
    const visitors = Math.max(1, Math.round(base * seasonal * trend * noise))
    const pagesPer = 2.1 + rand() * 0.8
    buckets.push({ t, visitors, pageviews: Math.round(visitors * pagesPer) })
  }
  return buckets
}

function sum(buckets: Bucket[], key: 'visitors' | 'pageviews'): number {
  return buckets.reduce((acc, b) => acc + b[key], 0)
}

function change(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

export function buildDemoData(range: Range, endMs: number): DemoData {
  const buckets = buildBuckets(range, endMs, 0)
  const previous = buildBuckets(range, endMs, 1)
  const rand = mulberry32(bucketCount(range) * 7 + 3)

  const visitors = sum(buckets, 'visitors')
  const pageviews = sum(buckets, 'pageviews')
  const prevVisitors = sum(previous, 'visitors')
  const prevPageviews = sum(previous, 'pageviews')

  const bounceRate = 38.4 + rand() * 4
  const avgDuration = 92 + rand() * 40

  return {
    buckets,
    hourly: range === '24h',
    totals: { visitors, pageviews, bounceRate, avgDuration },
    deltas: {
      visitors: change(visitors, prevVisitors),
      pageviews: change(pageviews, prevPageviews),
      bounceRate: -2.3,
      avgDuration: 6.8,
    },
    pages: distribute(PAGES, pageviews, rand, 0.66),
    referrers: distribute(REFERRERS, visitors, rand, 0.7),
    countries: distribute(COUNTRIES, visitors, rand, 0.72),
    devices: distribute(DEVICES, visitors, rand, 0.55),
    browsers: distribute(BROWSERS, visitors, rand, 0.6),
  }
}

/**
 * The dashboard's window ends at a stable timestamp so the charts don't reshuffle
 * on every render; only the live layer below ticks.
 */
export function useDemoData(range: Range): DemoData {
  const endRef = useRef<number>(Date.now())
  return useMemo(() => buildDemoData(range, endRef.current), [range])
}

export type LiveEvent = {
  id: number
  path: string
  country: string
  flag: string
  device: string
  browser: string
  at: number
}

/**
 * The "right now" layer: a visitor count that breathes and a feed of pageviews
 * arriving. Each event carries only what SafeMetrics would actually record —
 * page, coarse country, device class. No identifier, no cookie, no IP.
 */
export function useLiveFeed(enabled: boolean) {
  const [online, setOnline] = useState(147)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const randRef = useRef(mulberry32(97))
  const idRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const rand = randRef.current

    const seed: LiveEvent[] = Array.from({ length: 6 }, (_, i) => {
      const country = COUNTRIES[Math.floor(rand() * 5)]
      return {
        id: idRef.current++,
        path: PAGES[Math.floor(rand() * PAGES.length)].name,
        country: country.name,
        flag: country.detail ?? '',
        device: DEVICES[Math.floor(rand() * DEVICES.length)].name,
        browser: BROWSERS[Math.floor(rand() * BROWSERS.length)].name,
        at: Date.now() - (6 - i) * 4200,
      }
    })
    setEvents(seed)

    const tick = window.setInterval(() => {
      const country = COUNTRIES[Math.floor(rand() * COUNTRIES.length)]
      const event: LiveEvent = {
        id: idRef.current++,
        path: PAGES[Math.floor(rand() * PAGES.length)].name,
        country: country.name,
        flag: country.detail ?? '',
        device: DEVICES[Math.floor(rand() * DEVICES.length)].name,
        browser: BROWSERS[Math.floor(rand() * BROWSERS.length)].name,
        at: Date.now(),
      }
      setEvents((prev) => [event, ...prev].slice(0, 8))
      setOnline((prev) => {
        const drift = Math.round((rand() - 0.45) * 9)
        return Math.min(320, Math.max(60, prev + drift))
      })
    }, 2600)

    return () => window.clearInterval(tick)
  }, [enabled])

  return { online, events }
}

/** "12s ago" — the live feed's only time format. */
export function ago(at: number, now: number): string {
  const seconds = Math.max(1, Math.round((now - at) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

/** A clock that only ticks while the feed is on screen. */
export function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [enabled])
  return now
}
