import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';

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
 * Helper: Format child profile database record for client response
 * @param {Object} child
 * @returns {Object}
 */
const formatChildResponse = (child) => {
  return {
    id: child.id,
    parentId: child.parentId,
    name: child.name,
    birthDate: child.birthDate ? child.birthDate.toISOString().split('T')[0] : null,
    dailyScreenTimeMinutes: child.dailyScreenTimeMinutes,
    bedtimeStart: formatTimeToHHMM(child.bedtimeStart),
    bedtimeEnd: formatTimeToHHMM(child.bedtimeEnd),
    preferredVoice: child.preferredVoice,
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
 * Create a new child profile
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
      `Bạn đã đạt giới hạn tối đa ${maxAllowed} hồ sơ bé theo gói dịch vụ hiện tại. Vui lòng nâng cấp gói để thêm bé.`,
    );
  }

  const child = await prisma.childProfile.create({
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

  return formatChildResponse(child);
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
  });

  if (!child) {
    throw ApiError.notFound('Không tìm thấy hồ sơ bé hoặc bạn không có quyền truy cập');
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
    throw ApiError.notFound('Không tìm thấy hồ sơ bé');
  }

  const updatePayload = {};
  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.birthDate !== undefined) updatePayload.birthDate = data.birthDate ? new Date(data.birthDate) : null;
  if (data.dailyScreenTimeMinutes !== undefined) updatePayload.dailyScreenTimeMinutes = data.dailyScreenTimeMinutes;
  if (data.bedtimeStart !== undefined) updatePayload.bedtimeStart = parseTimeToDate(data.bedtimeStart);
  if (data.bedtimeEnd !== undefined) updatePayload.bedtimeEnd = parseTimeToDate(data.bedtimeEnd);
  if (data.preferredVoice !== undefined) updatePayload.preferredVoice = data.preferredVoice?.trim() || null;

  const updatedChild = await prisma.childProfile.update({
    where: { id: childId },
    data: updatePayload,
  });

  return formatChildResponse(updatedChild);
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
    throw ApiError.notFound('Không tìm thấy hồ sơ bé');
  }

  await prisma.$transaction(async (tx) => {
    // Soft delete child profile
    await tx.childProfile.update({
      where: { id: childId },
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
    throw ApiError.notFound('Không tìm thấy hồ sơ bé');
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
    throw ApiError.notFound('Không tìm thấy hồ sơ bé');
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

export default {
  createChild,
  getChildren,
  getChildById,
  updateChild,
  deleteChild,
  getChildUsage,
  logUsageSession,
};
