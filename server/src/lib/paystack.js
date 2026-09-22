import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from './errors.js';

const BASE = 'https://api.paystack.co';

export const paystackEnabled = () => Boolean(config.paystackSecret);

async function call(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.paystackSecret}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, 'The payment provider could not be reached. Please try again.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.status) {
    throw new HttpError(502, body.message || 'The payment provider rejected the request');
  }
  return body.data;
}

/** Amount is in minor units, which is what Paystack expects. */
export function initializeTransaction({ email, amount, currency, reference, callbackUrl, metadata }) {
  return call('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({ email, amount, currency, reference, callback_url: callbackUrl, metadata }),
  });
}

export function verifyTransaction(reference) {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function isValidWebhook(rawBody, signature) {
  if (!signature || !rawBody) return false;
  const expected = crypto.createHmac('sha512', config.paystackSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
