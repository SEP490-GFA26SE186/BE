import { Router } from 'express';
import { auth, authorize, validate } from '../../middlewares/index.js';
import topicsController from './topics.controller.js';
import topicsValidation from './topics.validation.js';

const router = Router();
const managers = [auth, authorize('moderator', 'admin')];

// Moi nguoi dung da dang nhap (phu huynh chon bai hoc khi tao truyen; Moderator thay ca bai ngung dung).
router.get('/', auth, validate(topicsValidation.list), topicsController.getTopics);
router.post('/', ...managers, validate(topicsValidation.create), topicsController.createTopic);
router.put('/:id', ...managers, validate(topicsValidation.update), topicsController.updateTopic);
router.delete('/:id', ...managers, validate(topicsValidation.remove), topicsController.deleteTopic);

export default router;
