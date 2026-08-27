/**
 * Clerk session-token verification for the Cloudflare Workers runtime.
 *
 * Clerk signs session JWTs with RS256 and publishes the public keys at
 * `<issuer>/.well-known/jwks.json`. `@clerk/backend` cannot run here (it expects a
 * Node runtime), so this verifies the token directly with Web Crypto.
 *
 * What is checked, in order: header alg, signature against the JWKS key named by
 * `kid`, `exp`/`nbf` with a small clock skew allowance, and `iss` against the
 * configured issuer. A token that fails any of these is rejected — there is no
 * "unverified but probably fine" path, because these claims are the only thing
 * standing between a caller and someone else's analytics.
 */

export type AuthFailureReason =
  | 'not_configured'
  | 'missing_token'
  | 'malformed_token'
  | 'unsupported_algorithm'
  | 'unknown_key'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'issuer_mismatch'
  | 'missing_subject'
  | 'jwks_unavailable';

export interface ClerkClaims {
  /** Clerk user id, e.g. `user_2abc...`. */
  sub: string;
  email: string | null;
  name: string | null;
  /** Clerk organization id when the session is scoped to one. */
  orgId: string | null;
}

export type AuthResult =
  | { ok: true; claims: ClerkClaims }
  | { ok: false; reason: AuthFailureReason };

export interface VerifyClerkTokenOptions {
  token: string | null | undefined;
  /** Clerk Frontend API origin, e.g. `https://clerk.example.com`. */
  issuer: string | undefined;
  nowSeconds?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchJwks?: (url: string) => Promise<JsonWebKeySet | null>;
}

export interface JsonWebKeySet {
  keys: JsonWebKey[];
}

/** Tolerated clock skew between Clerk and the edge, in seconds. */
const CLOCK_SKEW_SECONDS = 30;

/**
 * How long a fetched JWKS is reused. Clerk rotates signing keys rarely, and a
 * verification failure re-fetches immediately (see `keyFor`), so this only bounds
 * how long a *revoked* key stays usable.
 */
const JWKS_TTL_MS = 10 * 60 * 1000;

interface CachedJwks {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

/**
 * Per-isolate JWKS cache. Workers isolates are short-lived and there is one entry
 * per issuer, so this cannot grow unbounded.
 */
const jwksCache = new Map<string, CachedJwks>();

/** Clears the cache. Exported for tests. */
export function resetJwksCache(): void {
  jwksCache.clear();
}

export function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export async function verifyClerkToken(options: VerifyClerkTokenOptions): Promise<AuthResult> {
  const { token, issuer } = options;

  if (!issuer) return { ok: false, reason: 'not_configured' };
  if (!token) return { ok: false, reason: 'missing_token' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed_token' };

  const [headerPart, payloadPart, signaturePart] = parts;

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(decodeSegment(headerPart));
    payload = JSON.parse(decodeSegment(payloadPart));
  } catch {
    return { ok: false, reason: 'malformed_token' };
  }

  if (header?.alg !== 'RS256') return { ok: false, reason: 'unsupported_algorithm' };
  if (typeof header?.kid !== 'string') return { ok: false, reason: 'unknown_key' };

  const normalizedIssuer = trimTrailingSlash(issuer);
  const key = await keyFor(normalizedIssuer, header.kid, options.fetchJwks);
  if (key === 'unavailable') return { ok: false, reason: 'jwks_unavailable' };
  if (!key) return { ok: false, reason: 'unknown_key' };

  const signature = base64UrlToBytes(signaturePart);
  const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
  if (!valid) return { ok: false, reason: 'bad_signature' };

  // Claims are only trustworthy after the signature check above.
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (typeof payload.exp === 'number' && now > payload.exp + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof payload.nbf === 'number' && now < payload.nbf - CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'not_yet_valid' };
  }
  if (trimTrailingSlash(String(payload.iss ?? '')) !== normalizedIssuer) {
    return { ok: false, reason: 'issuer_mismatch' };
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    return { ok: false, reason: 'missing_subject' };
  }

  return {
    ok: true,
    claims: {
      sub: payload.sub,
      // Clerk's default session token carries no email; these are present when the
      // instance's JWT template adds them. Everything downstream treats them as
      // optional rather than assuming a particular template.
      email: firstString(payload.email, payload.primary_email_address, payload.email_address),
      name: firstString(payload.name, payload.full_name),
      orgId: firstString(payload.org_id, payload.orgId),
    },
  };
}

/**
 * Returns the verification key for `kid`, fetching the JWKS when it is not cached.
 *
 * A cache miss on a previously-cached JWKS forces a re-fetch: that is what makes
 * key rotation take effect immediately instead of after the TTL.
 */
async function keyFor(
  issuer: string,
  kid: string,
  fetchJwks?: (url: string) => Promise<JsonWebKeySet | null>,
): Promise<CryptoKey | null | 'unavailable'> {
  const cached = jwksCache.get(issuer);
  const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;

  if (fresh && cached.keys.has(kid)) return cached.keys.get(kid)!;

  const url = `${issuer}/.well-known/jwks.json`;
  let jwks: JsonWebKeySet | null;
  try {
    jwks = fetchJwks ? await fetchJwks(url) : await defaultFetchJwks(url);
  } catch {
    jwks = null;
  }

  if (!jwks?.keys?.length) {
    // Fall back to a stale-but-present key rather than failing every request during
    // a Clerk outage; only report unavailable when there is nothing at all.
    if (cached?.keys.has(kid)) return cached.keys.get(kid)!;
    return 'unavailable';
  }

  const keys = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys) {
    const jwkKid = (jwk as any).kid;
    if (typeof jwkKid !== 'string') continue;
    try {
      keys.set(
        jwkKid,
        await crypto.subtle.importKey(
          'jwk',
          { ...jwk, alg: 'RS256', ext: true },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        ),
      );
    } catch {
      // A key we cannot import is a key we cannot verify with; skip it.
    }
  }

  jwksCache.set(issuer, { keys, fetchedAt: Date.now() });
  return keys.get(kid) ?? null;
}

async function defaultFetchJwks(url: string): Promise<JsonWebKeySet | null> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  return (await response.json()) as JsonWebKeySet;
}

function decodeSegment(segment: string): string {
  return new TextDecoder().decode(base64UrlToBytes(segment));
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
