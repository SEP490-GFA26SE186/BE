import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

const DEFAULT_SETTINGS = [
  { key: 'commission_rate', value: 30, description: 'Tỷ lệ hoa hồng nền tảng giữ lại từ doanh thu bán truyện (%)' },
  { key: 'holding_days', value: 7, description: 'Số ngày giam tiền bảo đảm trước khi tiền vào ví khả dụng của Seller' },
  { key: 'min_withdrawal_vnd', value: 100000, description: 'Số tiền rút tối thiểu mỗi lần (VNĐ)' },
  { key: 'report_threshold', value: 3, description: 'Số lượt báo cáo vi phạm tối thiểu trong 24h để tự động tạm gỡ truyện' },
  { key: 'free_children_quota', value: 2, description: 'Số hồ sơ bé miễn phí mặc định cho tài khoản phụ huynh' },
  { key: 'free_characters_quota', value: 5, description: 'Số nhân vật gia đình miễn phí mặc định' },
];

/**
 * Log an administrative action to the audit trail
 * @param {Object} payload - { actorId, action, targetType, targetId, beforeState, afterState, ipAddress }
 * @returns {Promise<Object>}
 */
const logAdminAction = async ({ actorId, action, targetType, targetId, beforeState, afterState, ipAddress }) => {
  try {
    return await prisma.adminAuditLog.create({
      data: {
        actorId,
        action,
        targetType: targetType || null,
        targetId: targetId || null,
        beforeState: beforeState || null,
        afterState: afterState || null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (error) {
    console.error('Failed to write admin audit log:', error);
    return null;
  }
};

/**
 * Get all platform settings, auto-seed defaults if missing
 * @param {string} currentUserId
 * @returns {Promise<Array>}
 */
const getSettings = async (currentUserId) => {
  const settings = await prisma.platformSetting.findMany({
    include: {
      updatedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    },
  });

  if (settings.length === 0 && currentUserId) {
    // Seed default settings
    for (const item of DEFAULT_SETTINGS) {
      await prisma.platformSetting.create({
        data: {
          key: item.key,
          value: item.value,
          updatedById: currentUserId,
        },
      });
    }

    return prisma.platformSetting.findMany({
      include: {
        updatedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });
  }

  return settings;
};

/**
 * Get a single setting by key
 * @param {string} key
 * @returns {Promise<Object>}
 */
const getSettingByKey = async (key) => {
  const setting = await prisma.platformSetting.findUnique({
    where: { key },
    include: {
      updatedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    },
  });

  if (!setting) {
    throw ApiError.notFound(`Platform setting '${key}' not found`);
  }

  return setting;
};

/**
 * Update a platform setting
 * @param {Object} user - Admin
 * @param {string} key
 * @param {any} value
 * @param {string} [ipAddress]
 * @returns {Promise<Object>}
 */
const updateSetting = async (user, key, value, ipAddress) => {
  const existing = await prisma.platformSetting.findUnique({ where: { key } });

  const beforeState = existing ? existing.value : null;

  const updated = await prisma.platformSetting.upsert({
    where: { key },
    create: {
      key,
      value,
      updatedById: user.id,
    },
    update: {
      value,
      updatedById: user.id,
    },
    include: {
      updatedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    },
  });

  // Record audit log
  await logAdminAction({
    actorId: user.id,
    action: 'UPDATE_PLATFORM_SETTING',
    targetType: 'PLATFORM_SETTING',
    beforeState: { [key]: beforeState },
    afterState: { [key]: value },
    ipAddress,
  });

  return updated;
};

/**
 * Get administrative audit logs with filtering and pagination
 * @param {Object} filter - { actorId, action, targetType, startDate, endDate, page, limit }
 * @returns {Promise<Object>}
 */
const getAuditLogs = async (filter = {}) => {
  const { actorId, action, targetType, startDate, endDate, page = 1, limit = 20 } = filter;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  const where = {};
  if (actorId) where.actorId = actorId;
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (targetType) where.targetType = targetType;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) {
      const endD = new Date(endDate);
      endD.setHours(23, 59, 59, 999);
      where.createdAt.lte = endD;
    }
  }

  const [total, logs] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
    }),
  ]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    logs: logs.map((log) => ({
      id: log.id.toString(), // Convert BigInt to String for JSON serialization
      actor: log.actor,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      beforeState: log.beforeState,
      afterState: log.afterState,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    })),
  };
};

export default {
  logAdminAction,
  getSettings,
  getSettingByKey,
  updateSetting,
  getAuditLogs,
};
