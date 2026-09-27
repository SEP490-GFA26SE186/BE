import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Get notifications for a user with pagination and unread filter
 * @param {string} userId
 * @param {Object} filter - { unreadOnly, page, limit }
 * @returns {Promise<Object>}
 */
const getNotifications = async (userId, filter = {}) => {
  const { unreadOnly, page = 1, limit = 20 } = filter;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  const where = { userId };
  if (unreadOnly) {
    where.readAt = null;
  }

  const [total, unreadCount, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    total,
    unreadCount,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    notifications,
  };
};

/**
 * Get quick count of unread notifications
 * @param {string} userId
 * @returns {Promise<number>}
 */
const getUnreadCount = async (userId) => {
  const count = await prisma.notification.count({
    where: {
      userId,
      readAt: null,
    },
  });
  return { unreadCount: count };
};

/**
 * Mark a single notification as read
 * @param {string} userId
 * @param {string} notificationId
 * @returns {Promise<Object>}
 */
const markAsRead = async (userId, notificationId) => {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!existing) {
    throw ApiError.notFound('Notification not found');
  }

  if (existing.readAt) {
    return existing;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
};

/**
 * Mark all notifications for a user as read
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const markAllAsRead = async (userId) => {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  return {
    message: 'Đã đánh dấu tất cả thông báo là đã đọc',
    updatedCount: result.count,
  };
};

/**
 * Delete a notification
 * @param {string} userId
 * @param {string} notificationId
 * @returns {Promise<Object>}
 */
const deleteNotification = async (userId, notificationId) => {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!existing) {
    throw ApiError.notFound('Notification not found');
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });

  return { message: 'Xóa thông báo thành công' };
};

/**
 * System helper: Create a notification for a user
 * @param {Object} payload - { userId, type, title, body, refType, refId }
 * @returns {Promise<Object>}
 */
const createNotification = async ({ userId, type, title, body, refType, refId }) => {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body: body || null,
      refType: refType || null,
      refId: refId || null,
    },
  });
};

export default {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
};
