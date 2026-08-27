# SafeMetrics

Marketing site and product demo for SafeMetrics — a privacy-first, cookie-free
web analytics service positioned against Google Analytics 4.

React 18 + TypeScript + Vite + Tailwind 3 on the front end, with a Cloudflare
Worker (`worker/`) over D1 serving `/api/*` — ingestion, stats, Stripe checkout
and the Stripe webhook. The marketing page itself still runs on demo data
generated in the browser, which is also the product's point.

Node 22 or newer is required: the worker tests import `node:sqlite` and run
TypeScript directly.

```bash
npm install
npm run dev      # http://localhost:3001
npm run build    # tsc && vite build → dist/
npm test         # worker tests
npm run deploy   # build + wrangler deploy
```

## What's on the page

| Section | Anchor | What it is |
|---|---|---|
| Hero | — | Positioning, script-size claim, calls to action |
| Live dashboard | `#signal-center` | The real interactive analytics UI |
| Integration studio | `#install` | Domain input → copyable snippet, per framework |
| GA4 benchmarks | `#benchmarks` | Head-to-head comparison matrix |
| Speed calculator | `#calculator` | Page-weight and carbon impact |
| Pricing | `#pricing` | Three tiers, monthly/annual toggle |

## The dashboard

`src/components/Dashboard.tsx` is the whole demo. It is a real UI, not a
screenshot — every control works. Note that it is currently not mounted:
`src/App.tsx` renders its own hardcoded figures instead.

- **`src/lib/data.ts`** generates the dataset from a seeded PRNG (`mulberry32`),
  so the same range always produces the same chart rather than reshuffling on
  every render. Traffic carries an hour-of-day curve and a weekday/weekend
  weight so the shape reads as plausible. The previous equivalent period is
  generated the same way, which is where the "vs previous period" deltas come
  from. `useLiveFeed` adds the "right now" layer on a 2.6s tick.
- **`src/components/charts/`** holds hand-written SVG charts — no chart library.
  `TimeSeries` (crosshair + tooltip + arrow-key navigation), `BarList`, `Donut`,
  `Sparkline`.

### Chart conventions

These are deliberate and worth keeping if you extend the dashboard:

- **One y-axis.** Visitors and pageviews are the same unit, so they share a
  scale. Two scales on one plot would invent a correlation that isn't in the
  data.
- **Every chart has a table twin.** The `Table` toggle on each card renders the
  same numbers as a real `<table>`. Tooltips enhance; they never gate a value.
- **One series, one colour.** Bar lists don't shade by rank — that would encode
  length twice and burn the only free channel.
- **Colour follows the entity, not its position.** Slots in `src/lib/palette.ts`
  are assigned in fixed order and never cycled.

The palette in `src/lib/palette.ts` was validated against the actual glass-card
surface (`#0c121f`) — lightness band, chroma floor, adjacent colour-vision-
deficiency separation (worst adjacent ΔE 32.4) and contrast all pass. **If you
change the card background or add a series, re-run the validator** rather than
eyeballing it.

## Notes

- The tracker is served at `/js/script.js`, which is what the Integration Studio
  emits. `public/beacon.js` is a byte-identical copy kept only because
  `public/llms.txt` published that URL; keep the two in sync or drop the alias
  once nothing references it.
- The install guide's "ignores localhost by default" behaviour describes the
  intended tracker, which is not built here.
- `/api/stats` is not authenticated yet, and nothing populates the `users`
  table, so the Stripe webhook cannot resolve a tenant for a completed
  checkout.
