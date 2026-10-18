import { Router } from 'express';
import { auth, authorize, validate } from '../../middlewares/index.js';
import billingController from './billing.controller.js';
import billingValidation from './billing.validation.js';

const router = Router();

// payOS goi (khong token). Xac thuc bang chu ky trong body (SDK webhooks.verify).
router.post('/payos/webhook', billingController.payosWebhook);

router.post('/plans/checkout', auth, authorize('parent'), validate(billingValidation.checkoutPlan), billingController.checkoutPlan);
router.get('/orders/:orderId', auth, validate(billingValidation.getOrder), billingController.getOrder);

export default router;
