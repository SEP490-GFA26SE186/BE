import notificationsService from './notifications.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const getNotifications = catchAsync(async (req, res) => {
  const result = await notificationsService.getNotifications(req.user.id, req.query);
  ApiResponse.success(res, result, 'Lấy danh sách thông báo thành công');
});

const getUnreadCount = catchAsync(async (req, res) => {
  const result = await notificationsService.getUnreadCount(req.user.id);
  ApiResponse.success(res, result, 'Lấy số lượng thông báo chưa đọc thành công');
});

const markAsRead = catchAsync(async (req, res) => {
  const notification = await notificationsService.markAsRead(req.user.id, req.params.id);
  ApiResponse.success(res, notification, 'Đánh dấu đã đọc thành công');
});

const markAllAsRead = catchAsync(async (req, res) => {
  const result = await notificationsService.markAllAsRead(req.user.id);
  ApiResponse.success(res, result, result.message);
});

const deleteNotification = catchAsync(async (req, res) => {
  const result = await notificationsService.deleteNotification(req.user.id, req.params.id);
  ApiResponse.success(res, result, result.message);
});

export default {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
