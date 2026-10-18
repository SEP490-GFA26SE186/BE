// Hoan tien (rev8 refund_requests). Phu huynh yeu cau trong market.refund_window_days ke tu luc tra tien
// (mac dinh 3 = so ngay giu doanh thu). Admin chuyen tra thu cong (STK nguoi tra lay tu webhook payOS) roi
// nhap ma giao dich; he thong thu hoi quyen doc / huy goi va tru doanh thu nguoi ban.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { ensureFreeSubscription } from '../billing/billing.store.js';
import { expireCredit } from '../wallets/creditLedger.js';
import { earningKey, moveEarning, releaseKey, reversalKey } from '../wallets/earningLedger.js';
import { SETTINGS_REGISTRY } from '../admin/lib/settingsRegistry.js';
import { DAY_MS } from '../admin/lib/finance.js';

const TX = { timeout: 20000 };
const vnd = (v) => (v == null ? null : Number(v));
const unprocessable = (message) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message);
const WINDOW_KEY = 'market.refund_window_days';

async function refundWindowDays(db = prisma) {
  const row = await db.platformSetting.findUnique({ where: { key: WINDOW_KEY }, select: { value: true } });
  const v = Number(row?.value);
  return Number.isInteger(v) && v > 0 ? v : SETTINGS_REGISTRY[WINDOW_KEY].default;
}

const ITEM_INCLUDE = {
  plan: { select: { id: true, name: true, code: true } },
  listing: { select: { id: true, title: true, sellerId: true, publishedStoryId: true } },
  refundRequest: true,
};

/** Item co the yeu cau hoan: don da tra, gia > 0, chua hoan, chua co yeu cau, con trong han. */
function refundableState(order, item, windowDays, now) {
  if (item.refundRequest) return { refundable: false, reason: 'requested' };
  if (item.status === 'refunded') return { refundable: false, reason: 'refunded' };
  if (order.status !== 'paid' || !(Number(item.unitPriceVnd) > 0)) return { refundable: false, reason: 'not_paid' };
  const deadline = new Date(order.paidAt.getTime() + windowDays * DAY_MS);
  return now <= deadline ? { refundable: true, deadline } : { refundable: false, reason: 'expired', deadline };
}

const formatRefund = (r) =>
  r && {
    id: r.id,
    status: r.status,
    reason: r.reason,
    decisionNote: r.decisionNote,
    bankTransactionRef: r.bankTransactionRef,
    createdAt: r.createdAt,
    handledAt: r.handledAt,
  };

/** GET /payments/orders — lich su don da tra tien (> 0d) cua phu huynh + trang thai hoan tien tung item. */
export async function listMyOrders(user, { now = new Date() } = {}) {
  const [orders, windowDays] = await Promise.all([
    prisma.order.findMany({
      where: { buyerId: user.id, status: 'paid', totalVnd: { gt: 0 } },
      orderBy: { paidAt: 'desc' },
      take: 100,
      include: { items: { include: ITEM_INCLUDE } },
    }),
    refundWindowDays(),
  ]);
  return {
    refundWindowDays: windowDays,
    orders: orders.map((o) => ({
      id: o.id,
      totalVnd: vnd(o.totalVnd),
      paidAt: o.paidAt,
      payosOrderCode: o.payosOrderCode == null ? null : Number(o.payosOrderCode),
      items: o.items.map((i) => ({
        id: i.id,
        itemType: i.itemType,
        title: i.plan?.name ?? i.listing?.title ?? null,
        unitPriceVnd: vnd(i.unitPriceVnd),
        status: i.status,
        refund: formatRefund(i.refundRequest),
        ...refundableState(o, i, windowDays, now),
      })),
    })),
  };
}

