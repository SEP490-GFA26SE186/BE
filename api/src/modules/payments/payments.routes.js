import { Router } from 'express';
import paymentsController from './payments.controller.js';

const router = Router();

// Goi tu payOS, khong co JWT: xac thuc bang chu ky HMAC trong body
router.post('/payos/webhook', paymentsController.payosWebhook);

export default router;
