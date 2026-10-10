import { Router } from 'express';
import topicsController from './topics.controller.js';
import topicsValidation from './topics.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const router = Router();
const requireStaff = [auth, authorize('moderator', 'admin')];

// Public / Authenticated user can read topics
router.get('/', validate(topicsValidation.getTopics), topicsController.getTopics);
router.get('/:id', validate(topicsValidation.getTopicById), topicsController.getTopicById);

// Moderator & Admin can create, update, delete topics
router.post(
  '/',
  ...requireStaff,
  validate(topicsValidation.createTopic),
  topicsController.createTopic
);

router.put(
  '/:id',
  ...requireStaff,
  validate(topicsValidation.updateTopic),
  topicsController.updateTopic
);

router.delete(
  '/:id',
  ...requireStaff,
  validate(topicsValidation.getTopicById),
  topicsController.deleteTopic
);

export default router;
