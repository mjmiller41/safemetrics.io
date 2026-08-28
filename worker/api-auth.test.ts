/**
 * End-to-end tests for the authenticated API surface, driven through the worker's
 * real `fetch` handler so routing, status codes and tenant scoping are all covered.
 *
 * The JWKS is served by a stubbed global fetch; tokens are genuinely signed, so a
 * request with a forged or foreign token fails for the real reason.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import worker from './index.ts';
import { resetJwksCache } from './clerk-auth.ts';
import { claimDomain } from './tenancy.ts';
import { planById } from './plans.ts';
import { createTestDatabase, type FakeD1 } from './test-support/d1-fake.ts';
import { createTestKeyPair, signTestToken, TEST_ISSUER } from './test-support/clerk-jwt.ts';

const key = await createTestKeyPair();
const foreignKey = await createTestKeyPair('test-key-1');

const realFetch = globalThis.fetch;

const ctx = {
  waitUntil(promise: Promise<unknown>) {
    // Awaited by callers via `pending` below so assertions see the write.
    pending.push(promise);
  },
  passThroughOnException() {},
} as ExecutionContext;

let pending: Promise<unknown>[] = [];

function envFor(db: FakeD1, overrides: Record<string, unknown> = {}) {
  return {
    DB: db as any,
    ASSETS: { fetch: async () => new Response('<html>spa</html>') } as any,
    CLERK_ISSUER: TEST_ISSUER,
    ...overrides,
  };
}

async function call(env: any, path: string, init: RequestInit = {}) {
  pending = [];
  const response = await worker.fetch(new Request(`https://safemetrics.io${path}`, init), env, ctx);
  await Promise.all(pending);
  return response;
}

function authed(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers as any), Authorization: `Bearer ${token}` } };
}

/** Form bodies the worker sent to Stripe, so tests can assert what was charged. */
let stripeRequests: URLSearchParams[] = [];

