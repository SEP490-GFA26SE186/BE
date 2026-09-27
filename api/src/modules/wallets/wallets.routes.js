import express from 'express';
import walletsController from './wallets.controller.js';
import walletsValidation from './wallets.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

const router = express.Router();

// ==========================================
// User Wallet & Ledger
// ==========================================

router.get('/me', auth, walletsController.getMyWallet);
router.get('/ledger', auth, validate(walletsValidation.getLedgerQuerySchema), walletsController.getMyLedger);

// ==========================================
// Admin Credit Management
// ==========================================

router.post(
  '/admin/grant-credits',
  auth,
  authorize('admin'),
  validate(walletsValidation.grantCreditsSchema),
  walletsController.adminGrantCredits
);

// ==========================================
// Seller Payout Withdrawals
// ==========================================

router.post(
  '/withdrawals',
  auth,
  validate(walletsValidation.requestWithdrawalSchema),
  walletsController.requestWithdrawal
);
router.get(
  '/withdrawals/me',
  auth,
  validate(walletsValidation.getWithdrawalsQuerySchema),
  walletsController.getMyWithdrawals
);
router.delete('/withdrawals/:id/cancel', auth, walletsController.cancelMyWithdrawal);

// ==========================================
// Admin Withdrawal Review & Processing
// ==========================================

router.get(
  '/admin/withdrawals',
  auth,
  authorize('admin'),
  validate(walletsValidation.getWithdrawalsQuerySchema),
  walletsController.getAdminWithdrawals
);
router.post(
  '/admin/withdrawals/:id/process',
  auth,
  authorize('admin'),
  validate(walletsValidation.processWithdrawalSchema),
  walletsController.processWithdrawal
);

export default router;
