import { Router } from 'express';
import notificationsController from './notifications.controller.js';
import notificationsValidation from './notifications.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = Router();

// All notifications endpoints require authentication
router.use(auth);

router.get('/', validate(notificationsValidation.getNotifications), notificationsController.getNotifications);
router.get('/unread-count', notificationsController.getUnreadCount);
router.patch('/read-all', notificationsController.markAllAsRead);
router.patch('/:id/read', validate(notificationsValidation.markAsRead), notificationsController.markAsRead);
router.delete('/:id', validate(notificationsValidation.deleteNotification), notificationsController.deleteNotification);

export default router;
