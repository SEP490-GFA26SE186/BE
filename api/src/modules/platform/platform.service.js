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

// =============================================================================
// USER MANAGEMENT (ADMIN ONLY)
// =============================================================================

/**
 * List users with pagination and search
 * @param {Object} query
 */
const getUsers = async (query = {}) => {
  const { role, isActive, search, page = 1, limit = 20 } = query;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const where = { deletedAt: null };

  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;

  if (search) {
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { fullName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        sellerProfile: {
          select: {
            id: true,
            status: true,
            displayName: true,
          },
        },
        _count: {
          select: {
            childProfiles: true,
            createdStories: true,
            orders: true,
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
    users: users.map((u) => ({
      ...u,
      childrenCount: u._count.childProfiles,
      storiesCount: u._count.createdStories,
      ordersCount: u._count.orders,
    })),
  };
};

/**
 * Get detailed user information by ID
 * @param {string} userId
 */
const getUserById = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      username: true,
      email: true,
      fullName: true,
      phone: true,
      isActive: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      sellerProfile: true,
      childProfiles: {
        select: {
          id: true,
          name: true,
          birthYear: true,
          gender: true,
          dailyTimeLimitMinutes: true,
        },
      },
      wallets: true,
    },
  });

  if (!user) {
    throw ApiError.notFound('Người dùng không tồn tại');
  }

  return user;
};

/**
 * Update user role (e.g., promote to moderator / demote to parent)
 * @param {Object} adminUser
 * @param {string} targetUserId
 * @param {string} newRole
 * @param {string} ipAddress
 */
const updateUserRole = async (adminUser, targetUserId, newRole, ipAddress) => {
  if (adminUser.id === targetUserId) {
    throw ApiError.badRequest('Không thể tự thay đổi vai trò (role) của chính mình');
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!target) {
    throw ApiError.notFound('Người dùng không tồn tại');
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: {
      id: true,
      role: true,
      username: true,
      email: true,
      fullName: true,
    },
  });

  await logAdminAction({
    actorId: adminUser.id,
    action: 'update_user_role',
    targetType: 'User',
    targetId: targetUserId,
    beforeState: { role: target.role },
    afterState: { role: newRole },
    ipAddress,
  });

  return updated;
};

/**
 * Ban or unban user
 * @param {Object} adminUser
 * @param {string} targetUserId
 * @param {boolean} isActive
 * @param {string} ipAddress
 */
const updateUserStatus = async (adminUser, targetUserId, isActive, ipAddress) => {
  if (adminUser.id === targetUserId) {
    throw ApiError.badRequest('Không thể tự khóa tài khoản của chính mình');
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!target) {
    throw ApiError.notFound('Người dùng không tồn tại');
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive },
    select: {
      id: true,
      role: true,
      username: true,
      email: true,
      fullName: true,
      isActive: true,
    },
  });

  if (!isActive) {
    // Revoke tokens if banned
    await prisma.authToken.deleteMany({
      where: { userId: targetUserId },
    });
  }

  await logAdminAction({
    actorId: adminUser.id,
    action: isActive ? 'unban_user' : 'ban_user',
    targetType: 'User',
    targetId: targetUserId,
    beforeState: { isActive: target.isActive },
    afterState: { isActive },
    ipAddress,
  });

  return updated;
};

// =============================================================================
// VOUCHER MANAGEMENT (ADMIN ONLY)
// =============================================================================

/**
 * Get all vouchers
 * @param {Object} query
 */
const getVouchers = async (query = {}) => {
  const { isActive, search, page = 1, limit = 20 } = query;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const where = {};
  if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;
  if (search) {
    where.code = { contains: search, mode: 'insensitive' };
  }

  const [total, vouchers] = await Promise.all([
    prisma.voucher.count({ where }),
    prisma.voucher.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { startsAt: 'desc' },
      include: {
        creator: {
          select: { id: true, username: true, fullName: true },
        },
      },
    }),
  ]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    vouchers: vouchers.map((v) => ({
      ...v,
      value: v.value.toString(),
      maxDiscountVnd: v.maxDiscountVnd ? v.maxDiscountVnd.toString() : null,
      minOrderVnd: v.minOrderVnd.toString(),
    })),
  };
};

