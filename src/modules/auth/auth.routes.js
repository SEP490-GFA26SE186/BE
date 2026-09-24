import express from 'express';
import authController from './auth.controller.js';
import authValidation from './auth.validation.js';
import { validate } from '../../middlewares/index.js';

const router = express.Router();

router.post('/register', validate(authValidation.register), authController.register);

export default router;
