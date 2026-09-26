import { Router } from 'express';
import platformController from './platform.controller.js';
import platformValidation from './platform.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const router = Router();
const requireAdmin = [auth, authorize('admin')];

// Platform Settings (Admin only)
router.get('/settings', ...requireAdmin, platformController.getSettings);
router.get('/settings/:key', ...requireAdmin, platformController.getSettingByKey);
router.put(
  '/settings/:key',
  ...requireAdmin,
  validate(platformValidation.updateSetting),
  platformController.updateSetting
);

// Admin Audit Logs (Admin only)
router.get(
  '/audit-logs',
  ...requireAdmin,
  validate(platformValidation.getAuditLogs),
  platformController.getAuditLogs
);

export default router;
