// Bao cao tai chinh cho Admin (rev8): tong quan, doanh thu, chi phi AI, lai lo, doi soat.
import { prisma } from '../../config/index.js';
import { SETTINGS_REGISTRY } from './lib/settingsRegistry.js';
import { microsToVnd, profitAndLoss, rangeOf, revenueSeries, revenueSummary, walletMismatches, withAiCost } from './lib/finance.js';

const usdVnd = async () => {
  const row = await prisma.platformSetting.findUnique({ where: { key: 'finance.usd_vnd' }, select: { value: true } });
  const v = Number(row?.value);
  return Number.isInteger(v) && v > 0 ? v : SETTINGS_REGISTRY['finance.usd_vnd'].default;
};

/** order_items co phi da thanh toan trong khoang (theo paid_at cua don). */
const paidItems = (from, to) =>
  prisma.orderItem
    .findMany({
      where: { unitPriceVnd: { gt: 0 }, order: { status: 'paid', paidAt: { gte: from, lte: to } } },
      select: { itemType: true, unitPriceVnd: true, sellerAmountVnd: true, status: true, order: { select: { paidAt: true } } },
    })
    .then((rows) => rows.map((r) => ({ ...r, paidAt: r.order.paidAt })));

async function aiCost(from, to) {
  const [rows, rate] = await Promise.all([
    prisma.aiRequest.groupBy({
      by: ['requestType', 'provider', 'status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { providerCostMicros: true, creditsCharged: true, inputTokens: true, outputTokens: true },
    }),
    usdVnd(),
  ]);
  const breakdown = rows.map((r) => ({
    requestType: r.requestType,
    provider: r.provider,
    status: r.status,
    requests: r._count._all,
    credits: r._sum.creditsCharged ?? 0,
    inputTokens: r._sum.inputTokens ?? 0,
    outputTokens: r._sum.outputTokens ?? 0,
    costVnd: microsToVnd(r._sum.providerCostMicros ?? 0n, rate),
  }));
  return {
    usdVnd: rate,
    totalVnd: breakdown.reduce((s, b) => s + b.costVnd, 0),
    requests: breakdown.reduce((s, b) => s + b.requests, 0),
    failed: breakdown.filter((b) => ['failed', 'blocked'].includes(b.status)).reduce((s, b) => s + b.requests, 0),
    breakdown,
  };
}

/** GET /admin/finance/summary?range — so lieu dashboard + doanh thu theo ngay + chi phi AI + lai lo. */
export async function summary({ range = '30d' } = {}, { now = new Date() } = {}) {
  const { from, to } = rangeOf(range, now);
  const [items, ai, aiRows, newParents, activePaid, pendingWithdrawals] = await Promise.all([
    paidItems(from, to),
    aiCost(from, to),
    prisma.aiRequest.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true, providerCostMicros: true } }),
    prisma.user.count({ where: { role: 'parent', createdAt: { gte: from, lte: to } } }),
    prisma.subscription.groupBy({ by: ['planId'], where: { status: 'active', plan: { priceVnd: { gt: 0 } } }, _count: { _all: true } }),
    prisma.withdrawalRequest.aggregate({ where: { status: { in: ['requested', 'processing'] } }, _sum: { amountVnd: true }, _count: { _all: true } }),
  ]);
  const revenue = revenueSummary(items);
  const plans = await prisma.plan.findMany({ where: { id: { in: activePaid.map((p) => p.planId) } }, select: { id: true, name: true } });
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const sellerHeld = await prisma.wallet.aggregate({ _sum: { earningPendingVnd: true, earningAvailableVnd: true, earningLockedVnd: true } });
  return {
    range: { key: range, from, to },
    revenue,
    series: withAiCost(revenueSeries(items, from, to), aiRows, ai.usdVnd),
    aiCost: ai,
    pnl: profitAndLoss({ platformRevenue: revenue.platformRevenue, aiCostVnd: ai.totalVnd }),
    newParents,
    activePaidSubscriptions: activePaid.map((p) => ({ plan: planName.get(p.planId), count: p._count._all })),
    sellerFunds: {
      pendingVnd: Number(sellerHeld._sum.earningPendingVnd ?? 0),
      availableVnd: Number(sellerHeld._sum.earningAvailableVnd ?? 0),
      lockedVnd: Number(sellerHeld._sum.earningLockedVnd ?? 0),
      withdrawalsInFlight: { count: pendingWithdrawals._count._all, amountVnd: Number(pendingWithdrawals._sum.amountVnd ?? 0) },
    },
  };
}

