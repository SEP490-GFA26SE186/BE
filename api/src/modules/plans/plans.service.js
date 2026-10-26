import prisma from '../../config/prisma.js';
import { ApiError } from '../../utils/index.js';
import { formatMySubscription } from './lib/mySubscription.js';
import { listPlans } from '../billing/billing.service.js';

// ==========================================
// 1. PLANS SERVICE
// ==========================================

// rev8: goi do seed (prisma/seed_plans.js) / Admin tao; khong tu chen goi mac dinh o day.
const getPlans = () => listPlans();

const getPlanById = async (id) => {
  const plan = await prisma.plan.findUnique({
    where: { id },
  });

  if (!plan) {
    throw new ApiError(404, 'Subscription plan not found');
  }

  return plan;
};

// ==========================================
// 3. SUBSCRIPTIONS SERVICE
// ==========================================

/** GET /subscriptions/me — rev8: goi dang hoat dong (hoac goi Mien phi du phong) + so be / nhan vat dang dung. */
const getMySubscription = async (userId) => {
  const [subscription, childrenCount, charactersCount] = await Promise.all([
    prisma.subscription.findFirst({
      where: { parentId: userId, status: 'active', periodEnd: { gt: new Date() } },
      include: { plan: true },
      orderBy: { periodEnd: 'desc' },
    }),
    prisma.childProfile.count({ where: { parentId: userId, deletedAt: null } }),
    prisma.character.count({ where: { parentId: userId, deletedAt: null } }),
  ]);
  return formatMySubscription(subscription, { childrenCount, charactersCount });
};

/**
 * GET /subscriptions/me/credit-history?page&limit — lich su credit cong / tru tu so cai (phieu dang ky: "track
 * remaining quota and transaction history"). Bo dong credit_consume (dong danh dau 0 credit). Moi dong kem ngu canh:
 * yeu cau AI (loai + ten truyen / nhan vat) hoac goi (ten goi).
 */
const getCreditHistory = async (userId, { page = 1, limit = 20 } = {}) => {
  const where = { userId, walletType: 'credit', entryType: { not: 'credit_consume' } };
  const [total, rows] = await Promise.all([
    prisma.walletLedger.count({ where }),
    prisma.walletLedger.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
  ]);
  const idsOf = (type) => [...new Set(rows.filter((r) => r.refType === type && r.refId).map((r) => r.refId))];
  const [aiRequests, subscriptions] = await Promise.all([
    prisma.aiRequest.findMany({
      where: { id: { in: idsOf('ai_request') } },
      select: { id: true, requestType: true, story: { select: { title: true } }, character: { select: { name: true } } },
    }),
    prisma.subscription.findMany({ where: { id: { in: idsOf('subscription') } }, select: { id: true, plan: { select: { name: true } } } }),
  ]);
  const aiById = new Map(aiRequests.map((a) => [a.id, a]));
  const subById = new Map(subscriptions.map((s) => [s.id, s]));
  const contextOf = (r) => {
    const ai = r.refType === 'ai_request' ? aiById.get(r.refId) : null;
    if (ai) return { kind: 'ai', requestType: ai.requestType, storyTitle: ai.story?.title ?? null, characterName: ai.character?.name ?? null };
    const sub = r.refType === 'subscription' ? subById.get(r.refId) : null;
    if (sub) return { kind: 'plan', planName: sub.plan.name };
    return null;
  };
  return {
    entries: rows.map((r) => ({
      id: String(r.id),
      createdAt: r.createdAt,
      entryType: r.entryType,
      amount: Number(r.amount),
      balanceAfter: Number(r.balanceAfter),
      context: contextOf(r),
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

export default {
  getCreditHistory,
  getPlans,
  getPlanById,
  getMySubscription,
};
