import prisma from '../../config/prisma.js';
import { ApiError } from '../../utils/index.js';
import walletsService from '../wallets/wallets.service.js';

const DEFAULT_PLANS = [
  {
    code: 'FREE',
    name: 'Gói Trải Nghiệm (Free Explorer)',
    durationMonths: 1,
    priceVnd: 0n,
    creditsPerMonth: 20,
    maxChildren: 2,
    maxCharacters: 5,
    canSell: false,
    isActive: true,
  },
  {
    code: 'MONTHLY_PRO',
    name: 'Gói Gia Đình Tiêu Chuẩn (Family Storyteller Monthly)',
    durationMonths: 1,
    priceVnd: 99000n,
    creditsPerMonth: 200,
    maxChildren: 5,
    maxCharacters: 20,
    canSell: true,
    isActive: true,
  },
  {
    code: 'YEARLY_PRO',
    name: 'Gói Gia Đình Cao Cấp (Family Storyteller Annual)',
    durationMonths: 12,
    priceVnd: 990000n,
    creditsPerMonth: 200,
    maxChildren: 10,
    maxCharacters: 50,
    canSell: true,
    isActive: true,
  },
];

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * Kich hoat mot subscription moi va cap credit thang dau.
 * Goi trong transaction (don 0d, webhook payOS, goi Mien phi).
 * @param {Object} tx - Prisma transaction client
 * @param {Object} params - { userId, plan, orderItemId }
 */
const activateSubscription = async (tx, { userId, plan, orderItemId = null }) => {
  const now = new Date();

  // Moi phu huynh chi co 1 subscription active (partial unique) -> dong goi cu truoc
  await tx.subscription.updateMany({
    where: { parentId: userId, status: 'active' },
    data: { status: 'cancelled' },
  });

  const subscription = await tx.subscription.create({
    data: {
      parentId: userId,
      planId: plan.id,
      orderItemId,
      periodStart: now,
      periodEnd: addMonths(now, plan.durationMonths),
      nextCreditGrantAt: addMonths(now, 1),
      status: 'active',
    },
    include: { plan: true },
  });

  if (plan.creditsPerMonth > 0) {
    await walletsService.grantSubscriptionCredits(tx, {
      userId,
      subscriptionId: subscription.id,
      credits: plan.creditsPerMonth,
    });
  }

  return subscription;
};

// ==========================================
// 1. PLANS SERVICE
// ==========================================

const getPlans = async () => {
  let plans = await prisma.plan.findMany({
    orderBy: { priceVnd: 'asc' },
  });

  if (plans.length === 0) {
    for (const planData of DEFAULT_PLANS) {
      await prisma.plan.upsert({
        where: { code: planData.code },
        update: {},
        create: planData,
      });
    }

    plans = await prisma.plan.findMany({
      orderBy: { priceVnd: 'asc' },
    });
  }

  return plans;
};

/**
 * Goi Mien phi dang hoat dong (uu tien code FREE). Seed goi mac dinh neu bang plans rong.
 * @returns {Promise<Object|null>}
 */
const getFreePlan = async () => {
  const byCode = await prisma.plan.findUnique({ where: { code: 'FREE' } });
  if (byCode?.isActive) return byCode;

  const plans = await getPlans();
  return plans.find((p) => p.isActive && p.priceVnd === 0n) || null;
};

const getPlanById = async (id) => {
  const plan = await prisma.plan.findUnique({
    where: { id },
  });

  if (!plan) {
    throw new ApiError(404, 'Subscription plan not found');
  }

  return plan;
};

const createPlan = async (data) => {
  const existing = await prisma.plan.findUnique({
    where: { code: data.code },
  });

  if (existing) {
    throw new ApiError(409, `Plan with code '${data.code}' already exists`);
  }

  return prisma.plan.create({
    data: {
      ...data,
      priceVnd: BigInt(data.priceVnd),
    },
  });
};

