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

export default {
  getPlans,
  getPlanById,
  getMySubscription,
};
