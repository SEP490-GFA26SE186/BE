import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';
import bookshelfService from '../bookshelf/bookshelf.service.js';
import reportsService from '../reports/reports.service.js';

// Default free quota if user has no paid subscription
const DEFAULT_FREE_MAX_CHILDREN = 2;

/**
 * Helper: Calculate age from birth date
 * @param {Date|string|null} birthDate
 * @returns {number|null} Age in years
 */
const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const now = new Date();
  const birth = new Date(birthDate);
  let ageYears = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    ageYears--;
  }
  return Math.max(0, ageYears);
};

/**
 * Helper: Format child profile database record for client response
 * @param {Object} child
 * @returns {Object}
 */
const formatChildResponse = (child) => {
  // Nhan vat dai dien cua tre (characters.child_id unique)
  const selfChar = child.character && !child.character.deletedAt ? child.character : null;

  return {
    id: child.id,
    parentId: child.parentId,
    name: child.name,
    birthDate: child.birthDate ? child.birthDate.toISOString().split('T')[0] : null,
    age: calculateAge(child.birthDate),
    dailyScreenTimeMinutes: child.dailyScreenTimeMinutes,
    preferredVoice: child.preferredVoice,
    avatar: selfChar
      ? {
          characterId: selfChar.id,
          appearance: selfChar.appearance,
          portraitImageKey: selfChar.portraitImageKey,
          portraitStatus: selfChar.portraitStatus,
        }
      : null,
    booksCount: child._count?.bookshelfItems ?? 0,
    completedSessionsCount: child._count?.playSessions ?? 0,
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
  };
};

/**
 * Get maximum children allowed based on parent active subscription
 * @param {string} parentId
 * @returns {Promise<number>}
 */
const getMaxChildrenQuota = async (parentId) => {
  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      parentId,
      status: 'active',
      periodEnd: { gt: new Date() },
    },
    include: {
      plan: {
        select: { maxChildren: true },
      },
    },
  });

  return activeSubscription?.plan?.maxChildren ?? DEFAULT_FREE_MAX_CHILDREN;
};

/**
 * Create a new child profile and auto-create self character
 * @param {string} parentId
 * @param {Object} data
 * @returns {Promise<Object>} Formatted child profile
 */
