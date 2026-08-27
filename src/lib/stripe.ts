import stripePrices from './stripe-prices.json';

export interface CheckoutOptions {
  planId: 'pro' | 'scale';
  interval?: 'month' | 'year' | 'monthly' | 'yearly';
  /**
   * Clerk session token. Required: the worker derives the buyer from it, so a
   * checkout started without one cannot be attributed to an account and is
   * rejected before it reaches Stripe.
   */
  token: string | null;
}

export async function redirectToCheckout(options: CheckoutOptions): Promise<void> {
  const { planId, interval = 'monthly', token } = options;
  const isYearly = interval === 'yearly' || interval === 'year';

  const plan = stripePrices[planId as keyof typeof stripePrices];
  if (!plan) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }

  const priceId = isYearly ? plan.yearlyPriceId : plan.monthlyPriceId;
  const origin = window.location.origin;

  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      priceId,
      planId,
      interval: isYearly ? 'year' : 'month',
      successUrl: `${origin}/?checkout=success&plan=${planId}`,
      cancelUrl: `${origin}/?checkout=cancel`,
    }),
  });

  const data = await response.json();
  if (response.status === 401) {
    throw new Error('Sign in before upgrading so the subscription lands on your account.');
  }
  if (!response.ok || !data.url) {
    throw new Error(data.error || 'Failed to initiate checkout session');
  }

  window.location.href = data.url;
}
