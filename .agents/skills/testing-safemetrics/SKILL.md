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

### Once Clerk auth lands (PR #5, branch `devin/1787845868-clerk-tenancy-auth`)
The points below describe that branch, not `master` — on `master` there is no token verification
and `/api/event` auto-registers any unknown domain under a shared `tenant_default`.
- `CLERK_ISSUER` is committed empty in `wrangler.jsonc`, which makes authenticated endpoints
  answer **503 (`not_configured`) instead of 401**. To reach the 401 branches, create a
  gitignored `.dev.vars` with e.g. `CLERK_ISSUER=https://clerk.test.invalid` and
  `SESSION_SALT=test-salt`. Never commit it. A garbage bearer token then yields
  `401 {"error":"unauthorized","reason":"malformed_token"}`.
- `/api/event` returns `202 {"ok":false,"reason":"domain_not_registered"}` for unknown domains
  (verify no rows are written), and `200 {"ok":true}` for a domain row you insert by hand.

## Devin Secrets Needed
- `VITE_CLERK_PUBLISHABLE_KEY` and a matching `CLERK_ISSUER` (Clerk instance) — required for any
  signed-in / tenancy testing.
- `STRIPE_SECRET_KEY` (test mode) — required to prove the real checkout redirect.
- Cloudflare API credentials — required only for remote (non-`--local`) D1/Worker testing.
