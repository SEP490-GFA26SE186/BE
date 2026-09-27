import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';
import bookshelfService from '../bookshelf/bookshelf.service.js';

// Default free quota if user has no paid subscription
const DEFAULT_FREE_MAX_CHILDREN = 2;

/**
 * Helper: Parse "HH:mm" or "HH:mm:ss" string to UTC Date object for PostgreSQL Time field
 * @param {string|null} timeStr
 * @returns {Date|null}
 */
const parseTimeToDate = (timeStr) => {
  if (!timeStr) return null;
  const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds));
};

/**
 * Helper: Format Date object to "HH:mm" string
 * @param {Date|null} dateObj
 * @returns {string|null}
 */
const formatTimeToHHMM = (dateObj) => {
  if (!dateObj) return null;
  const d = new Date(dateObj);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

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
 * Helper: Check if current time in VN timezone (UTC+7) is bedtime
 * @param {Date|null} bedtimeStart
 * @param {Date|null} bedtimeEnd
 * @returns {boolean}
 */
const checkIsBedtimeNow = (bedtimeStart, bedtimeEnd) => {
  if (!bedtimeStart || !bedtimeEnd) return false;
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const curMinutes = vnTime.getUTCHours() * 60 + vnTime.getUTCMinutes();

  const startD = new Date(bedtimeStart);
  const startMinutes = startD.getUTCHours() * 60 + startD.getUTCMinutes();

  const endD = new Date(bedtimeEnd);
  const endMinutes = endD.getUTCHours() * 60 + endD.getUTCMinutes();

  if (startMinutes <= endMinutes) {
    return curMinutes >= startMinutes && curMinutes <= endMinutes;
  }
  // Overnight: e.g. 21:00 to 06:00
  return curMinutes >= startMinutes || curMinutes <= endMinutes;
};

/**
 * Helper: Format child profile database record for client response
 * @param {Object} child
 * @returns {Object}
 */
const formatChildResponse = (child) => {
  const selfChar = child.characters && child.characters.length > 0 ? child.characters[0] : null;

  return {
    id: child.id,
    parentId: child.parentId,
    name: child.name,
    birthDate: child.birthDate ? child.birthDate.toISOString().split('T')[0] : null,
    age: calculateAge(child.birthDate),
    dailyScreenTimeMinutes: child.dailyScreenTimeMinutes,
    bedtimeStart: formatTimeToHHMM(child.bedtimeStart),
    bedtimeEnd: formatTimeToHHMM(child.bedtimeEnd),
    isBedtimeNow: checkIsBedtimeNow(child.bedtimeStart, child.bedtimeEnd),
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
        bedtimeStart: parseTimeToDate(data.bedtimeStart),
        bedtimeEnd: parseTimeToDate(data.bedtimeEnd),
        preferredVoice: data.preferredVoice?.trim() || null,
      },
    });

    // 2. Automatically create 'self' character for the child
    await tx.character.create({
      data: {
        parentId,
        childId: child.id,
        name: data.name.trim(),
        role: 'self',
        appearance: data.appearance?.trim() || null,
        portraitImageKey: data.portraitImageKey?.trim() || null,
        portraitStatus: data.portraitImageKey ? 'ready' : 'none',
      },
    });

    // 3. Return full formatted child
    const result = await tx.childProfile.findUnique({
      where: { id: child.id },
      include: {
        characters: {
          where: { role: 'self', deletedAt: null },
          take: 1,
        },
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
      characters: {
        where: { role: 'self', deletedAt: null },
        take: 1,
      },
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
      characters: {
        where: { role: 'self', deletedAt: null },
        take: 1,
      },
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
  if (data.bedtimeStart !== undefined) updatePayload.bedtimeStart = parseTimeToDate(data.bedtimeStart);
  if (data.bedtimeEnd !== undefined) updatePayload.bedtimeEnd = parseTimeToDate(data.bedtimeEnd);
  if (data.preferredVoice !== undefined) updatePayload.preferredVoice = data.preferredVoice?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const updatedChild = await tx.childProfile.update({
      where: { id: childId },
      data: updatePayload,
    });

    // If name or avatar info changed, synchronize with the self character
    if (data.name || data.appearance !== undefined || data.portraitImageKey !== undefined) {
      const selfChar = await tx.character.findFirst({
        where: { childId, role: 'self', deletedAt: null },
      });

      if (selfChar) {
        await tx.character.update({
          where: { id: selfChar.id },
          data: {
            ...(data.name && { name: data.name.trim() }),
            ...(data.appearance !== undefined && { appearance: data.appearance ? data.appearance.trim() : null }),
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
        characters: {
          where: { role: 'self', deletedAt: null },
          take: 1,
        },
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
      where: { childId, role: 'self', deletedAt: null },
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
    where: { childId, role: 'self', deletedAt: null },
  });

  if (!selfChar) {
    selfChar = await prisma.character.create({
      data: {
        parentId,
        childId,
        name: child.name,
        role: 'self',
        appearance: appearance ? appearance.trim() : null,
        portraitImageKey: portraitImageKey ? portraitImageKey.trim() : null,
        portraitStatus: portraitImageKey ? 'ready' : 'none',
      },
    });
  } else {
    selfChar = await prisma.character.update({
      where: { id: selfChar.id },
      data: {
        ...(appearance !== undefined && { appearance: appearance ? appearance.trim() : null }),
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

  // Today in YYYY-MM-DD
  const targetDateStr = dateStr || new Date().toISOString().split('T')[0];
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
    isBedtimeNow: checkIsBedtimeNow(child.bedtimeStart, child.bedtimeEnd),
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

  const start = startedAt ? new Date(startedAt) : new Date(Date.now() - durationSeconds * 1000);
  const end = endedAt ? new Date(endedAt) : new Date();
  const usageDate = new Date(start.toISOString().split('T')[0]);

  const session = await prisma.childUsageSession.create({
    data: {
      childId,
      startedAt: start,
      endedAt: end,
      durationSeconds,
      usageDate,
    },
  });

  return session;
};

/**
 * Get aggregated EQ assessment report for child (Radar Chart data)
 * @param {string} parentId
 * @param {string} childId
 * @param {Object} filter - { startDate, endDate }
 * @returns {Promise<Object>}
 */
const getChildEqReport = async (parentId, childId, filter = {}) => {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId, deletedAt: null },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found');
  }

  // 1. Get all 5 CASEL competencies
  const allSkills = await prisma.eqSkill.findMany({
    orderBy: { displayOrder: 'asc' },
  });

  // 2. Fetch play sessions with EQ scores
  const playSessionWhere = {
    childId,
    status: 'completed',
  };

  if (filter.startDate || filter.endDate) {
    playSessionWhere.completedAt = {};
    if (filter.startDate) playSessionWhere.completedAt.gte = new Date(filter.startDate);
    if (filter.endDate) {
      const endD = new Date(filter.endDate);
      endD.setHours(23, 59, 59, 999);
      playSessionWhere.completedAt.lte = endD;
    }
  }

  const playSessions = await prisma.playSession.findMany({
    where: playSessionWhere,
    include: {
      eqScore: true,
      story: {
        select: {
          id: true,
          title: true,
          template: {
            select: {
              primarySkill: true,
            },
          },
        },
      },
    },
  });

  // 3. Aggregate score deltas per skill
  const skillScores = {};
  allSkills.forEach((s) => {
    skillScores[s.id] = {
      skillId: s.id,
      caselCode: s.caselCode,
      nameVi: s.nameVi,
      nameEn: s.nameEn,
      description: s.description,
      displayOrder: s.displayOrder,
      score: 0,
      sessionsCount: 0,
    };
  });

  playSessions.forEach((ps) => {
    if (ps.eqScore && skillScores[ps.eqScore.skillId]) {
      skillScores[ps.eqScore.skillId].score += ps.eqScore.scoreDelta;
      skillScores[ps.eqScore.skillId].sessionsCount += 1;
    }
  });

  const skillsArray = Object.values(skillScores);
  const totalScore = skillsArray.reduce((acc, curr) => acc + curr.score, 0);

  const skillsWithPercentage = skillsArray.map((item) => ({
    ...item,
    percentage: totalScore > 0 ? Math.round((item.score / totalScore) * 100) : 20,
  }));

  return {
    childId: child.id,
    childName: child.name,
    age: calculateAge(child.birthDate),
    totalCompletedStories: playSessions.length,
    totalEqScore: totalScore,
    skills: skillsWithPercentage,
  };
};

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
          coverImageKey: true,
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
      isBedtimeNow: todayUsage.isBedtimeNow,
    },
    readingStats: {
      booksInBookshelf: child.booksCount,
      completedStories: child.completedSessionsCount,
      lastReadStory: lastSession?.story || null,
      lastReadAt: lastSession?.startedAt || null,
    },
    eqRadar: {
      totalScore: eqReport.totalEqScore,
      skills: eqReport.skills,
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