beforeEach(() => {
  resetJwksCache();
  stripeRequests = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url ?? input);
    if (url === `${TEST_ISSUER}/.well-known/jwks.json`) {
      return new Response(JSON.stringify(key.jwks), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') {
      stripeRequests.push(new URLSearchParams(String(init?.body ?? '')));
      return new Response(
        JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', id: 'cs_test_1' }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('authentication', () => {
  for (const path of ['/api/me', '/api/stats?domain=example.com']) {
    it(`rejects an unauthenticated GET ${path}`, async () => {
      const response = await call(envFor(createTestDatabase()), path);
      assert.equal(response.status, 401);
      assert.equal((await response.json() as any).reason, 'missing_token');
    });
  }

  it('rejects a token signed by someone else', async () => {
    const token = await signTestToken(foreignKey);
    const response = await call(envFor(createTestDatabase()), '/api/me', authed(token));
    assert.equal(response.status, 401);
  });

  it('answers 503, not 200, when Clerk is not configured', async () => {
    const token = await signTestToken(key);
    const env = envFor(createTestDatabase(), { CLERK_ISSUER: undefined });
    const response = await call(env, '/api/me', authed(token));
    assert.equal(response.status, 503);
  });

  it('leaves the health endpoint public', async () => {
    const response = await call(envFor(createTestDatabase()), '/api/health');
    assert.equal(response.status, 200);
  });
});

describe('GET /api/me', () => {
  it('provisions a tenant on the first authenticated request', async () => {
    const db = createTestDatabase();
    const token = await signTestToken(key, { sub: 'user_fresh', email: 'fresh@acme.test' });

    const response = await call(envFor(db), '/api/me', authed(token));
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(body.userId, 'user_fresh');
    assert.equal(body.plan, 'hobby');
    assert.equal(body.provisioned, true);
    assert.deepEqual(body.domains, []);
    assert.equal(db.one('SELECT id FROM users WHERE id = ?', 'user_fresh')?.id, 'user_fresh');
  });
});

describe('POST /api/domains', () => {
  it('registers a domain to the caller and lists it back', async () => {
    const db = createTestDatabase();
    const token = await signTestToken(key, { sub: 'user_fresh' });
    const env = envFor(db);

    const created = await call(env, '/api/domains', authed(token, {
      method: 'POST',
      body: JSON.stringify({ domain: 'https://www.Example.com' }),
    }));
    assert.equal(created.status, 201);
    assert.equal((await created.json() as any).domain, 'example.com');

    const me = await call(env, '/api/me', authed(token));
    assert.deepEqual((await me.json() as any).domains, ['example.com']);
  });

  it('refuses a domain another tenant already registered', async () => {
    const db = createTestDatabase();
    await claimDomain(db as any, 'tenant_acme', 'example.com');

    const token = await signTestToken(key, { sub: 'user_fresh' });
    const response = await call(envFor(db), '/api/domains', authed(token, {
      method: 'POST',
      body: JSON.stringify({ domain: 'example.com' }),
    }));

    assert.equal(response.status, 409);
  });

  it('rejects an unusable domain', async () => {
    const token = await signTestToken(key, { sub: 'user_fresh' });
    const response = await call(envFor(createTestDatabase()), '/api/domains', authed(token, {
      method: 'POST',
      body: JSON.stringify({ domain: 'localhost' }),
    }));
    assert.equal(response.status, 400);
  });
});

describe('GET /api/stats', () => {
  it('returns stats for a domain the caller owns', async () => {
    const db = createTestDatabase();
    await claimDomain(db as any, 'tenant_acme', 'acme.test');
    db.sqlite.exec(`
      INSERT INTO events (id, tenant_id, domain_id, url_path, referrer, session_hash)
      SELECT 'evt_1', 'tenant_acme', id, '/pricing', 'Direct', 'hash_a' FROM domains WHERE domain_name = 'acme.test';
    `);

    const token = await signTestToken(key, { sub: 'user_clerk_123' });
    const response = await call(envFor(db), '/api/stats?domain=acme.test', authed(token));
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(body.domain, 'acme.test');
    assert.equal(body.tenantId, 'tenant_acme');
    assert.equal(body.summary.pageviews, 1);
    assert.equal(body.summary.visitors, 1);
    assert.deepEqual(body.topPages, [{ name: '/pricing', views: 1, visitors: 1 }]);
    assert.equal(body.timeframe, '7d', 'defaults to a week when none is asked for');
  });

  it('honours an explicit timeframe and rejects an invalid one', async () => {
    const db = createTestDatabase();
    await claimDomain(db as any, 'tenant_acme', 'acme.test');
    const token = await signTestToken(key, { sub: 'user_clerk_123' });

    const ok = await call(envFor(db), '/api/stats?domain=acme.test&timeframe=30d', authed(token));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json() as any).timeframe, '30d');

    const bad = await call(envFor(db), '/api/stats?domain=acme.test&timeframe=7years', authed(token));
    assert.equal(bad.status, 400);
    assert.equal((await bad.json() as any).error, 'invalid_timeframe');
  });

  it("refuses another tenant's domain", async () => {
    const db = createTestDatabase();
    await claimDomain(db as any, 'tenant_acme', 'acme.test');

    // A brand new user, provisioned by this very request, must not see acme.test.
    const token = await signTestToken(key, { sub: 'user_intruder' });
    const response = await call(envFor(db), '/api/stats?domain=acme.test', authed(token));

    assert.equal(response.status, 404); // no domains of their own yet
    await claimDomain(db as any, (await currentTenant(db, 'user_intruder')), 'intruder.test');

    const second = await call(envFor(db), '/api/stats?domain=acme.test', authed(token));
    assert.equal(second.status, 403);
    assert.equal((await second.json() as any).error, 'domain_not_owned');
  });

  it('defaults to the caller’s own first domain instead of a hardcoded one', async () => {
    const db = createTestDatabase();
    await claimDomain(db as any, 'tenant_acme', 'acme.test');

    const token = await signTestToken(key, { sub: 'user_clerk_123' });
    const response = await call(envFor(db), '/api/stats', authed(token));

    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).domain, 'acme.test');
  });
});