/** POST /payments/order-items/:itemId/refund — phu huynh yeu cau hoan tien. */
export async function requestRefund(user, orderItemId, { reason }, { now = new Date() } = {}) {
  const item = await prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { ...ITEM_INCLUDE, order: true } });
  if (!item || item.order.buyerId !== user.id) throw ApiError.notFound('Không tìm thấy giao dịch.');
  const state = refundableState(item.order, item, await refundWindowDays(), now);
  if (!state.refundable) {
    const messages = {
      requested: 'Ba mẹ đã gửi yêu cầu hoàn tiền cho giao dịch này.',
      refunded: 'Giao dịch này đã được hoàn tiền.',
      not_paid: 'Chỉ hoàn tiền giao dịch đã thanh toán và có phí.',
      expired: 'Đã quá thời hạn yêu cầu hoàn tiền.',
    };
    throw new ApiError(state.reason === 'requested' ? StatusCodes.CONFLICT : StatusCodes.UNPROCESSABLE_ENTITY, messages[state.reason]);
  }
  try {
    const r = await prisma.refundRequest.create({ data: { orderItemId, requesterId: user.id, reason: reason.trim() } });
    return { refund: formatRefund(r) };
  } catch (error) {
    if (error?.code === 'P2002') throw new ApiError(StatusCodes.CONFLICT, 'Ba mẹ đã gửi yêu cầu hoàn tiền cho giao dịch này.');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** STK nguoi tra lay tu webhook payOS (data.counterAccount*). Tra qua polling thi khong co -> null. */
async function payerAccount(payosOrderCode) {
  if (payosOrderCode == null) return null;
  const log = await prisma.webhookLog.findFirst({
    where: { payosOrderCode, signatureValid: true },
    orderBy: { receivedAt: 'desc' },
    select: { payload: true },
  });
  const d = log?.payload?.data;
  if (!d?.counterAccountNumber) return null;
  return { bankName: d.counterAccountBankName || d.counterAccountBankId || null, accountNumber: d.counterAccountNumber, accountName: d.counterAccountName || null };
}

/** Thong tin cho Admin quyet: goi -> credit da dung trong ky; truyen -> doanh thu nguoi ban con giu hay da mo. */
async function impact(item) {
  if (item.itemType === 'plan') {
    const sub = await prisma.subscription.findFirst({ where: { orderItemId: item.id }, select: { id: true, status: true, periodStart: true, parentId: true } });
    if (!sub) return { subscriptionStatus: null, creditsUsed: 0 };
    const used = await prisma.walletLedger.aggregate({
      where: { userId: sub.parentId, walletType: 'credit', entryType: 'credit_consume', createdAt: { gte: sub.periodStart } },
      _sum: { amount: true },
    });
    return { subscriptionStatus: sub.status, creditsUsed: Math.abs(Number(used._sum.amount ?? 0)) };
  }
  const keys = await prisma.walletLedger.findMany({ where: { idempotencyKey: { in: [earningKey(item.id), releaseKey(item.id)] } }, select: { idempotencyKey: true } });
  const has = new Set(keys.map((k) => k.idempotencyKey));
  return { sellerEarning: vnd(item.sellerAmountVnd), earningState: has.has(releaseKey(item.id)) ? 'available' : has.has(earningKey(item.id)) ? 'pending' : 'none' };
}

export async function listRefunds({ status = 'pending' } = {}) {
  const rows = await prisma.refundRequest.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: {
      requester: { select: { id: true, fullName: true, email: true } },
      handler: { select: { fullName: true } },
      orderItem: { include: { order: true, plan: { select: { name: true } }, listing: { select: { title: true, seller: { select: { displayName: true } } } } } },
    },
  });
  const refunds = [];
  for (const r of rows) {
    const i = r.orderItem;
    refunds.push({
      ...formatRefund(r),
      handler: r.handler?.fullName ?? null,
      requester: r.requester,
      item: {
        id: i.id,
        itemType: i.itemType,
        title: i.plan?.name ?? i.listing?.title,
        seller: i.listing?.seller.displayName ?? null,
        unitPriceVnd: vnd(i.unitPriceVnd),
        paidAt: i.order.paidAt,
        payosOrderCode: i.order.payosOrderCode == null ? null : Number(i.order.payosOrderCode),
      },
      payer: await payerAccount(i.order.payosOrderCode),
      impact: r.status === 'pending' ? await impact(i) : null,
    });
  }
  return { refunds };
}

