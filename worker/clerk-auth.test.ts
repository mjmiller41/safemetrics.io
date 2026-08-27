import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

import { bearerTokenFrom, resetJwksCache, verifyClerkToken } from './clerk-auth.ts';
import { createTestKeyPair, jwksFetcherFor, signTestToken, TEST_ISSUER } from './test-support/clerk-jwt.ts';

const key = await createTestKeyPair();
const otherKey = await createTestKeyPair('test-key-1'); // same kid, different key material

function verify(token: string | null, overrides: Record<string, unknown> = {}) {
  return verifyClerkToken({
    token,
    issuer: TEST_ISSUER,
    fetchJwks: jwksFetcherFor(key),
    ...overrides,
  });
}

describe('bearerTokenFrom', () => {
  it('reads the token regardless of header case and spacing', () => {
    const request = new Request('https://example.test/', {
      headers: { authorization: 'bearer   abc.def.ghi  ' },
    });
    assert.equal(bearerTokenFrom(request), 'abc.def.ghi');
  });

  it('returns null when there is no bearer credential', () => {
    assert.equal(bearerTokenFrom(new Request('https://example.test/')), null);
    assert.equal(
      bearerTokenFrom(new Request('https://example.test/', { headers: { authorization: 'Basic abc' } })),
      null,
    );
  });
});

describe('verifyClerkToken', () => {
  beforeEach(() => resetJwksCache());

  it('accepts a well-formed token and surfaces the identity claims', async () => {
    const token = await signTestToken(key, {
      sub: 'user_2abc',
      email: 'owner@acme.test',
      name: 'Acme Owner',
      orgId: 'org_42',
    });

    const result = await verify(token);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.claims, {
      sub: 'user_2abc',
      email: 'owner@acme.test',
      name: 'Acme Owner',
      orgId: 'org_42',
    });
  });

  it('accepts the default session token shape, which carries no email', async () => {
    const result = await verify(await signTestToken(key, { sub: 'user_bare' }));
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.claims.email, null);
  });

  it('rejects a token signed by a different key with the same kid', async () => {
    const forged = await signTestToken(otherKey, { sub: 'user_2abc' });
    assert.deepEqual(await verify(forged), { ok: false, reason: 'bad_signature' });
  });

  it('rejects a tampered payload', async () => {
    const token = await signTestToken(key, { sub: 'user_2abc' });
    const [header, , signature] = token.split('.');
    const swapped = btoa(JSON.stringify({ sub: 'user_victim', iss: TEST_ISSUER, exp: 9999999999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    assert.deepEqual(await verify(`${header}.${swapped}.${signature}`), {
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects expired and not-yet-valid tokens', async () => {
    assert.deepEqual(await verify(await signTestToken(key, { expiresInSeconds: -3600 })), {
      ok: false,
      reason: 'expired',
    });
    assert.deepEqual(await verify(await signTestToken(key, { notBeforeOffsetSeconds: 3600 })), {
      ok: false,
      reason: 'not_yet_valid',
    });
  });

  it('tolerates small clock skew rather than rejecting fresh tokens', async () => {
    const result = await verify(await signTestToken(key, { expiresInSeconds: -5 }));
    assert.equal(result.ok, true);
  });

  it('rejects a token minted by another Clerk instance', async () => {
    const token = await signTestToken(key, { issuer: 'https://clerk.attacker.test' });
    assert.deepEqual(await verify(token), { ok: false, reason: 'issuer_mismatch' });
  });

  it('rejects unsigned (alg: none) tokens', async () => {
    const token = await signTestToken(key, { algorithm: 'none' });
    assert.deepEqual(await verify(token), { ok: false, reason: 'unsupported_algorithm' });
  });

  it('rejects a kid that is not in the JWKS', async () => {
    const token = await signTestToken(key, { kid: 'not-published' });
    assert.deepEqual(await verify(token), { ok: false, reason: 'unknown_key' });
  });

  it('reports missing configuration rather than accepting anything', async () => {
    assert.deepEqual(await verify(await signTestToken(key), { issuer: undefined }), {
      ok: false,
      reason: 'not_configured',
    });
  });

  it('reports a missing or malformed token distinctly', async () => {
    assert.deepEqual(await verify(null), { ok: false, reason: 'missing_token' });
    assert.deepEqual(await verify('not-a-jwt'), { ok: false, reason: 'malformed_token' });
  });

  it('fails closed when the JWKS cannot be fetched', async () => {
    const result = await verify(await signTestToken(key), {
      fetchJwks: async () => {
        throw new Error('network down');
      },
    });
    assert.deepEqual(result, { ok: false, reason: 'jwks_unavailable' });
  });

  it('caches the JWKS across verifications', async () => {
    let fetches = 0;
    const counting = async () => {
      fetches += 1;
      return key.jwks;
    };

    await verify(await signTestToken(key), { fetchJwks: counting });
    await verify(await signTestToken(key), { fetchJwks: counting });
    assert.equal(fetches, 1);
  });

  it('re-fetches the JWKS when an unseen kid appears, so key rotation takes effect', async () => {
    let fetches = 0;
    const counting = async () => {
      fetches += 1;
      return key.jwks;
    };

    await verify(await signTestToken(key), { fetchJwks: counting });
    await verify(await signTestToken(key, { kid: 'rotated' }), { fetchJwks: counting });
    assert.equal(fetches, 2);
  });
});