const createChild = async (parentId, data) => {
  const maxAllowed = await getMaxChildrenQuota(parentId);
  const currentCount = await prisma.childProfile.count({
    where: {
      parentId,
      deletedAt: null,
    },
  });

  if (currentCount >= maxAllowed) {
    throw ApiError.forbidden(
      `You have reached the maximum limit of ${maxAllowed} child profiles for your current plan. Please upgrade to add more children.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create Child Profile
    const child = await tx.childProfile.create({
      data: {
        parentId,
        name: data.name.trim(),
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        dailyScreenTimeMinutes: data.dailyScreenTimeMinutes ?? 30,
        preferredVoice: data.preferredVoice?.trim() || null,
      },
    });

    // 2. Automatically create 'self' character for the child
    await tx.character.create({
      data: {
        parentId,
        childId: child.id,
        name: data.name.trim(),
        appearance: data.appearance?.trim() || '', // characters.appearance NOT NULL
        portraitImageKey: data.portraitImageKey?.trim() || null,
        portraitStatus: data.portraitImageKey ? 'ready' : 'none',
      },
    });

    // 3. Return full formatted child
    const result = await tx.childProfile.findUnique({
      where: { id: child.id },
      include: {
        character: true,
        _count: {
          select: {
            bookshelfItems: true,
            playSessions: { where: { status: 'completed' } },
          },
        },
      },
    });

    return formatChildResponse(result);
  });
};

/**
 * Get all active child profiles for parent
 * @param {string} parentId
 * @returns {Promise<Array>} List of child profiles
 */
const getChildren = async (parentId) => {
  const children = await prisma.childProfile.findMany({
    where: {
      parentId,
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      character: true,
      _count: {
        select: {
          bookshelfItems: true,
          playSessions: { where: { status: 'completed' } },
        },
      },
    },
  });

  return children.map(formatChildResponse);
};

/**
 * Get single child profile by ID
 * @param {string} parentId
 * @param {string} childId
 * @returns {Promise<Object>} Formatted child profile
 */
const getChildById = async (parentId, childId) => {
  const child = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      parentId,
      deletedAt: null,
    },
    include: {
      character: true,
      _count: {
        select: {
          bookshelfItems: true,
          playSessions: { where: { status: 'completed' } },
        },
      },
    },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found or access denied');
  }

  return formatChildResponse(child);
};

/**
 * Update child profile
 * @param {string} parentId
 * @param {string} childId
 * @param {Object} data
 * @returns {Promise<Object>} Updated child profile
 */
const updateChild = async (parentId, childId, data) => {
  const existingChild = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      parentId,
      deletedAt: null,
    },
  });

  if (!existingChild) {
    throw ApiError.notFound('Child profile not found');
  }

  const updatePayload = {};
  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.birthDate !== undefined) updatePayload.birthDate = data.birthDate ? new Date(data.birthDate) : null;
  if (data.dailyScreenTimeMinutes !== undefined) updatePayload.dailyScreenTimeMinutes = data.dailyScreenTimeMinutes;
  if (data.preferredVoice !== undefined) updatePayload.preferredVoice = data.preferredVoice?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const updatedChild = await tx.childProfile.update({
      where: { id: childId },
      data: updatePayload,
    });

    // If name or avatar info changed, synchronize with the self character
    if (data.name || data.appearance !== undefined || data.portraitImageKey !== undefined) {
      const selfChar = await tx.character.findFirst({
        where: { childId, deletedAt: null },
      });

      if (selfChar) {
        await tx.character.update({
          where: { id: selfChar.id },
          data: {
            ...(data.name && { name: data.name.trim() }),
            ...(data.appearance !== undefined && { appearance: data.appearance ? data.appearance.trim() : '' }),
            ...(data.portraitImageKey !== undefined && {
              portraitImageKey: data.portraitImageKey ? data.portraitImageKey.trim() : null,
              portraitStatus: data.portraitImageKey ? 'ready' : 'none',
            }),
          },
        });
      }
    }

    const fullChild = await tx.childProfile.findUnique({
      where: { id: childId },
      include: {
        character: true,
        _count: {
          select: {
            bookshelfItems: true,
            playSessions: { where: { status: 'completed' } },
          },
        },
      },
    });

    return formatChildResponse(fullChild);
  });
};

/**
 * Soft delete child profile
 * @param {string} parentId
 * @param {string} childId
 */
const deleteChild = async (parentId, childId) => {
  const existingChild = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      parentId,
      deletedAt: null,
    },
  });

  if (!existingChild) {
    throw ApiError.notFound('Child profile not found');
  }

  await prisma.$transaction(async (tx) => {
    // Soft delete child profile
    await tx.childProfile.update({
      where: { id: childId },
      data: { deletedAt: new Date() },
    });

    // Soft delete associated self character
    await tx.character.updateMany({
      where: { childId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // Invalidate any active kid session token for this child
    await tx.authToken.updateMany({
      where: {
        childId,
        type: 'kid_session',
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });
  });

  return { message: 'Xóa hồ sơ bé thành công' };
};

/**
 * Update child avatar / portrait
 * @param {string} parentId
 * @param {string} childId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updateChildAvatar = async (parentId, childId, { appearance, portraitImageKey }) => {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId, deletedAt: null },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found');
  }

  let selfChar = await prisma.character.findFirst({
    where: { childId, deletedAt: null },
  });

  if (!selfChar) {
    selfChar = await prisma.character.create({
      data: {
        parentId,
        childId,
        name: child.name,
        appearance: appearance ? appearance.trim() : '',
        portraitImageKey: portraitImageKey ? portraitImageKey.trim() : null,
        portraitStatus: portraitImageKey ? 'ready' : 'none',
      },
    });
  } else {
    selfChar = await prisma.character.update({
      where: { id: selfChar.id },
      data: {
        ...(appearance !== undefined && { appearance: appearance ? appearance.trim() : '' }),
        ...(portraitImageKey !== undefined && {
          portraitImageKey: portraitImageKey ? portraitImageKey.trim() : null,
          portraitStatus: portraitImageKey ? 'ready' : 'none',
        }),
      },
    });
  }

  return {
    characterId: selfChar.id,
    appearance: selfChar.appearance,
    portraitImageKey: selfChar.portraitImageKey,
    portraitStatus: selfChar.portraitStatus,
  };
};

/**
 * Get screen time usage statistics for a child
 * @param {string} parentId
 * @param {string} childId
 * @param {string} [dateStr] - YYYY-MM-DD (defaults to today)
 * @returns {Promise<Object>} Usage statistics
 */
const getChildUsage = async (parentId, childId, dateStr) => {
  const child = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      parentId,
      deletedAt: null,
    },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found');
  }

  // Hom nay theo gio Viet Nam (usage_date la cot generated theo Asia/Ho_Chi_Minh)
  const targetDateStr =
    dateStr || new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
  const targetDate = new Date(targetDateStr);

  const sessions = await prisma.childUsageSession.findMany({
    where: {
      childId,
      usageDate: targetDate,
    },
    orderBy: {
      startedAt: 'desc',
    },
  });

  const totalDurationSeconds = sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  const totalMinutes = Math.round(totalDurationSeconds / 60);
  const remainingMinutes = Math.max(0, child.dailyScreenTimeMinutes - totalMinutes);
  const isLimitReached = totalMinutes >= child.dailyScreenTimeMinutes;

  return {
    childId: child.id,
    childName: child.name,
    date: targetDateStr,
    dailyLimitMinutes: child.dailyScreenTimeMinutes,
    usedMinutes: totalMinutes,
    usedSeconds: totalDurationSeconds,
    remainingMinutes,
    isLimitReached,
    sessionsCount: sessions.length,
    sessions: sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSeconds: s.durationSeconds,
    })),
  };
};

/**
 * Log a usage session for a child (e.g. after reading a story)
 * @param {string} parentId
 * @param {string} childId
 * @param {Object} sessionData
 * @returns {Promise<Object>} Recorded session
 */
const logUsageSession = async (parentId, childId, { startedAt, endedAt, durationSeconds }) => {
  const child = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      parentId,
      deletedAt: null,
    },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found');
  }

  const end = endedAt
    ? new Date(endedAt)
    : startedAt
      ? new Date(new Date(startedAt).getTime() + durationSeconds * 1000)
      : new Date();
  const start = startedAt ? new Date(startedAt) : new Date(end.getTime() - durationSeconds * 1000);

  if (end <= start) {
    throw ApiError.badRequest('endedAt must be after startedAt');
  }

  // duration_seconds va usage_date la cot GENERATED trong DB, khong duoc ghi
  const session = await prisma.childUsageSession.create({
    data: {
      childId,
      startedAt: start,
      endedAt: end,
    },
  });

  return session;
};

/**
 * Get EQ report for child (Radar Chart data) - dung chung voi /reports/eq/children/:childId
 * @param {string} parentId
 * @param {string} childId
 * @param {Object} filter - { startDate, endDate }
 * @returns {Promise<Object>}
 */
const getChildEqReport = (parentId, childId, filter = {}) =>
  reportsService.getChildEqReport(parentId, childId, filter);

/**
 * Get comprehensive child dashboard overview
 * @param {string} parentId
 * @param {string} childId
 * @returns {Promise<Object>}
 */
const getChildOverview = async (parentId, childId) => {
  const child = await getChildById(parentId, childId);
  const todayUsage = await getChildUsage(parentId, childId);
  const eqReport = await getChildEqReport(parentId, childId);

  // Get most recent reading session
  const lastSession = await prisma.playSession.findFirst({
    where: { childId },
    orderBy: { startedAt: 'desc' },
    include: {
      story: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  return {
    profile: child,
    todayUsage: {
      dailyLimitMinutes: todayUsage.dailyLimitMinutes,
      usedMinutes: todayUsage.usedMinutes,
      remainingMinutes: todayUsage.remainingMinutes,
      isLimitReached: todayUsage.isLimitReached,
    },
    readingStats: {
      booksInBookshelf: child.booksCount,
      completedStories: child.completedSessionsCount,
      lastReadStory: lastSession?.story || null,
      lastReadAt: lastSession?.startedAt || null,
    },
    eqRadar: {
      skills: eqReport.radarMetrics,
      focusSkill: eqReport.summary.focusSkill,
      strongestSkill: eqReport.summary.strongestSkill,
    },
  };
};

/**
 * Get bookshelf for child directly
 * @param {Object} user
 * @param {string} childId
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getChildBookshelf = async (user, childId, query) => {
  return bookshelfService.getBookshelf(user, { ...query, childId });
};

export default {
  createChild,
  getChildren,
  getChildById,
  updateChild,
  deleteChild,
  updateChildAvatar,
  getChildUsage,
  logUsageSession,
  getChildEqReport,
  getChildOverview,
  getChildBookshelf,
};
