# Stripe webhooks — how it works and how to deploy it

SafeMetrics syncs subscription tiers from Stripe through a single signed webhook
endpoint on the Cloudflare Worker.

| | |
|---|---|
| Endpoint | `POST https://safemetrics.io/api/webhook` |
| Handler | `worker/stripe-webhook.ts` (routed from `worker/index.ts`) |
| Signature check | `worker/stripe-signature.ts` |
| Tier ↔ price map | `worker/plans.ts` |
| Schema | `migrations/0002_stripe_billing.sql`, `migrations/0003_fix_plan_check_constraint.sql` |
| Tests | `npm test` |

## Events handled

| Event | Effect |
|---|---|
| `checkout.session.completed` | Links `stripe_customer_id` / `stripe_subscription_id` to the tenant and activates the purchased tier. |
| `customer.subscription.updated` | Syncs upgrades, downgrades, and cancellations. |
| `customer.subscription.deleted` | Drops the tenant to the free tier. |

Anything else is acknowledged with `200` and recorded as `ignored` — never silently
discarded.

## Deploying

1. **Apply the migrations.** 0002 is additive and safe. 0003 rebuilds the `tenants`
   table to fix the `plan` CHECK constraint — take a backup first and read the
   warning at the top of that file.

   ```sh
   wrangler d1 export  safemetrics-db --remote --output=backup-before-stripe.sql
   wrangler d1 execute safemetrics-db --remote --file=migrations/0002_stripe_billing.sql
   wrangler d1 execute safemetrics-db --remote --file=migrations/0003_fix_plan_check_constraint.sql
   ```

2. **Set the secrets.** Neither has a fallback in code — a missing
   `STRIPE_WEBHOOK_SECRET` makes the endpoint answer `500` so Stripe keeps retrying
   rather than dropping events.

   ```sh
   wrangler secret put STRIPE_SECRET_KEY      # sk_live_...
   wrangler secret put STRIPE_WEBHOOK_SECRET  # whsec_... from the step below
   ```

3. **Register the endpoint** in the Stripe dashboard (Developers → Webhooks) at
   `https://safemetrics.io/api/webhook`, subscribed to the three events above. Copy
   the signing secret it gives you into `STRIPE_WEBHOOK_SECRET`.

4. **Deploy:** `npm run build && wrangler deploy`.

5. **Smoke-test** with the Stripe CLI:

   ```sh
   stripe listen --forward-to https://safemetrics.io/api/webhook
   stripe trigger checkout.session.completed
   ```

## Design notes

**Signature verification comes first.** The raw request body is HMAC-verified before
anything is parsed or written. The body must be used byte-for-byte — parsing and
re-serialising the JSON changes the bytes and every signature will fail.

**Idempotency is enforced in the database.** Every verified event is claimed by its
Stripe event id in `stripe_webhook_events` before processing. Stripe redelivers on
any non-2xx, and a redelivery of a finished event short-circuits to
`200 {duplicate: true}` without re-running the handler.

**Status codes drive Stripe's retries.** Permanent problems (bad signature,
unparseable body) answer `4xx` so Stripe stops. Transient ones (database
unavailable, a subscription event that arrived before its checkout event) answer
`5xx` so Stripe retries with backoff.

**Out-of-order delivery is handled.** Stripe does not guarantee ordering, so each
tenant stores `billing_event_at` — the `event.created` of the last applied billing
event. An older event arriving late is dropped rather than resurrecting a stale tier.

**Shared Stripe account.** SafeMetrics bills through `acct_1U5ATy…`, which also
serves sibling products, so their events arrive at this endpoint too. Any event
whose price/product is not listed in `worker/plans.ts` is ignored. `worker/plans.test.ts`
pins that file against `src/lib/stripe-prices.json` so the two cannot drift.

**`past_due` keeps access on.** Stripe is still retrying the charge; cutting a
customer off at the first failed payment punishes them for an expiring card. Access
is revoked at `canceled` / `unpaid`. Likewise `cancel_at_period_end` means "will not
renew", not "access ends now", so the tier stays live until Stripe flips the status.

## Operating

Find anything that needs attention:

```sh
wrangler d1 execute safemetrics-db --remote --command="
  SELECT id, type, status, attempts, tenant_id, detail, received_at
  FROM stripe_webhook_events
  WHERE status IN ('failed','processing')
  ORDER BY updated_at DESC LIMIT 50;"
```

- `failed` — the handler could not complete. `detail` says why. The most common case
  is a purchase that could not be matched to an account (`unresolved tenant …`),
  which needs a manual link.
- `processing` — claimed but never finished, i.e. the worker died mid-handler. The
  next redelivery from Stripe will retry it automatically.
