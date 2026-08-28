import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  FREE_PLAN, PLANS, eventLimitFor, planById, planForStripePrice, priceForPlan, priceIdsFor,
} from './plans.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

interface PriceEntry {
  productId: string;
  monthlyPriceId: string;
  yearlyPriceId: string;
}

const stripePrices: Record<string, PriceEntry> = JSON.parse(
  readFileSync(join(repoRoot, 'src/lib/stripe-prices.json'), 'utf8'),
);

/**
 * worker/plans.ts duplicates the Stripe ids from src/lib/stripe-prices.json so the
 * worker does not need a JSON import. If the two drift, the browser starts a checkout
 * for a price the webhook will not recognise and the purchase is silently ignored —
 * so pin them together here.
 */
test('worker plan ids stay in sync with src/lib/stripe-prices.json', () => {
  for (const [planId, entry] of Object.entries(stripePrices)) {
    const plan = planById(planId);
    assert.ok(plan, `worker/plans.ts is missing the '${planId}' tier`);

    assert.equal(plan.productId, entry.productId, `${planId} productId drifted`);
    // Compared per interval, not as a sorted set: /api/checkout picks the price from
    // the interval, so a monthly/yearly swap would silently bill the wrong amount.
    assert.equal(plan.monthlyPriceId, entry.monthlyPriceId, `${planId} monthly price drifted`);
    assert.equal(plan.yearlyPriceId, entry.yearlyPriceId, `${planId} yearly price drifted`);
  }

  // Every paid tier in the worker must exist in the checkout config too.
  for (const plan of PLANS) {
    if (plan.id === FREE_PLAN) continue;
    assert.ok(stripePrices[plan.id], `stripe-prices.json is missing the '${plan.id}' tier`);
  }
});

test('maps both monthly and yearly prices to the right tier', () => {
  for (const [planId, entry] of Object.entries(stripePrices)) {
    assert.equal(planForStripePrice(entry.monthlyPriceId)?.id, planId);
    assert.equal(planForStripePrice(entry.yearlyPriceId)?.id, planId);
  }
});

test('resolves the price to charge from the tier and interval', () => {
  for (const [planId, entry] of Object.entries(stripePrices)) {
    const plan = planById(planId)!;
    assert.equal(priceForPlan(plan, 'month'), entry.monthlyPriceId);
    assert.equal(priceForPlan(plan, 'year'), entry.yearlyPriceId);
  }
});

test('the free tier has no purchasable price', () => {
  const free = planById(FREE_PLAN)!;
  assert.deepEqual(priceIdsFor(free), []);
  assert.equal(priceForPlan(free, 'month'), null);
  assert.equal(priceForPlan(free, 'year'), null);
});

test('falls back to the product id when the price is unknown', () => {
  // Useful when a new price is added in the Stripe dashboard before it is deployed here.
  assert.equal(planForStripePrice('price_brand_new', stripePrices.pro.productId)?.id, 'pro');
});

test('returns null for identifiers belonging to another product', () => {
  assert.equal(planForStripePrice('price_not_ours', 'prod_not_ours'), null);
  assert.equal(planForStripePrice(null, null), null);
});

test('paid tiers grant a larger event allowance than the free tier', () => {
  assert.equal(eventLimitFor('hobby'), 10_000);
  assert.ok(eventLimitFor('pro') > eventLimitFor('hobby'));
  assert.ok(eventLimitFor('scale') > eventLimitFor('pro'));
});

test('plan ids match the tenants.plan CHECK constraint in the schema', () => {
  // The DB constrains this column; a tier the worker can produce but the DB rejects
  // would fail every purchase at write time.
  const migration = readFileSync(
    join(repoRoot, 'migrations/0003_fix_plan_check_constraint.sql'),
    'utf8',
  );
  const allowed = migration.match(/CHECK\(plan IN \(([^)]+)\)\)/)?.[1] ?? '';

  for (const plan of PLANS) {
    assert.ok(allowed.includes(`'${plan.id}'`), `'${plan.id}' is not allowed by the CHECK constraint`);
  }
});
