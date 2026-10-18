import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/index.js';

/**
 * Tich hop payOS (cong thanh toan VietQR).
 * Tai lieu: https://payos.vn/docs/api/ va https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/
 */

const isConfigured = () =>
  Boolean(env.payos.clientId && env.payos.apiKey && env.payos.checksumKey);

const hmac = (message) =>
  createHmac('sha256', env.payos.checksumKey).update(message).digest('hex');

const sortKeys = (obj) =>
  Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});

/**
 * Chuoi ky cho webhook: moi field cua data, sap xep theo ten, key=value noi bang &
 * @param {Object} data
 * @returns {string}
 */
const buildWebhookSignString = (data) =>
  Object.keys(data)
    .filter((key) => data[key] !== undefined)
    .sort()
    .map((key) => {
      let value = data[key];
      if (Array.isArray(value)) {
        value = JSON.stringify(value.map(sortKeys));
      }
      if (value === null || value === undefined || value === 'null' || value === 'undefined') {
        value = '';
      }
      return `${key}=${value}`;
    })
    .join('&');

/**
 * Kiem tra chu ky webhook payOS
 * @param {Object} body - { code, desc, success, data, signature }
 * @returns {boolean}
 */
const verifyWebhookSignature = (body) => {
  if (!isConfigured() || !body?.data || typeof body.signature !== 'string') return false;

  const computed = Buffer.from(hmac(buildWebhookSignString(body.data)));
  const received = Buffer.from(body.signature);
  return computed.length === received.length && timingSafeEqual(computed, received);
};

/**
 * Tao link thanh toan cho mot don
 * @param {Object} params - { orderCode (bigint|number), amount (bigint|number), description, expiresAt (Date) }
 * @returns {Promise<{ checkoutUrl: string, paymentLinkId: string }>}
 */
const createPaymentLink = async ({ orderCode, amount, description, expiresAt }) => {
  const payload = {
    orderCode: Number(orderCode),
    amount: Number(amount),
    description,
    cancelUrl: env.payos.cancelUrl,
    returnUrl: env.payos.returnUrl,
  };

  // Chu ky tao link: 5 field co dinh, sap xep theo ten
  payload.signature = hmac(
    `amount=${payload.amount}&cancelUrl=${payload.cancelUrl}&description=${payload.description}` +
      `&orderCode=${payload.orderCode}&returnUrl=${payload.returnUrl}`,
  );
  if (expiresAt) {
    payload.expiredAt = Math.floor(expiresAt.getTime() / 1000);
  }

  const res = await fetch(`${env.payos.apiUrl}/v2/payment-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': env.payos.clientId,
      'x-api-key': env.payos.apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.code !== '00' || !body?.data?.checkoutUrl) {
    throw new Error(`payOS create payment link failed: HTTP ${res.status} ${body?.code ?? ''} ${body?.desc ?? ''}`);
  }

  return {
    checkoutUrl: body.data.checkoutUrl,
    paymentLinkId: body.data.paymentLinkId,
  };
};

export default {
  isConfigured,
  buildWebhookSignString,
  verifyWebhookSignature,
  createPaymentLink,
};
