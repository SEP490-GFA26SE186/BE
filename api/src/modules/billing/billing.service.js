// Mua goi qua payOS (rev8). Hai duong xac nhan da tra tien, deu idempotent:
//  1. Webhook payOS (khi API public): kiem chu ky -> fulfill.
//  2. Nguoi dung quay lai Web (returnUrl) -> GET /payments/orders/:id -> BE TU HOI payOS trang thai
//     (khong tin query string) -> fulfill. Chay duoc ca khi dev chua co URL cong khai.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import { PaymentConfigError, payosCollect } from '../../clients/payos.js';
import { ORDER_TTL_MINUTES, formatOrder, formatPlan, newOrderCode, payosDescription } from './lib/billing.js';
import { closeOrder, ensureFreeSubscription, fulfillOrder } from './billing.store.js';

const TX = { timeout: 20000 };
const ORDER_INCLUDE = { items: { include: { plan: true, listing: { select: { id: true, title: true } } } } };

const unavailable = (error) => {
  console.error('[payos]', error);
  if (error instanceof PaymentConfigError) return ApiError.internal(error.message);
  return new ApiError(StatusCodes.BAD_GATEWAY, 'Cổng thanh toán đang tạm gián đoạn. Ba mẹ thử lại sau ít phút nhé.');
};

/** GET /plans: goi dang ban, re den dat. */
export async function listPlans() {
  const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ priceVnd: 'asc' }, { durationMonths: 'asc' }] });
  return plans.map(formatPlan);
}

/**
 * Tao don mot item + link payOS (dung chung cho goi va truyen). Gia 0d: giao ngay, khong qua payOS.
 * `item`: du lieu order_items (itemType + planId | listingId + snapshot gia / ti le nguoi ban).
 * payOS tra nguoi dung ve `<WEB_URL><returnPath>?orderId=...` (huy: them `&cancelled=1`).
 * @returns {Promise<{ order, checkoutUrl: string | null }>}
 */
export async function checkoutOrder(user, { price, itemName, item, returnPath }, { now = new Date() } = {}) {
  if (price === 0n) {
    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({ data: { buyerId: user.id, subtotalVnd: 0n, totalVnd: 0n, items: { create: item } } });
      await fulfillOrder(tx, o.id, { now });
      return tx.order.findUniqueOrThrow({ where: { id: o.id }, include: ORDER_INCLUDE });
    }, TX);
    return { order: formatOrder(order), checkoutUrl: null };
  }

  const orderCode = newOrderCode();
  const expiresAt = new Date(now.getTime() + ORDER_TTL_MINUTES * 60_000);
  const order = await prisma.order.create({
    data: { buyerId: user.id, subtotalVnd: price, totalVnd: price, payosOrderCode: BigInt(orderCode), expiresAt, items: { create: item } },
    include: ORDER_INCLUDE,
  });

  let link;
  try {
    link = await payosCollect().paymentRequests.create({
      orderCode,
      amount: Number(price),
      description: payosDescription(orderCode),
      returnUrl: `${env.webUrl}${returnPath}?orderId=${order.id}`,
      cancelUrl: `${env.webUrl}${returnPath}?orderId=${order.id}&cancelled=1`,
      expiredAt: Math.floor(expiresAt.getTime() / 1000), // payOS: Unix giay
      items: [{ name: itemName.slice(0, 100), quantity: 1, price: Number(price) }],
    });
  } catch (error) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'failed' } });
    throw unavailable(error);
  }
  await prisma.order.update({ where: { id: order.id }, data: { payosPaymentLinkId: link.paymentLinkId } });
  return { order: formatOrder(order), checkoutUrl: link.checkoutUrl };
}

/** POST /payments/plans/checkout { planId } -> { order, checkoutUrl }. */
export async function checkoutPlan(user, planId, options) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true } });
  if (!plan) throw ApiError.notFound('Không tìm thấy gói.');
  return checkoutOrder(
    user,
    { price: plan.priceVnd, itemName: plan.name, item: { itemType: 'plan', planId: plan.id, unitPriceVnd: plan.priceVnd }, returnPath: '/parent/billing/result' },
    options,
  );
}