describe('POST /api/event', () => {
  it('records an event for a registered domain', async () => {
    const db = createTestDatabase();
    await claimDomain(db as any, 'tenant_acme', 'acme.test');

    const response = await call(envFor(db), '/api/event', {
      method: 'POST',
      body: JSON.stringify({ d: 'acme.test', u: 'https://acme.test/pricing' }),
    });

    assert.equal(response.status, 200);
    const event = db.one<{ tenant_id: string; url_path: string }>('SELECT tenant_id, url_path FROM events');
    assert.equal(event?.tenant_id, 'tenant_acme');
    assert.equal(event?.url_path, '/pricing');
  });

  it('drops events for unregistered domains instead of minting a shared pro tenant', async () => {
    const db = createTestDatabase();

    const response = await call(envFor(db), '/api/event', {
      method: 'POST',
      body: JSON.stringify({ d: 'stranger.test', u: 'https://stranger.test/' }),
    });

    assert.equal(response.status, 202);
    assert.equal((await response.json() as any).reason, 'domain_not_registered');
    assert.equal(db.query('SELECT id FROM events').length, 0);
    assert.equal(db.one('SELECT id FROM tenants WHERE id = ?', 'tenant_default'), null);
  });

  it('varies the visitor hash with the configured salt', async () => {
    const hashes: string[] = [];
    for (const salt of ['salt-one', 'salt-two']) {
      const db = createTestDatabase();
      await claimDomain(db as any, 'tenant_acme', 'acme.test');
      await call(envFor(db, { SESSION_SALT: salt }), '/api/event', {
        method: 'POST',
        body: JSON.stringify({ d: 'acme.test', u: 'https://acme.test/' }),
      });
      hashes.push(db.one<{ session_hash: string }>('SELECT session_hash FROM events')!.session_hash);
    }
    assert.notEqual(hashes[0], hashes[1]);
  });
});

