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
  getMySubscription,
  subscribeFreePlan,
  cancelMySubscription,
  getAllSubscriptions,
};
