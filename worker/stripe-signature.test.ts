import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeStripeSignature,
  parseStripeSignatureHeader,
  verifyStripeSignature,
} from './stripe-signature.ts';

const SECRET = 'whsec_test_ynP4vXsQZ8kL2mNbR7tGjW9cF3dH6aE1';
const PAYLOAD = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
const NOW = 1_760_000_000;

/** Builds a genuine `Stripe-Signature` header the way Stripe would. */
async function signHeader(
  payload: string,
  timestamp: number,
  secret = SECRET,
): Promise<string> {
  return `t=${timestamp},v1=${await computeStripeSignature(payload, timestamp, secret)}`;
}

test('parses a well-formed signature header', () => {
  const parsed = parseStripeSignatureHeader('t=1614556800,v1=aaa,v0=bbb,v1=ccc');

  assert.equal(parsed.timestamp, 1614556800);
  // Both v1 candidates are kept (secret rotation); the legacy v0 scheme is dropped.
  assert.deepEqual(parsed.signatures, ['aaa', 'ccc']);
});

test('accepts a correctly signed payload', async () => {
  const result = await verifyStripeSignature({
    payload: PAYLOAD,
    header: await signHeader(PAYLOAD, NOW),
    secret: SECRET,
    nowSeconds: NOW,
  });

  assert.deepEqual(result, { ok: true });
});

test('rejects a payload signed with a different secret', async () => {
  const result = await verifyStripeSignature({
    payload: PAYLOAD,
    header: await signHeader(PAYLOAD, NOW, 'whsec_attacker_key'),
    secret: SECRET,
    nowSeconds: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_matching_signature');
});

test('rejects a payload tampered with after signing', async () => {
  const header = await signHeader(PAYLOAD, NOW);
  const tampered = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });

  const result = await verifyStripeSignature({
    payload: tampered,
    header,
    secret: SECRET,
    nowSeconds: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_matching_signature');
});

test('rejects a replayed event outside the tolerance window', async () => {
  const staleTimestamp = NOW - 3600;

  const result = await verifyStripeSignature({
    payload: PAYLOAD,
    // Correctly signed — only the age makes it invalid.
    header: await signHeader(PAYLOAD, staleTimestamp),
    secret: SECRET,
    nowSeconds: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timestamp_out_of_tolerance');
});

test('accepts an event at the edge of the tolerance window', async () => {
  const timestamp = NOW - 300;

  const result = await verifyStripeSignature({
    payload: PAYLOAD,
    header: await signHeader(PAYLOAD, timestamp),
    secret: SECRET,
    nowSeconds: NOW,
  });

  assert.equal(result.ok, true);
});

test('accepts when any one of several v1 signatures matches (secret rotation)', async () => {
  const valid = await computeStripeSignature(PAYLOAD, NOW, SECRET);
  const header = `t=${NOW},v1=${'0'.repeat(valid.length)},v1=${valid}`;

  const result = await verifyStripeSignature({
    payload: PAYLOAD,
    header,
    secret: SECRET,
    nowSeconds: NOW,
  });

  assert.equal(result.ok, true);
});

test('rejects a missing or malformed header', async () => {
  const missing = await verifyStripeSignature({
    payload: PAYLOAD,
    header: null,
    secret: SECRET,
    nowSeconds: NOW,
  });
  assert.equal(missing.reason, 'missing_header');

  for (const header of ['garbage', 't=abc,v1=def', `t=${NOW}`, 'v1=abc']) {
    const result = await verifyStripeSignature({
      payload: PAYLOAD,
      header,
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(result.ok, false, `expected ${header} to be rejected`);
    assert.equal(result.reason, 'malformed_header', `for header: ${header}`);
  }
});

test('reports a missing endpoint secret distinctly from a bad signature', async () => {
  const result = await verifyStripeSignature({
    payload: PAYLOAD,
    header: await signHeader(PAYLOAD, NOW),
    secret: undefined,
    nowSeconds: NOW,
  });

  // Distinct because it is our misconfiguration, and maps to a 5xx not a 4xx.
  assert.equal(result.reason, 'missing_secret');
});

test('signature depends on the exact raw bytes, not the parsed object', async () => {
  const header = await signHeader(PAYLOAD, NOW);

  // Semantically identical JSON, different bytes — this is why the worker must sign
  // the raw body and never JSON.parse/stringify round-trip it.
  const reserialised = JSON.stringify(JSON.parse(PAYLOAD), null, 2);

  const result = await verifyStripeSignature({
    payload: reserialised,
    header,
    secret: SECRET,
    nowSeconds: NOW,
  });

  assert.equal(result.ok, false);
});
