import express from 'express';
import * as ordersController from './orders.controller.js';
import ordersValidation from './orders.validation.js';
import { auth, validate } from '../../middlewares/index.js';

export const cartRouter = express.Router();
export const ordersRouter = express.Router();
export const entitlementsRouter = express.Router();

// =============================================================================
// CART ROUTES (/api/v1/cart)
// =============================================================================

cartRouter
  .route('/')
  .get(auth, ordersController.getCart)
  .post(auth, validate(ordersValidation.addToCart), ordersController.addToCart)
  .delete(auth, ordersController.clearCart);

cartRouter
  .route('/:listingId')
  .delete(auth, validate(ordersValidation.removeFromCart), ordersController.removeFromCart);

// =============================================================================
// ORDER ROUTES (/api/v1/orders)
// =============================================================================

ordersRouter
  .route('/')
  .post(auth, validate(ordersValidation.createOrder), ordersController.createOrder);

ordersRouter
  .route('/me')
  .get(auth, validate(ordersValidation.getMyOrders), ordersController.getMyOrders);

ordersRouter
  .route('/:id')
  .get(auth, validate(ordersValidation.getOrder), ordersController.getOrderById);

ordersRouter
  .route('/:id/cancel')
  .post(auth, validate(ordersValidation.cancelOrder), ordersController.cancelOrder);

// =============================================================================
// ENTITLEMENT ROUTES (/api/v1/entitlements)
// =============================================================================

entitlementsRouter
  .route('/me')
  .get(auth, ordersController.getMyEntitlements);

entitlementsRouter
  .route('/:id/personalize')
  .post(auth, validate(ordersValidation.personalizeEntitlement), ordersController.personalizeEntitlement);

export default ordersRouter;
