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

// ---- Mat khau ----
router.post('/forgot-password', validate(authValidation.forgotPassword), authController.forgotPassword);
router.post('/reset-password', validate(authValidation.resetPassword), authController.resetPassword);
router.put('/change-password', auth, validate(authValidation.changePassword), authController.changePassword);

// ---- Kid PIN & Kid Mode Session ----
router.post('/kid-pin/set', auth, validate(authValidation.setKidPin), authController.setKidPin);
router.put('/kid-pin/change', auth, validate(authValidation.changeKidPin), authController.changeKidPin);
router.post('/kid-mode/enter', auth, validate(authValidation.enterKidMode), authController.enterKidMode);
router.post('/kid-mode/exit', validate(authValidation.exitKidMode), authController.exitKidMode);

// ---- Email Verification ----
// Phai dang nhap: chi gui ma toi email cua chinh tai khoan, khong nhan email tuy y
router.post('/send-verification-email', auth, authController.sendVerificationEmail);
// Phai dang nhap: ma chi xac thuc dung tai khoan dang dang nhap (ma cua tai khoan khac -> 400)
router.post('/verify-email', auth, validate(authValidation.verifyEmail), authController.verifyEmail);

export default router;
