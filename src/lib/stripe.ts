import stripePrices from './stripe-prices.json';

export interface CheckoutOptions {
  planId: 'pro' | 'scale';
  interval?: 'month' | 'year' | 'monthly' | 'yearly';
  userId?: string;
  userEmail?: string;
}

export async function redirectToCheckout(options: CheckoutOptions): Promise<void> {
  const { planId, interval = 'monthly', userId, userEmail } = options;
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
    },
    body: JSON.stringify({
      priceId,
      planId,
      interval: isYearly ? 'year' : 'month',
      successUrl: `${origin}/?checkout=success&plan=${planId}`,
      cancelUrl: `${origin}/?checkout=cancel`,
      userId,
      userEmail,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.url) {
    throw new Error(data.error || 'Failed to initiate checkout session');
  }

  window.location.href = data.url;
}
