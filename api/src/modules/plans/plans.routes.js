import express from 'express';
import plansController from './plans.controller.js';
import plansValidation from './plans.validation.js';
import { auth, validate } from '../../middlewares/index.js';

export const plansRouter = express.Router();
export const subscriptionsRouter = express.Router();

// ==========================================
// Plans Routes (/api/v1/plans)
// ==========================================

// Danh sach goi cong khai. Admin sua goi o /admin/plans (modules/admin).
plansRouter.get('/', plansController.getPlans);
plansRouter.get('/:id', plansController.getPlanById);

// ==========================================
// Subscriptions Routes (/api/v1/subscriptions)
// ==========================================

subscriptionsRouter.get('/me', auth, plansController.getMySubscription);
// Goi Mien phi: tu co khi dang ky; doi goi qua POST /payments/plans/checkout (goi 0d kich hoat ngay).
subscriptionsRouter.post(
  '/subscribe-free',
  auth,
  validate(plansValidation.subscribeFreeSchema),
  plansController.subscribeFreePlan
);
subscriptionsRouter.post('/cancel', auth, plansController.cancelMySubscription);

export default {
  plansRouter,
  subscriptionsRouter,
};