/**
 * Get voucher details by ID
 * @param {string} id
 */
const getVoucherById = async (id) => {
  const voucher = await prisma.voucher.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true, fullName: true } },
      _count: { select: { usages: true, orders: true } },
    },
  });

  if (!voucher) {
    throw ApiError.notFound('Voucher không tồn tại');
  }

  return {
    ...voucher,
    value: voucher.value.toString(),
    maxDiscountVnd: voucher.maxDiscountVnd ? voucher.maxDiscountVnd.toString() : null,
    minOrderVnd: voucher.minOrderVnd.toString(),
  };
};

/**
 * Create a new voucher
 * @param {string} userId
 * @param {Object} data
 */
const createVoucher = async (userId, data) => {
  const code = data.code.toUpperCase().trim();
  const existing = await prisma.voucher.findUnique({
    where: { code },
  });

  if (existing) {
    throw ApiError.conflict('Mã voucher này đã tồn tại');
  }

  const created = await prisma.voucher.create({
    data: {
      code,
      discountType: data.discountType,
      value: BigInt(data.value),
      maxDiscountVnd: data.maxDiscountVnd ? BigInt(data.maxDiscountVnd) : null,
      minOrderVnd: data.minOrderVnd ? BigInt(data.minOrderVnd) : 0n,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      usageLimit: data.usageLimit || null,
      perUserLimit: data.perUserLimit || 1,
      isActive: data.isActive ?? true,
      createdBy: userId,
    },
  });

  return {
    ...created,
    value: created.value.toString(),
    maxDiscountVnd: created.maxDiscountVnd ? created.maxDiscountVnd.toString() : null,
    minOrderVnd: created.minOrderVnd.toString(),
  };
};

/**
 * Update a voucher
 * @param {string} id
 * @param {Object} data
 */
const updateVoucher = async (id, data) => {
  const existing = await prisma.voucher.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound('Voucher không tồn tại');
  }

  const updated = await prisma.voucher.update({
    where: { id },
    data: {
      ...(data.code && { code: data.code.toUpperCase().trim() }),
      ...(data.discountType && { discountType: data.discountType }),
      ...(data.value !== undefined && { value: BigInt(data.value) }),
      ...(data.maxDiscountVnd !== undefined && {
        maxDiscountVnd: data.maxDiscountVnd ? BigInt(data.maxDiscountVnd) : null,
      }),
      ...(data.minOrderVnd !== undefined && { minOrderVnd: BigInt(data.minOrderVnd) }),
      ...(data.startsAt && { startsAt: new Date(data.startsAt) }),
      ...(data.endsAt && { endsAt: new Date(data.endsAt) }),
      ...(data.usageLimit !== undefined && { usageLimit: data.usageLimit }),
      ...(data.perUserLimit !== undefined && { perUserLimit: data.perUserLimit }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  return {
    ...updated,
    value: updated.value.toString(),
    maxDiscountVnd: updated.maxDiscountVnd ? updated.maxDiscountVnd.toString() : null,
    minOrderVnd: updated.minOrderVnd.toString(),
  };
};

/**
 * Delete a voucher
 * @param {string} id
 */
const deleteVoucher = async (id) => {
  const existing = await prisma.voucher.findUnique({
    where: { id },
    include: { _count: { select: { usages: true } } },
  });

  if (!existing) {
    throw ApiError.notFound('Voucher không tồn tại');
  }

  if (existing._count.usages > 0) {
    await prisma.voucher.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Voucher đã có lượt sử dụng nên đã được chuyển sang trạng thái ngưng hoạt động (inactive)' };
  }

  await prisma.voucher.delete({ where: { id } });
  return { message: 'Đã xóa voucher thành công' };
};

export default {
  logAdminAction,
  getSettings,
  getSettingByKey,
  updateSetting,
  getAuditLogs,
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  getVouchers,
  getVoucherById,
  createVoucher,
  updateVoucher,
  deleteVoucher,
};
