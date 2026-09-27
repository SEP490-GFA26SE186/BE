import prisma from '../../config/prisma.js';
import { ApiError } from '../../utils/index.js';

const DEFAULT_PLANS = [
  {
    code: 'FREE',
    name: 'Gói Trải Nghiệm (Free Explorer)',
    period: 'month',
    priceVnd: 0n,
    aiStoryQuota: 2,
    aiImageQuota: 4,
    maxChildren: 2,
    maxCharacters: 5,
    canSell: false,
    isActive: true,
  },
  {
    code: 'MONTHLY_PRO',
    name: 'Gói Gia Đình Tiêu Chuẩn (Family Storyteller Monthly)',
    period: 'month',
    priceVnd: 99000n,
    aiStoryQuota: 20,
    aiImageQuota: 50,
    maxChildren: 5,
    maxCharacters: 20,
    canSell: true,
    isActive: true,
  },
  {
    code: 'YEARLY_PRO',
    name: 'Gói Gia Đình Cao Cấp (Family Storyteller Annual)',
    period: 'year',
    priceVnd: 990000n,
    aiStoryQuota: 300,
    aiImageQuota: 650,
    maxChildren: 10,
    maxCharacters: 50,
    canSell: true,
    isActive: true,
  },
];

const DEFAULT_CREDIT_PACKS = [
  {
    name: 'Gói Khởi Đầu (Starter 50 Xu)',
    credits: 50,
    bonusCredits: 0,
    priceVnd: 50000n,
    isActive: true,
  },
  {
    name: 'Gói Phổ Biến (Standard 150 + 20 Xu Thưởng)',
    credits: 150,
    bonusCredits: 20,
    priceVnd: 150000n,
    isActive: true,
  },
  {
    name: 'Gói Siêu Cấp (Pro 500 + 100 Xu Thưởng)',
    credits: 500,
    bonusCredits: 100,
    priceVnd: 450000n,
    isActive: true,
  },
];

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
// 2. CREDIT PACKS SERVICE
// ==========================================

const getCreditPacks = async () => {
  let packs = await prisma.creditPack.findMany({
    orderBy: { priceVnd: 'asc' },
  });

  if (packs.length === 0) {
    for (const packData of DEFAULT_CREDIT_PACKS) {
      await prisma.creditPack.create({
        data: packData,
      });
    }

    packs = await prisma.creditPack.findMany({
      orderBy: { priceVnd: 'asc' },
    });
  }

  return packs;
};

const getCreditPackById = async (id) => {
  const pack = await prisma.creditPack.findUnique({
    where: { id },
  });

  if (!pack) {
    throw new ApiError(404, 'Credit pack not found');
  }

  return pack;
};

const createCreditPack = async (data) => {
  return prisma.creditPack.create({
    data: {
      ...data,
      priceVnd: BigInt(data.priceVnd),
    },
  });
};

const updateCreditPack = async (id, data) => {
  const pack = await prisma.creditPack.findUnique({
    where: { id },
  });

  if (!pack) {
    throw new ApiError(404, 'Credit pack not found');
  }

  const updateData = { ...data };
  if (updateData.priceVnd !== undefined) {
    updateData.priceVnd = BigInt(updateData.priceVnd);
  }

  return prisma.creditPack.update({
    where: { id },
    data: updateData,
  });
};

const deleteCreditPack = async (id) => {
  const pack = await prisma.creditPack.findUnique({
    where: { id },
  });

  if (!pack) {
    throw new ApiError(404, 'Credit pack not found');
  }

  return prisma.creditPack.update({
    where: { id },
    data: { isActive: false },
  });
};

// ==========================================
// 3. SUBSCRIPTIONS SERVICE
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
      aiStoryQuota: 2,
      aiImageQuota: 4,
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

  // Count AI usage in this subscription cycle
  const storyAiUsageCount = await prisma.aiRequest.count({
    where: {
      userId,
      quotaSource: 'plan',
      requestType: 'story_text',
      createdAt: {
        gte: activeSubscription.periodStart,
        lte: activeSubscription.periodEnd,
      },
    },
  });

  const imageAiUsageCount = await prisma.aiRequest.count({
    where: {
      userId,
      quotaSource: 'plan',
      requestType: { in: ['story_image', 'character_portrait'] },
      createdAt: {
        gte: activeSubscription.periodStart,
        lte: activeSubscription.periodEnd,
      },
    },
  });

  return {
    hasActiveSubscription: true,
    subscription: activeSubscription,
    currentUsage: {
      childrenCount,
      charactersCount,
      storyAiUsed: storyAiUsageCount,
      storyAiRemaining: Math.max(0, activeSubscription.plan.aiStoryQuota - storyAiUsageCount),
      imageAiUsed: imageAiUsageCount,
      imageAiRemaining: Math.max(0, activeSubscription.plan.aiImageQuota - imageAiUsageCount),
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
    freePlan = await prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!freePlan) {
      const plans = await getPlans();
      freePlan = plans.find((p) => p.priceVnd === 0n);
    }
  }

  if (!freePlan) {
    throw new ApiError(404, 'Free tier plan is not available');
  }

  // Set period for 30 days
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // If there's an existing free subscription, update it; otherwise create
  if (activeSub) {
    return prisma.subscription.update({
      where: { id: activeSub.id },
      data: {
        periodStart: now,
        periodEnd,
        status: 'active',
      },
      include: { plan: true },
    });
  }

  return prisma.subscription.create({
    data: {
      parentId: userId,
      planId: freePlan.id,
      periodStart: now,
      periodEnd,
      status: 'active',
    },
    include: { plan: true },
  });
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
  getCreditPacks,
  getCreditPackById,
  createCreditPack,
  updateCreditPack,
  deleteCreditPack,
  getMySubscription,
  subscribeFreePlan,
  cancelMySubscription,
  getAllSubscriptions,
};
