/**
 * Stripe webhook signature verification for the Cloudflare Workers runtime.
 *
 * Implements Stripe's documented scheme
 * (https://docs.stripe.com/webhooks#verify-manually) using Web Crypto only. The
 * `stripe` Node SDK's `constructEvent` is not usable in a Worker, so this is a
 * from-scratch equivalent.
 *
 * The signed payload is the *raw* request body. It must be the exact bytes Stripe
 * sent — parsing and re-serialising the JSON will change the signature and every
 * event will be rejected.
 */

const encoder = new TextEncoder();

/** Stripe's default replay window, in seconds. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export type VerifyFailureReason =
  | 'missing_secret'
  | 'missing_header'
  | 'malformed_header'
  | 'timestamp_out_of_tolerance'
  | 'no_matching_signature';

export interface VerifyResult {
  ok: boolean;
  reason?: VerifyFailureReason;
}

export interface ParsedSignatureHeader {
  timestamp: number | null;
  signatures: string[];
}

export interface VerifyOptions {
  /** Raw request body, exactly as received. */
  payload: string;
  /** Value of the `Stripe-Signature` header. */
  header: string | null | undefined;
  /** Endpoint secret (`whsec_...`). Used verbatim as the HMAC key. */
  secret: string | null | undefined;
  /** Reject events older/newer than this many seconds. Pass 0 to disable. */
  toleranceSeconds?: number;
  /** Current time in unix seconds. Injectable so tests are not clock-dependent. */
  nowSeconds?: number;
}

/**
 * Parses a `Stripe-Signature` header of the form `t=<unix>,v1=<hex>,v1=<hex>,v0=<hex>`.
 *
 * Multiple `v1` values appear while an endpoint secret is being rotated, so all of
 * them are collected and any one matching is sufficient. `v0` is a legacy test-mode
 * scheme and is deliberately ignored.
 */
export function parseStripeSignatureHeader(
  header: string | null | undefined,
): ParsedSignatureHeader {
  const parsed: ParsedSignatureHeader = { timestamp: null, signatures: [] };
  if (!header) return parsed;

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!value) continue;

    if (key === 't') {
      const timestamp = Number.parseInt(value, 10);
      if (Number.isFinite(timestamp)) parsed.timestamp = timestamp;
    } else if (key === 'v1') {
      parsed.signatures.push(value);
    }
  }

  return parsed;
}

/** Computes the expected `v1` signature for a payload/timestamp pair. */
export async function computeStripeSignature(
  payload: string,
  timestamp: number,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));

  return Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compares two hex digests without early-exiting on the first differing character,
 * so an attacker cannot narrow down a forged signature by timing the endpoint.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/**
 * Verifies a Stripe webhook signature.
 *
 * Returns a result rather than throwing so the caller can map each failure mode to
 * the right HTTP status — every reason here is permanent, so callers should answer
 * 4xx and let Stripe stop retrying, except `missing_secret` which is our own
 * misconfiguration and warrants a 5xx.
 */
export async function verifyStripeSignature(options: VerifyOptions): Promise<VerifyResult> {
  const {
    payload,
    header,
    secret,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
    nowSeconds,
  } = options;

  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!header) return { ok: false, reason: 'missing_header' };

  const { timestamp, signatures } = parseStripeSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) {
    return { ok: false, reason: 'malformed_header' };
  }

  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (toleranceSeconds > 0 && Math.abs(now - timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  const expected = await computeStripeSignature(payload, timestamp, secret);
  for (const signature of signatures) {
    if (timingSafeEqual(expected, signature)) return { ok: true };
  }

  return { ok: false, reason: 'no_matching_signature' };
}
