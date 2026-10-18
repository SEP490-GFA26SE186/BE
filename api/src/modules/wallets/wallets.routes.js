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

// Rut tien nguoi ban: da chuyen sang /sellers/me/withdrawals + /admin/withdrawals (chi ho payOS,
// src/modules/market/withdrawals.*). Route cu o day bo de chi con mot duong rut tien.

export default router;