describe('POST /api/checkout', () => {
  it('requires authentication so a purchase can be attributed to a tenant', async () => {
    const response = await call(envFor(createTestDatabase()), '/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId: 'price_123' }),
    });
    assert.equal(response.status, 401);
  });

  it('sends the verified Clerk user id as client_reference_id, ignoring the body', async () => {
    const db = createTestDatabase();
    const token = await signTestToken(key, { sub: 'user_buyer', email: 'buyer@acme.test' });

    let sent: URLSearchParams | null = null;
    const jwksFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = String(input?.url ?? input);
      if (url === 'https://api.stripe.com/v1/checkout/sessions') {
        sent = new URLSearchParams(String(init?.body));
        return new Response(JSON.stringify({ url: 'https://checkout.stripe.test/s', id: 'cs_test_1' }));
      }
      return jwksFetch(input, init);
    }) as typeof fetch;

    const response = await call(envFor(db, { STRIPE_SECRET_KEY: 'sk_test_x' }), '/api/checkout', authed(token, {
      method: 'POST',
      body: JSON.stringify({ priceId: 'price_123', planId: 'pro', userId: 'user_victim', userEmail: 'victim@acme.test' }),
    }));

    assert.equal(response.status, 200);
    assert.equal(sent!.get('client_reference_id'), 'user_buyer');
    assert.equal(sent!.get('customer_email'), 'buyer@acme.test');
    // And the buyer now exists in D1, so the webhook can resolve the tenant.
    assert.ok(db.one('SELECT id FROM users WHERE id = ?', 'user_buyer'));
  });

  /**
   * A caller used to send `priceId` and `planId` independently, and the webhook
   * trusted `planId` over the price. Paying the `pro` price while naming `scale`
   * granted `scale`. Both now derive from one looked-up plan.
   */
  it('charges the price for the requested tier, ignoring any priceId in the body', async () => {
    const token = await signTestToken(key, { sub: 'user_buyer' });

    const response = await call(
      envFor(createTestDatabase(), { STRIPE_SECRET_KEY: 'sk_test_x' }),
      '/api/checkout',
      authed(token, {
        method: 'POST',
        // Pays for pro, asks to be granted scale.
        body: JSON.stringify({ planId: 'scale', priceId: planById('pro')!.monthlyPriceId }),
      }),
    );

    assert.equal(response.status, 200);
    const sent = stripeRequests[0];
    assert.equal(sent.get('line_items[0][price]'), planById('scale')!.monthlyPriceId);
    assert.equal(sent.get('metadata[planId]'), 'scale');
  });

  it('uses the yearly price when the yearly interval is requested', async () => {
    const token = await signTestToken(key, { sub: 'user_buyer' });

    await call(
      envFor(createTestDatabase(), { STRIPE_SECRET_KEY: 'sk_test_x' }),
      '/api/checkout',
      authed(token, { method: 'POST', body: JSON.stringify({ planId: 'pro', interval: 'year' }) }),
    );

    assert.equal(stripeRequests[0].get('line_items[0][price]'), planById('pro')!.yearlyPriceId);
  });

  it('refuses a tier that is not a paid plan', async () => {
    const token = await signTestToken(key, { sub: 'user_buyer' });

    for (const planId of ['enterprise', 'hobby', '', null]) {
      const response = await call(
        envFor(createTestDatabase(), { STRIPE_SECRET_KEY: 'sk_test_x' }),
        '/api/checkout',
        authed(token, { method: 'POST', body: JSON.stringify({ planId }) }),
      );
      assert.equal(response.status, 400, `planId ${JSON.stringify(planId)} should be rejected`);
      assert.equal((await response.json() as any).error, 'unknown_plan');
    }

    assert.equal(stripeRequests.length, 0, 'nothing should reach Stripe');
  });

  it('builds its own redirect URLs rather than taking them from the caller', async () => {
    const token = await signTestToken(key, { sub: 'user_buyer' });

    await call(
      envFor(createTestDatabase(), { STRIPE_SECRET_KEY: 'sk_test_x' }),
      '/api/checkout',
      authed(token, {
        method: 'POST',
        body: JSON.stringify({
          planId: 'pro',
          successUrl: 'https://evil.test/thanks',
          cancelUrl: 'https://evil.test/cancel',
        }),
      }),
    );

    const sent = stripeRequests[0];
    assert.equal(sent.get('success_url'), 'https://safemetrics.io/?checkout=success&plan=pro');
    assert.equal(sent.get('cancel_url'), 'https://safemetrics.io/?checkout=cancel');
  });

  it('does not hand Stripe’s error text back to the caller', async () => {
    const token = await signTestToken(key, { sub: 'user_buyer' });
    const jwksFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = String(input?.url ?? input);
      if (url === 'https://api.stripe.com/v1/checkout/sessions') {
        return new Response(JSON.stringify({ error: { message: 'No such price: acct_1U5ATy internals' } }), { status: 400 });
      }
      return jwksFetch(input, init);
    }) as typeof fetch;

    const response = await call(
      envFor(createTestDatabase(), { STRIPE_SECRET_KEY: 'sk_test_x' }),
      '/api/checkout',
      authed(token, { method: 'POST', body: JSON.stringify({ planId: 'pro' }) }),
    );

    const body = await response.text();
    assert.equal(response.status, 502);
    assert.ok(!body.includes('acct_1U5ATy'), 'Stripe account internals must not be echoed');
    assert.equal(JSON.parse(body).error, 'checkout_failed');
  });
});

async function currentTenant(db: FakeD1, userId: string): Promise<string> {
  return db.one<{ tenant_id: string }>('SELECT tenant_id FROM users WHERE id = ?', userId)!.tenant_id;
}
