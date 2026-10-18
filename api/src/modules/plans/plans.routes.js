import express from 'express';
import plansController from './plans.controller.js';
import { auth } from '../../middlewares/index.js';

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

export default {
  plansRouter,
  subscriptionsRouter,
};
