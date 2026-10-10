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

// Admin User Management (Admin only)
router.get(
  '/users',
  ...requireAdmin,
  validate(platformValidation.getUsers),
  platformController.getUsers
);

router.get(
  '/users/:id',
  ...requireAdmin,
  validate(platformValidation.getUserById),
  platformController.getUserById
);

router.put(
  '/users/:id/role',
  ...requireAdmin,
  validate(platformValidation.updateUserRole),
  platformController.updateUserRole
);

router.put(
  '/users/:id/status',
  ...requireAdmin,
  validate(platformValidation.updateUserStatus),
  platformController.updateUserStatus
);

// Admin Voucher Management (Admin only)
router.get(
  '/vouchers',
  ...requireAdmin,
  validate(platformValidation.getVouchers),
  platformController.getVouchers
);

router.get(
  '/vouchers/:id',
  ...requireAdmin,
  validate(platformValidation.getVoucherById),
  platformController.getVoucherById
);

router.post(
  '/vouchers',
  ...requireAdmin,
  validate(platformValidation.createVoucher),
  platformController.createVoucher
);

router.put(
  '/vouchers/:id',
  ...requireAdmin,
  validate(platformValidation.updateVoucher),
  platformController.updateVoucher
);

router.delete(
  '/vouchers/:id',
  ...requireAdmin,
  validate(platformValidation.getVoucherById),
  platformController.deleteVoucher
);

export default router;
