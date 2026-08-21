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

export interface PlanDefinition {
  id: PlanId;
  /** Stripe product id, or null for the un-purchasable free tier. */
  productId: string | null;
  /** Every Stripe price (monthly and yearly) that grants this tier. */
  priceIds: string[];
  monthlyEventLimit: number;
}

export const PLANS: readonly PlanDefinition[] = [
  {
    id: 'hobby',
    productId: null,
    priceIds: [],
    monthlyEventLimit: 10_000,
  },
  {
    id: 'pro',
    productId: 'prod_V6QqyssPLNeRlG',
    priceIds: ['price_1U6Dz4PBWBDAqxdymkxssdMb', 'price_1U6Dz5PBWBDAqxdy4cVoNgWW'],
    monthlyEventLimit: 250_000,
  },
  {
    id: 'scale',
    productId: 'prod_V6QqyyUstlYJqe',
    priceIds: ['price_1U6Dz6PBWBDAqxdyNXNm7hRO', 'price_1U6Dz6PBWBDAqxdylcp9SfZc'],
    monthlyEventLimit: 2_500_000,
  },
];

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
    const byPrice = PLANS.find((plan) => plan.priceIds.includes(priceId));
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
