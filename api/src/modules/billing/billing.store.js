// Doc / ghi goi, don, ky cap credit (rev8). `tx` la transaction client Prisma.
import { expireCredit, grantCredit } from '../wallets/creditLedger.js';
import { recordEarning } from '../wallets/earningLedger.js';
import { FREE_PLAN_CODE, addMonths, cycleAction, monthsBetween, newPeriod } from './lib/billing.js';

const TX = { timeout: 20000 };

/** Tham so cho truyen (platform_settings market.*): ti le nguoi ban nhan, so ngay giu doanh thu. */
export async function loadMarketSettings(db) {
  const rows = await db.platformSetting.findMany({ where: { key: { startsWith: 'market.' } }, select: { key: true, value: true } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const rate = Number(map.get('market.seller_share_rate'));
  const holdDays = Number(map.get('market.earning_hold_days'));
  const minWithdrawal = Number(map.get('market.min_withdrawal_vnd'));
  if (!(rate > 0 && rate <= 1) || !(holdDays >= 0) || !(minWithdrawal > 0)) {
    throw new Error('Thiếu / sai cấu hình market.* trong platform_settings (chạy lại seed).');
  }
  return { sellerShareRate: rate, earningHoldDays: holdDays, minWithdrawalVnd: minWithdrawal };
}

export const DUPLICATE_REFUND_REASON = 'Tự động: mua trùng — phụ huynh đã sở hữu truyện này từ đơn trước, cần hoàn tiền.';

/**
 * Giao mot item truyen: quyen doc (entitlement) + bo dem; truyen co gia -> doanh thu nguoi ban
 * (seller_amount_vnd da chot trong don) giu `holdDays` ngay.
 * Da co quyen (mua trung, vd. hai don cho cung duoc tra) -> khong giao lai, khong cong bo dem / doanh
 * thu; don co tien thi tu mo yeu cau hoan tien de Admin tra lai (y tuong tu origin/main).
 */
async function deliverListing(tx, { buyerId, item, now }) {
  const listing = await tx.listing.findUniqueOrThrow({ where: { id: item.listingId } });
  const paid = item.unitPriceVnd > 0n;
  const active = await tx.entitlement.findFirst({ where: { parentId: buyerId, listingId: listing.id, revokedAt: null } });
  if (active) {
    if (paid) {
      await tx.refundRequest.upsert({
        where: { orderItemId: item.id },
        create: { orderItemId: item.id, requesterId: buyerId, reason: DUPLICATE_REFUND_REASON, createdAt: now },
        update: {},
      });
    }
    return;
  }
  await tx.entitlement.create({ data: { parentId: buyerId, listingId: listing.id, orderItemId: item.id, grantedAt: now } });
  await tx.listing.update({ where: { id: listing.id }, data: paid ? { purchaseCount: { increment: 1 } } : { freeClaimCount: { increment: 1 } } });
  if (paid) {
    await tx.sellerProfile.update({ where: { userId: listing.sellerId }, data: { totalSales: { increment: 1 } } });
    const { earningHoldDays } = await loadMarketSettings(tx);
    await recordEarning(tx, {
      sellerId: listing.sellerId,
      amount: item.sellerAmountVnd,
      orderItemId: item.id,
      availableAt: new Date(now.getTime() + earningHoldDays * 86_400_000),
    });
  }
}

const grantKey = (subId, month) => `grant:${subId}:${month}`;
const expireKey = (subId, month) => `expire:${subId}:${month}`;

async function freePlan(tx) {
  const plan = await tx.plan.findUnique({ where: { code: FREE_PLAN_CODE } });
  if (!plan) throw new Error(`Thiếu gói ${FREE_PLAN_CODE} trong bảng plans (chạy lại seed).`);
  return plan;
}

/** Tao ky moi cho `plan` + cap credit thang dau. Ky dang active (neu co) chuyen `status`. */
async function startPeriod(tx, { parentId, plan, orderItemId = null, now, replacedStatus }) {
  await tx.subscription.updateMany({ where: { parentId, status: 'active' }, data: { status: replacedStatus } });
  const sub = await tx.subscription.create({
    data: { parentId, planId: plan.id, orderItemId, status: 'active', ...newPeriod(plan, now) },
  });
  await grantCredit(tx, { userId: parentId, amount: plan.creditsPerMonth, key: grantKey(sub.id, 0), refId: sub.id });
  return sub;
}

/** Phu huynh chua co goi active -> goi Mien phi (dang ky moi, seed). Co roi -> giu nguyen. */
export async function ensureFreeSubscription(tx, parentId, now = new Date()) {
  const active = await tx.subscription.findFirst({ where: { parentId, status: 'active' } });
  if (active) return active;
  return startPeriod(tx, { parentId, plan: await freePlan(tx), now, replacedStatus: 'expired' });
}

/**
 * payOS xac nhan da nhan tien -> paid va giao hang. Chi tu pending, hoac expired (cron da dong don
 * nhung khach tra o giay cuoi: tien da ve thi van giao). Goi lai / webhook trung -> false.
 * item `plan` -> ky goi moi bat dau ngay, credit con lai giu mot lan (DBML subscriptions).
 */
export async function fulfillOrder(tx, orderId, { transactionId = null, now = new Date() } = {}) {
  const { count } = await tx.order.updateMany({
    where: { id: orderId, status: { in: ['pending', 'expired'] } },
    data: { status: 'paid', paidAt: now, payosTransactionId: transactionId },
  });
  if (count !== 1) return false;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { plan: true } } } });
  for (const item of order.items) {
    if (item.itemType === 'plan' && item.plan) {
      // Gia han (mua lai dung goi tra phi dang dung): cong them thoi han vao ngay het han, khong mat ngay con lai.
      // Credit hang thang van cap deu toi ngay het han moi (cycleAction). Goi khac -> doi goi ngay nhu cu.
      const active = await tx.subscription.findFirst({ where: { parentId: order.buyerId, status: 'active' } });
      if (active && active.planId === item.plan.id && item.plan.code !== FREE_PLAN_CODE) {
        await tx.subscription.update({ where: { id: active.id }, data: { periodEnd: addMonths(active.periodEnd, item.plan.durationMonths) } });
        continue;
      }
      await startPeriod(tx, { parentId: order.buyerId, plan: item.plan, orderItemId: item.id, now, replacedStatus: 'cancelled' });
    } else if (item.itemType === 'listing') {
      await deliverListing(tx, { buyerId: order.buyerId, item, now });
    }
  }
  return true;
}

