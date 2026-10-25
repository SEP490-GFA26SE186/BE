// payOS (SDK chinh thuc @payos/node 2.x). Khoi tao luoi: thieu khoa thi chi loi khi that su goi.
// Chi dung de thu tien (payment-requests): PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY.
// Rut tien nguoi ban do Admin chuyen khoan tay (khong dung chi ho payOS tu 2026-10-24).
import { PayOS } from '@payos/node';
import env from '../config/env.js';

let collect;

export class PaymentConfigError extends Error {}

const build = ({ clientId, apiKey, checksumKey }) => {
  if (!clientId || !apiKey || !checksumKey) {
    throw new PaymentConfigError('Chưa cấu hình payOS (PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY).');
  }
  return new PayOS({ clientId, apiKey, checksumKey, timeout: 15000, maxRetries: 1 });
};

/** Client thu tien. Test tiem client gia bang setPayosClient. */
export const payosCollect = () => (collect ??= build(env.payos));

/** Chi cho test. */
export const setPayosClient = (client) => {
  collect = client;
};
