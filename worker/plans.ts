/**
 * SafeMetrics billing tiers and their Stripe identifiers.
 *
 * This is the worker-side mirror of `src/lib/stripe-prices.json` (which the browser
 * bundle uses to start a checkout). It is duplicated rather than imported so the
 * worker does not depend on JSON import attributes, and `worker/plans.test.ts`
 * asserts the two stay in sync.
 *
 * Note that SafeMetrics shares a Stripe account with several other products, so the
 * webhook receives their events too. Anything whose price/product is not listed here
 * is not ours and is ignored — never assume an incoming event belongs to SafeMetrics.
 */

export type PlanId = 'hobby' | 'pro' | 'scale';

/** Tier a tenant falls back to when there is no paid, non-delinquent subscription. */
export const FREE_PLAN: PlanId = 'hobby';

export type BillingInterval = 'month' | 'year';

export interface PlanDefinition {
  id: PlanId;
  /** Stripe product id, or null for the un-purchasable free tier. */
  productId: string | null;
  /** Null for the free tier, which cannot be bought. */
  monthlyPriceId: string | null;
  yearlyPriceId: string | null;
  monthlyEventLimit: number;
}

export const PLANS: readonly PlanDefinition[] = [
  {
    id: 'hobby',
    productId: null,
    monthlyPriceId: null,
    yearlyPriceId: null,
    monthlyEventLimit: 10_000,
  },
  {
    id: 'pro',
    productId: 'prod_V6QqyssPLNeRlG',
    monthlyPriceId: 'price_1U6Dz4PBWBDAqxdymkxssdMb',
    yearlyPriceId: 'price_1U6Dz5PBWBDAqxdy4cVoNgWW',
    monthlyEventLimit: 250_000,
  },
  {
    id: 'scale',
    productId: 'prod_V6QqyyUstlYJqe',
    monthlyPriceId: 'price_1U6Dz6PBWBDAqxdyNXNm7hRO',
    yearlyPriceId: 'price_1U6Dz6PBWBDAqxdylcp9SfZc',
    monthlyEventLimit: 2_500_000,
  },
];

/** Every Stripe price that grants this tier. */
export function priceIdsFor(plan: PlanDefinition): string[] {
  return [plan.monthlyPriceId, plan.yearlyPriceId].filter((id): id is string => id !== null);
}

/**
 * The price to charge for a tier at a given interval.
 *
 * `/api/checkout` resolves the price through here rather than accepting one from
 * the caller. Letting the client name the price would let it pick any price on the
 * Stripe account — including a cheaper one attached to the same product — and still
 * be granted the tier it asked for.
 */
export function priceForPlan(plan: PlanDefinition, interval: BillingInterval): string | null {
  return interval === 'year' ? plan.yearlyPriceId : plan.monthlyPriceId;
}

export function planById(id: string | null | undefined): PlanDefinition | null {
  if (!id) return null;
  return PLANS.find((plan) => plan.id === id) ?? null;
}

/**
 * Maps a Stripe price (preferred) or product back to a SafeMetrics tier.
 * Returns null when the identifiers belong to another product on the same account.
 */
export function planForStripePrice(
  priceId: string | null | undefined,
  productId?: string | null,
): PlanDefinition | null {
  if (priceId) {
    const byPrice = PLANS.find((plan) => priceIdsFor(plan).includes(priceId));
    if (byPrice) return byPrice;
  }

  if (productId) {
    const byProduct = PLANS.find((plan) => plan.productId === productId);
    if (byProduct) return byProduct;
  }

  return null;
}

export function eventLimitFor(id: PlanId): number {
  return planById(id)?.monthlyEventLimit ?? PLANS[0].monthlyEventLimit;
}