/** Don het han / bi huy tren payOS: pending -> status moi. */
export async function closeOrder(tx, orderId, status) {
  const { count } = await tx.order.updateMany({ where: { id: orderId, status: 'pending' }, data: { status } });
  return count === 1;
}

/**
 * Cron (worker, dinh ky): cap credit thang moi, gia han goi Mien phi, het han goi tra phi (ve Mien
 * phi), dong don qua han. Moi subscription mot transaction; key tat dinh nen chay lai khong cap trung.
 * Mot subscription loi -> ghi log, bo qua, cac subscription khac va viec dong don van chay (lan sau thu lai).
 */
export async function runBillingCycle(prisma, now = new Date()) {
  const due = await prisma.subscription.findMany({
    where: { status: 'active', nextCreditGrantAt: { lte: now } },
    include: { plan: true },
    take: 500,
  });
  const done = { granted: 0, renewedFree: 0, expired: 0, ordersExpired: 0, failed: 0 };
  for (const sub of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const step = cycleAction(sub, sub.plan, now);
        if (step.action === 'grant') {
          await expireCredit(tx, { userId: sub.parentId, key: expireKey(sub.id, step.monthIndex), refId: sub.id });
          await grantCredit(tx, { userId: sub.parentId, amount: sub.plan.creditsPerMonth, key: grantKey(sub.id, step.monthIndex), refId: sub.id });
          await tx.subscription.update({ where: { id: sub.id }, data: { nextCreditGrantAt: step.nextCreditGrantAt } });
          done.granted += 1;
        } else if (step.action === 'renew_free' || step.action === 'expire') {
          // Het ky: credit con lai het han, roi sang ky Mien phi moi.
          await expireCredit(tx, { userId: sub.parentId, key: expireKey(sub.id, monthsBetween(sub.periodStart, sub.periodEnd)), refId: sub.id });
          await startPeriod(tx, { parentId: sub.parentId, plan: await freePlan(tx), now, replacedStatus: 'expired' });
          done[step.action === 'renew_free' ? 'renewedFree' : 'expired'] += 1;
        }
      }, TX);
    } catch (error) {
      done.failed += 1;
      console.error(`[billing] subscription ${sub.id} loi, bo qua lan nay:`, error.message);
    }
  }
  const { count } = await prisma.order.updateMany({
    where: { status: 'pending', expiresAt: { lt: now } },
    data: { status: 'expired' },
  });
  done.ordersExpired = count;
  return done;
}
