import { Router } from 'express';
import readingSessionsController from './reading-sessions.controller.js';
import readingSessionsValidation from './reading-sessions.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = Router();

// All reading session routes require authentication (parent, kid session, moderator, admin)
router.use(auth);

router.post(
  '/start',
  validate(readingSessionsValidation.startSession),
  readingSessionsController.startSession,
);
router.get(
  '/:sessionId',
  validate(readingSessionsValidation.getSession),
  readingSessionsController.getSession,
);
router.post(
  '/:sessionId/choice',
  validate(readingSessionsValidation.submitChoice),
  readingSessionsController.submitChoice,
);
router.post(
  '/:sessionId/complete',
  validate(readingSessionsValidation.completeSession),
  readingSessionsController.completeSession,
);
router.get(
  '/child/:childId/history',
  validate(readingSessionsValidation.getChildHistory),
  readingSessionsController.getChildHistory,
);

export default router;