/** Doi trang thai don theo payOS (PAID -> giao hang, CANCELLED / EXPIRED -> dong don). */
async function syncWithPayos(order, now) {
  let info;
  try {
    info = await payosCollect().paymentRequests.get(Number(order.payosOrderCode));
  } catch (error) {
    console.error('[payos] khong lay duoc trang thai don', order.id, error?.message);
    return; // giu nguyen; lan hoi sau / webhook se cap nhat
  }
  if (info.status === 'PAID' && info.amountPaid >= Number(order.totalVnd)) {
    const ref = info.transactions?.[0]?.reference ?? null;
    await prisma.$transaction((tx) => fulfillOrder(tx, order.id, { transactionId: ref, now }), TX);
  } else if (info.status === 'CANCELLED') {
    await prisma.$transaction((tx) => closeOrder(tx, order.id, 'cancelled'), TX);
  } else if (info.status === 'EXPIRED') {
    await prisma.$transaction((tx) => closeOrder(tx, order.id, 'expired'), TX);
  }
}

/** GET /payments/orders/:id — trang ket qua thanh toan hoi lai (BE tu hoi payOS khi don chua xong). */
export async function getOrder(user, orderId, { now = new Date() } = {}) {
  let order = await prisma.order.findFirst({ where: { id: orderId, buyerId: user.id }, include: ORDER_INCLUDE });
  if (!order) throw ApiError.notFound('Không tìm thấy đơn hàng.');
  if (['pending', 'expired'].includes(order.status) && order.payosOrderCode != null) {
    await syncWithPayos(order, now);
    order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  }
  return formatOrder(order);
}

/**
 * POST /payments/payos/webhook (khong auth — payOS goi). Luon tra 200 de payOS khong gui lai vo han,
 * tru khi loi he thong. Ghi webhook_logs truoc, kiem chu ky bang SDK, chi giao hang khi:
 * chu ky hop le + code '00' + co don pending/expired + so tien khop.
 * Request thu cua payOS luc dang ky URL (orderCode khong co trong DB) -> 200, khong lam gi.
 */
export async function handleWebhook(body, { now = new Date() } = {}) {
  const orderCode = Number(body?.data?.orderCode);
  let data = null;
  let error = null;
  try {
    data = await payosCollect().webhooks.verify(body);
  } catch (e) {
    error = e?.message ?? String(e);
  }
  const log = await prisma.webhookLog.create({
    data: {
      payosOrderCode: Number.isSafeInteger(orderCode) ? BigInt(orderCode) : null,
      payload: body ?? {},
      signatureValid: Boolean(data),
      errorMessage: error,
    },
  });
  if (!data) return { ok: false, reason: 'invalid_signature' };

  const order = await prisma.order.findUnique({ where: { payosOrderCode: BigInt(data.orderCode) } });
  let processed = false;
  let reason = null;
  if (!order) reason = 'unknown_order';
  else if (data.code !== '00') reason = `payos_code_${data.code}`;
  else if (Number(data.amount) < Number(order.totalVnd)) reason = 'amount_mismatch';
  else {
    processed = await prisma.$transaction((tx) => fulfillOrder(tx, order.id, { transactionId: data.reference ?? null, now }), TX);
    if (!processed) {
      // Tien da ve nhung don da huy / loi -> khong giao, ghi ro de doi soat hoan tay (y tuong tu origin/main).
      const { status } = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
      reason = status === 'paid' ? 'already_processed' : `paid_but_order_${status}_needs_manual_refund`;
    }
  }
  await prisma.webhookLog.update({ where: { id: log.id }, data: { processed, errorMessage: reason } });
  return { ok: true, processed, reason };
}

/** Phu huynh moi dang ky / seed: goi Mien phi (cap credit thang dau). */
export const ensureFreePlan = (userId) => prisma.$transaction((tx) => ensureFreeSubscription(tx, userId), TX);

export default { listPlans, checkoutPlan, checkoutOrder, getOrder, handleWebhook, ensureFreePlan };
