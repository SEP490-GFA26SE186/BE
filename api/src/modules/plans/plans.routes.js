import express from 'express';
import plansController from './plans.controller.js';
import plansValidation from './plans.validation.js';
import { auth, authorize, validate } from '../../middlewares/index.js';

export const plansRouter = express.Router();
export const creditPacksRouter = express.Router();
export const subscriptionsRouter = express.Router();

// ==========================================
// Plans Routes (/api/v1/plans)
// ==========================================

plansRouter
  .route('/')
  .get(plansController.getPlans)
  .post(auth, authorize('admin'), validate(plansValidation.createPlanSchema), plansController.createPlan);

plansRouter
  .route('/:id')
  .get(plansController.getPlanById)
  .put(auth, authorize('admin'), validate(plansValidation.updatePlanSchema), plansController.updatePlan)
  .delete(auth, authorize('admin'), plansController.deletePlan);

// ==========================================
// Credit Packs Routes (/api/v1/credit-packs)
// ==========================================

creditPacksRouter
  .route('/')
  .get(plansController.getCreditPacks)
  .post(
    auth,
    authorize('admin'),
    validate(plansValidation.createCreditPackSchema),
    plansController.createCreditPack
  );

creditPacksRouter
  .route('/:id')
  .get(plansController.getCreditPackById)
  .put(
    auth,
    authorize('admin'),
    validate(plansValidation.updateCreditPackSchema),
    plansController.updateCreditPack
  );
creditPacksRouter.delete('/:id', auth, authorize('admin'), plansController.deleteCreditPack);

// ==========================================
// Subscriptions Routes (/api/v1/subscriptions)
// ==========================================

subscriptionsRouter.get('/me', auth, plansController.getMySubscription);
subscriptionsRouter.post(
  '/subscribe-free',
  auth,
  validate(plansValidation.subscribeFreeSchema),
  plansController.subscribeFreePlan
);
subscriptionsRouter.post('/cancel', auth, plansController.cancelMySubscription);
subscriptionsRouter.get('/admin/all', auth, authorize('admin'), plansController.getAllSubscriptions);

export default {
  plansRouter,
  creditPacksRouter,
  subscriptionsRouter,
};
