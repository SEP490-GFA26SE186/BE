import { Router } from 'express';
import reportsController from './reports.controller.js';
import reportsValidation from './reports.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const router = Router();

// EQ report for child - Parents can view their child's report
router.get(
  '/eq/children/:childId',
  auth,
  validate(reportsValidation.getChildEqReport),
  reportsController.getChildEqReport
);

// Platform supervision overview - Moderator or Admin
router.get(
  '/platform/overview',
  auth,
  authorize('admin', 'moderator'),
  reportsController.getPlatformOverview
);

export default router;
