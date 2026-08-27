---
name: testing-safemetrics
description: How to run and test the SafeMetrics React/Vite SPA plus its Cloudflare Worker + D1 API locally, including how to reach the auth (401) code paths without real Clerk credentials.
---

# Testing SafeMetrics locally

## Frontend
- Node 22 is required: `source ~/.nvm/nvm.sh && nvm use 22`.
- `npm install`, then `npm run dev` → http://localhost:3001. `npm run build` → `dist/`.
- Without `VITE_CLERK_PUBLISHABLE_KEY` the app renders in a signed-out "local preview" mode
  (`src/main.tsx` renders `<App hasClerk={false} />`, no `ClerkProvider`). In that mode:
  - "Log In" opens a local "Multi-Tenant Authentication" setup modal, not a Clerk modal.
  - Pricing "Upgrade" shows a toast instead of calling `/api/checkout`.
  - "Add Website" only mutates local state and does not call `/api/domains`.
  So signed-out testing can prove UI wiring, but never proves Clerk sign-in, tenant
  provisioning, `/api/me`, or authenticated checkout. Report those as untested unless a
  publishable key is provided.
- Useful trick instead of opening devtools: run
  `performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/'))`
  to assert that no API calls were made.

## Worker + D1 locally (no Cloudflare account needed)
```
npx wrangler dev --local --port 8787
npx wrangler d1 execute safemetrics-db --local --file=./schema.sql
npx wrangler d1 execute safemetrics-db --local --file=./migrations/0002_stripe_billing.sql
# ...and every other file in migrations/, in numeric order
```
- Query state with `npx wrangler d1 execute safemetrics-db --local --json --command "SELECT ..."`.
  Note `tenants.slug` is NOT NULL, so hand-inserted tenants need a slug.
- `/api/health` must stay public.

### Clerk auth (on `master`)
- `CLERK_ISSUER` is committed in `wrangler.jsonc`, pointing at a Clerk **development**
  instance (`*.clerk.accounts.dev`), so authenticated endpoints reach the 401 branches
  directly. A garbage bearer token yields
  `401 {"error":"unauthorized","reason":"malformed_token"}` with no extra setup.
- The two 503s are distinct and both mean "not the caller's fault": `not_configured` if
  `CLERK_ISSUER` is blank, `jwks_unavailable` if a well-formed token arrives but the
  issuer's `/.well-known/jwks.json` cannot be fetched — which is what you get offline.
  Test 401s with a malformed token to stay clear of that.
- A gitignored `.dev.vars` is still the place to override locally, e.g.
  `CLERK_ISSUER=https://clerk.test.invalid` and `SESSION_SALT=test-salt`. Never commit it.
  Unset, `SESSION_SALT` falls back to a literal in the bundle, so a local visitor hash
  will not match a deployed one.
- `/api/event` returns `202 {"ok":false,"reason":"domain_not_registered"}` for unknown domains
  (verify no rows are written), and `200 {"ok":true}` for a domain row you insert by hand.
  Registering a domain is `POST /api/domains`, which is authenticated — hand-inserting the
  row is how you test ingestion without a Clerk token.

## Devin Secrets Needed
- `VITE_CLERK_PUBLISHABLE_KEY` and a matching `CLERK_ISSUER` (Clerk instance) — required for any
  signed-in / tenancy testing.
- `STRIPE_SECRET_KEY` (test mode) — required to prove the real checkout redirect.
- Cloudflare API credentials — required only for remote (non-`--local`) D1/Worker testing.
