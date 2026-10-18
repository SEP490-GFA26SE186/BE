// payOS (SDK chinh thuc @payos/node 2.x). Khoi tao luoi: thieu khoa thi chi loi khi that su goi.
// Thu tien (payment-requests) dung PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY.
// Chi ho (payouts) dung bo PAYOS_PAYOUT_* neu co, khong thi dung chung bo tren (cung kenh).
import { PayOS } from '@payos/node';
import env from '../config/env.js';

let collect;
let payout;

export class PaymentConfigError extends Error {}

const build = ({ clientId, apiKey, checksumKey }) => {
  if (!clientId || !apiKey || !checksumKey) {
    throw new PaymentConfigError('Chưa cấu hình payOS (PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY).');
  }
  return new PayOS({ clientId, apiKey, checksumKey, timeout: 15000, maxRetries: 1 });
};

/** Client thu tien. Test tiem client gia bang setPayosClient. */
export const payosCollect = () => (collect ??= build(env.payos));

export const payosPayout = () =>
  (payout ??= build({
    clientId: env.payos.payout.clientId ?? env.payos.clientId,
    apiKey: env.payos.payout.apiKey ?? env.payos.apiKey,
    checksumKey: env.payos.payout.checksumKey ?? env.payos.checksumKey,
  }));

/** Chi cho test. */
export const setPayosClient = (client) => {
  collect = client;
};
export const setPayosPayoutClient = (client) => {
  payout = client;
};
