import { Router } from 'express';
import { auth } from '../../middlewares/index.js';
import topicsController from './topics.controller.js';

const router = Router();

// Moi nguoi dung da dang nhap (phu huynh chon bai hoc khi tao truyen).
router.get('/', auth, topicsController.getTopics);

export default router;
