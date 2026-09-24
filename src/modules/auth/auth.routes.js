import express from 'express';
import authController from './auth.controller.js';
import authValidation from './auth.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = express.Router();

router.post('/register', validate(authValidation.register), authController.register);
router.post('/login', validate(authValidation.login), authController.login);
router.post('/refresh-tokens', validate(authValidation.refreshTokens), authController.refreshTokens);
router.post('/logout', validate(authValidation.logout), authController.logout);
router.get('/me', auth, authController.getMe);

export default router;