/**
 * GET /admin/finance/reconciliation — kiem bat bien (khong tu sua so tien):
 * 1. so du vi = balance_after dong ledger cuoi (credit, doanh thu);
 * 2. don da tra co payOS ma khong co webhook hop le (tra qua doi chieu chu dong — de soi lai neu nghi ngo);
 * 3. bo dem truyen (purchase_count / free_claim_count) = so quyen doc thuc te.
 */
export async function reconciliation() {
  const [wallets, lastRows, orphanOrders, counters] = await Promise.all([
    prisma.wallet.findMany({ select: { userId: true, creditBalance: true, earningPendingVnd: true, earningAvailableVnd: true, earningLockedVnd: true } }),
    prisma.$queryRaw`
      SELECT DISTINCT ON (user_id, wallet_type) user_id, wallet_type::text AS wallet_type, balance_after
      FROM wallet_ledger ORDER BY user_id, wallet_type, id DESC`,
    prisma.$queryRaw`
      SELECT o.id, o.payos_order_code, o.total_vnd, o.paid_at
      FROM orders o
      WHERE o.status = 'paid' AND o.payos_order_code IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM webhook_logs w WHERE w.payos_order_code = o.payos_order_code AND w.signature_valid)
      ORDER BY o.paid_at DESC LIMIT 50`,
    prisma.$queryRaw`
      SELECT l.id, l.title, l.purchase_count, l.free_claim_count,
        (SELECT count(*)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.listing_id = l.id AND o.status = 'paid' AND oi.status = 'active' AND oi.unit_price_vnd > 0) AS paid_actual,
        (SELECT count(*)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.listing_id = l.id AND o.status = 'paid' AND oi.status = 'active' AND oi.unit_price_vnd = 0) AS free_actual
      FROM listings l`,
  ]);
  const last = new Map(lastRows.map((r) => [`${r.user_id}:${r.wallet_type}`, r.balance_after]));
  const mismatches = walletMismatches(
    wallets.map((w) => ({ userId: w.userId, creditBalance: w.creditBalance, earningTotal: BigInt(w.earningPendingVnd) + BigInt(w.earningAvailableVnd) + BigInt(w.earningLockedVnd) })),
    last,
  );
  const counterDrift = counters
    .filter((c) => c.purchase_count !== c.paid_actual || c.free_claim_count !== c.free_actual)
    .map((c) => ({ listingId: c.id, title: c.title, purchaseCount: c.purchase_count, paidActual: c.paid_actual, freeClaimCount: c.free_claim_count, freeActual: c.free_actual }));
  return {
    checkedAt: new Date(),
    walletsChecked: wallets.length,
    walletMismatches: mismatches,
    paidWithoutWebhook: orphanOrders.map((o) => ({ orderId: o.id, payosOrderCode: Number(o.payos_order_code), totalVnd: Number(o.total_vnd), paidAt: o.paid_at })),
    counterDrift,
  };
}

/** POST /admin/finance/reconciliation/fix-counters — tinh lai bo dem truyen tu quyen doc thuc te (cache, DBML). */
export async function fixCounters(admin) {
  const { counterDrift } = await reconciliation();
  await prisma.$transaction(async (tx) => {
    for (const d of counterDrift) {
      await tx.listing.update({ where: { id: d.listingId }, data: { purchaseCount: d.paidActual, freeClaimCount: d.freeActual } });
    }
    if (counterDrift.length) {
      await tx.adminAuditLog.create({ data: { actorId: admin.id, action: 'reconcile.fix_counters', targetType: 'listing', afterState: { fixed: counterDrift.length } } });
    }
  }, { timeout: 20000 });
  return { fixed: counterDrift.length };
}

export default { summary, reconciliation, fixCounters };
