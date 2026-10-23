import { Router } from 'express';
import { auth, authorize, validate } from '../../middlewares/index.js';
import c from './publishing.controller.js';
import v from './publishing.validation.js';

// rev8 luong 3: nguoi ban + dang ban (/sellers, /listings) va kiem duyet (/moderation/...).
export const sellersRouter = Router();
sellersRouter.get('/me', auth, authorize('parent'), c.getMySeller);
sellersRouter.post('/apply', auth, authorize('parent'), validate(v.applySeller), c.applySeller);

export const listingsRouter = Router();
listingsRouter.get('/mine', auth, authorize('parent'), c.getMyListings);
listingsRouter.post('/', auth, authorize('parent'), validate(v.createListing), c.createListing);

// Gan TRUOC router /moderation cu (keywords / reports giu lai cho Phase 5); duong dan khong trung.
export const moderationReviewRouter = Router();
const mod = [auth, authorize('specialist', 'admin')];
moderationReviewRouter.get('/sellers', ...mod, validate(v.sellerList), c.listSellerApplications);
moderationReviewRouter.post('/sellers/:userId/decision', ...mod, validate(v.sellerDecision), c.decideSeller);
moderationReviewRouter.get('/submissions', ...mod, c.getQueue);
moderationReviewRouter.post('/submissions/:reviewId/claim', ...mod, validate(v.review), c.claimReview);
moderationReviewRouter.get('/submissions/:reviewId', ...mod, validate(v.review), c.getReview);
moderationReviewRouter.post('/submissions/:reviewId/pages/:pageId/view', ...mod, validate(v.viewPage), c.viewPage);
moderationReviewRouter.post('/submissions/:reviewId/decision', ...mod, validate(v.decide), c.decide);