/** Hoan quyen loi da giao: truyen -> thu hoi quyen doc, go khoi gia sach be, tru doanh thu; goi -> huy, ve Mien phi. */
async function revokeDelivery(tx, item, buyerId, now) {
  if (item.itemType === 'listing') {
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: item.listingId } });
    await tx.entitlement.updateMany({ where: { parentId: buyerId, listingId: listing.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.bookshelfItem.deleteMany({ where: { storyId: listing.publishedStoryId, child: { parentId: buyerId } } });
    await tx.listing.updateMany({ where: { id: listing.id, purchaseCount: { gt: 0 } }, data: { purchaseCount: { decrement: 1 } } });
    await tx.sellerProfile.updateMany({ where: { userId: listing.sellerId, totalSales: { gt: 0 } }, data: { totalSales: { decrement: 1 } } });
    const amount = BigInt(item.sellerAmountVnd ?? 0);
    if (amount > 0n && (await tx.walletLedger.findUnique({ where: { idempotencyKey: earningKey(item.id) }, select: { id: true } }))) {
      const released = Boolean(await tx.walletLedger.findUnique({ where: { idempotencyKey: releaseKey(item.id) }, select: { id: true } }));
      if (released) {
        const w = await tx.wallet.findUnique({ where: { userId: listing.sellerId }, select: { earningAvailableVnd: true } });
        if (BigInt(w?.earningAvailableVnd ?? 0) < amount) {
          throw unprocessable('Người bán đã rút phần doanh thu của giao dịch này — không trừ lại tự động được, cần xử lý riêng với người bán.');
        }
      }
      await moveEarning(tx, {
        userId: listing.sellerId, entryType: 'earning_reversal', amount: -amount,
        delta: released ? { earningAvailableVnd: -amount } : { earningPendingVnd: -amount },
        key: reversalKey(item.id), refType: 'order_item', refId: item.id,
      });
    }
    return;
  }
  const sub = await tx.subscription.findFirst({ where: { orderItemId: item.id } });
  if (sub?.status === 'active') {
    await expireCredit(tx, { userId: buyerId, key: `refund_expire:${item.id}`, refType: 'order_item', refId: item.id });
    await tx.subscription.update({ where: { id: sub.id }, data: { status: 'cancelled' } });
    await ensureFreeSubscription(tx, buyerId, now);
  }
}

/**
 * Admin quyet. approve: { bankTransactionRef (bat buoc — da chuyen tra), note? }. reject: { note (bat buoc) }.
 */
export async function decideRefund(admin, refundId, { approve, bankTransactionRef, note }, { now = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM refund_requests WHERE id = ${refundId}::uuid FOR UPDATE`;
    const r = await tx.refundRequest.findUnique({ where: { id: refundId }, include: { orderItem: { include: { order: true } } } });
    if (!r) throw ApiError.notFound('Không tìm thấy yêu cầu hoàn tiền.');
    if (r.status !== 'pending') throw new ApiError(StatusCodes.CONFLICT, 'Yêu cầu này đã được xử lý.');
    if (approve && !bankTransactionRef?.trim()) throw unprocessable('Nhập mã giao dịch chuyển trả cho phụ huynh.');
    if (!approve && !note?.trim()) throw unprocessable('Hãy ghi lý do từ chối để phụ huynh biết.');

    if (approve) {
      await tx.orderItem.update({ where: { id: r.orderItemId }, data: { status: 'refunded' } });
      await revokeDelivery(tx, r.orderItem, r.orderItem.order.buyerId, now);
    }
    const status = approve ? 'approved' : 'rejected';
    await tx.refundRequest.update({
      where: { id: refundId },
      data: { status, handledBy: admin.id, handledAt: now, bankTransactionRef: approve ? bankTransactionRef.trim() : null, decisionNote: note?.trim() || null },
    });
    await tx.adminAuditLog.create({
      data: { actorId: admin.id, action: `refund.${status}`, targetType: 'refund_request', targetId: refundId, beforeState: { status: 'pending' }, afterState: { status, amountVnd: Number(r.orderItem.unitPriceVnd), bankTransactionRef: bankTransactionRef?.trim() || null } },
    });
    return { refundId, status };
  }, TX);
}

export default { listMyOrders, requestRefund, listRefunds, decideRefund };
