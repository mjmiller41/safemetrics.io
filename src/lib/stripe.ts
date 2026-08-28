/**
 * Starts a Stripe Checkout session.
 *
 * Only the tier and the interval are sent. The worker looks up the price and the
 * redirect URLs itself — anything the browser named would be a value the buyer
 * could edit, and a buyer must not get to choose what they are charged or where
 * Stripe sends them afterwards.
 */
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

  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      planId,
      interval: isYearly ? 'year' : 'month',
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