const updatePlan = async (id, data) => {
  const plan = await prisma.plan.findUnique({
    where: { id },
  });

  if (!plan) {
    throw new ApiError(404, 'Subscription plan not found');
  }

  if (data.code && data.code !== plan.code) {
    const existing = await prisma.plan.findUnique({
      where: { code: data.code },
    });
    if (existing) {
      throw new ApiError(409, `Plan with code '${data.code}' already exists`);
    }
  }

  const updateData = { ...data };
  if (updateData.priceVnd !== undefined) {
    updateData.priceVnd = BigInt(updateData.priceVnd);
  }

  return prisma.plan.update({
    where: { id },
    data: updateData,
  });
};

const deletePlan = async (id) => {
  const plan = await prisma.plan.findUnique({
    where: { id },
  });

  if (!plan) {
    throw new ApiError(404, 'Subscription plan not found');
  }

  return prisma.plan.update({
    where: { id },
    data: { isActive: false },
  });
};

// ==========================================
// 2. SUBSCRIPTIONS SERVICE
// ==========================================

const getMySubscription = async (userId) => {
  const now = new Date();
  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      parentId: userId,
      status: 'active',
      periodEnd: { gt: now },
    },
    include: {
      plan: true,
    },
    orderBy: { periodEnd: 'desc' },
  });

  const childrenCount = await prisma.childProfile.count({
    where: { parentId: userId, deletedAt: null },
  });

  const charactersCount = await prisma.character.count({
    where: { parentId: userId, deletedAt: null },
  });

  if (!activeSubscription) {
    // Return free default tier limits
    const freePlan = (await prisma.plan.findUnique({ where: { code: 'FREE' } })) || {
      code: 'FREE',
      name: 'Gói Trải Nghiệm Miễn Phí',
      maxChildren: 2,
      maxCharacters: 5,
      creditsPerMonth: 0,
      canSell: false,
    };

    return {
      hasActiveSubscription: false,
      subscription: null,
      currentUsage: {
        childrenCount,
        charactersCount,
      },
      effectivePlan: freePlan,
    };
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });

  return {
    hasActiveSubscription: true,
    subscription: activeSubscription,
    currentUsage: {
      childrenCount,
      charactersCount,
      creditBalance: wallet?.creditBalance ?? 0,
    },
    effectivePlan: activeSubscription.plan,
  };
};

const subscribeFreePlan = async (userId, planId) => {
  const now = new Date();

  // Check active paid or current valid subscription
  const activeSub = await prisma.subscription.findFirst({
    where: {
      parentId: userId,
      status: 'active',
      periodEnd: { gt: now },
    },
    include: { plan: true },
  });

  if (activeSub && activeSub.plan.priceVnd > 0n) {
    throw new ApiError(400, 'You already have an active paid subscription');
  }

  let freePlan;
  if (planId) {
    freePlan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!freePlan || freePlan.priceVnd !== 0n) {
      throw new ApiError(400, 'Invalid free plan selected');
    }
  } else {
    freePlan = await getFreePlan();
  }

  if (!freePlan) {
    throw new ApiError(404, 'Free tier plan is not available');
  }

  // Goi Mien phi dang chay thi giu nguyen, khong cap credit lai
  if (activeSub) {
    return activeSub;
  }

  return prisma.$transaction((tx) => activateSubscription(tx, { userId, plan: freePlan }));
};

const cancelMySubscription = async (userId) => {
  const activeSub = await prisma.subscription.findFirst({
    where: {
      parentId: userId,
      status: 'active',
    },
    include: { plan: true },
  });

  if (!activeSub) {
    throw new ApiError(404, 'No active subscription found to cancel');
  }

  const updated = await prisma.subscription.update({
    where: { id: activeSub.id },
    data: {
      status: 'cancelled',
    },
    include: { plan: true },
  });

  return updated;
};

const getAllSubscriptions = async (query = {}) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const where = {};
  if (query.status) {
    where.status = query.status;
  }
  if (query.parentId) {
    where.parentId = query.parentId;
  }

  const [total, subscriptions] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      skip,
      take: limit,
      include: {
        plan: true,
        parent: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    subscriptions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export default {
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getFreePlan,
  activateSubscription,
  getMySubscription,
  subscribeFreePlan,
  cancelMySubscription,
  getAllSubscriptions,
};
