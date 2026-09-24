import express from 'express';
import authController from './auth.controller.js';
import authValidation from './auth.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = express.Router();

// ---- Standard Auth ----
router.post('/register', validate(authValidation.register), authController.register);
router.post('/login', validate(authValidation.login), authController.login);
router.post('/refresh-tokens', validate(authValidation.refreshTokens), authController.refreshTokens);
router.post('/logout', validate(authValidation.logout), authController.logout);
router.get('/me', auth, authController.getMe);

// ---- Kid PIN & Kid Mode Session ----
router.post('/kid-pin/set', auth, validate(authValidation.setKidPin), authController.setKidPin);
router.put('/kid-pin/change', auth, validate(authValidation.changeKidPin), authController.changeKidPin);
router.post('/kid-mode/enter', auth, validate(authValidation.enterKidMode), authController.enterKidMode);
router.post('/kid-mode/exit', validate(authValidation.exitKidMode), authController.exitKidMode);

// ---- Email Verification ----
router.post(
  '/send-verification-email',
  validate(authValidation.sendVerificationEmail),
  authController.sendVerificationEmail,
);
router.post('/verify-email', validate(authValidation.verifyEmail), authController.verifyEmail);
router.get('/verify-email', validate(authValidation.verifyEmail), authController.verifyEmail);

export default router;
