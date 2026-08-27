/**
 * Mints Clerk-shaped RS256 session tokens for tests.
 *
 * Real Clerk tokens are RS256 JWTs verified against the instance's JWKS, so the
 * tests generate their own key pair and serve its public half as a JWKS. That means
 * `verifyClerkToken` runs its actual signature path rather than a stub — a test can
 * sign with the wrong key and genuinely be rejected.
 */

export const TEST_ISSUER = 'https://clerk.test.safemetrics.io';

export interface TestKeyPair {
  kid: string;
  privateKey: CryptoKey;
  jwks: { keys: JsonWebKey[] };
}

export async function createTestKeyPair(kid = 'test-key-1'): Promise<TestKeyPair> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    kid,
    privateKey: pair.privateKey,
    jwks: { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' } as JsonWebKey] },
  };
}

export interface TokenOptions {
  sub?: string;
  email?: string | null;
  name?: string | null;
  orgId?: string | null;
  issuer?: string;
  expiresInSeconds?: number;
  notBeforeOffsetSeconds?: number;
  kid?: string;
  algorithm?: string;
}

export async function signTestToken(key: TestKeyPair, options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: options.algorithm ?? 'RS256', typ: 'JWT', kid: options.kid ?? key.kid };
  const payload: Record<string, unknown> = {
    sub: options.sub ?? 'user_clerk_123',
    iss: options.issuer ?? TEST_ISSUER,
    iat: now,
    exp: now + (options.expiresInSeconds ?? 3600),
  };
  if (options.notBeforeOffsetSeconds !== undefined) payload.nbf = now + options.notBeforeOffsetSeconds;
  if (options.email !== undefined && options.email !== null) payload.email = options.email;
  if (options.name !== undefined && options.name !== null) payload.name = options.name;
  if (options.orgId !== undefined && options.orgId !== null) payload.org_id = options.orgId;

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
}

/** A `fetchJwks` implementation that serves this key pair's public half. */
export function jwksFetcherFor(key: TestKeyPair) {
  return async () => key.jwks;
}

function base64Url(value: string): string {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
