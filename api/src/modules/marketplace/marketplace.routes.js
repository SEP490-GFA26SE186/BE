import { Router } from 'express';
import marketplaceController from './marketplace.controller.js';
import marketplaceValidation from './marketplace.validation.js';
import { auth, validate } from '../../middlewares/index.js';

const router = Router();

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------
router.get('/price-tiers', marketplaceController.getPriceTiers);
router.get(
  '/listings',
  validate(marketplaceValidation.getListings),
  marketplaceController.getListings,
);
router.get(
  '/listings/:id',
  validate(marketplaceValidation.getListing),
  marketplaceController.getListingById,
);
router.get(
  '/listings/:id/reviews',
  validate(marketplaceValidation.getListing),
  marketplaceController.getListingReviews,
);

// ---------------------------------------------------------------------------
// Authenticated Parent & Author endpoints
// ---------------------------------------------------------------------------
router.post(
  '/seller/register',
  auth,
  validate(marketplaceValidation.registerSeller),
  marketplaceController.registerSeller,
);
router.get('/seller/me', auth, marketplaceController.getMySellerProfile);
router.put(
  '/seller/me',
  auth,
  validate(marketplaceValidation.updateSeller),
  marketplaceController.updateSellerProfile,
);
router.get('/seller/my-listings', auth, marketplaceController.getMyListings);

router.post(
  '/listings',
  auth,
  validate(marketplaceValidation.createListing),
  marketplaceController.createListing,
);
router.post(
  '/listings/:id/claim-free',
  auth,
  validate(marketplaceValidation.claimFreeListing),
  marketplaceController.claimFreeListing,
);
router.post(
  '/listings/:id/reviews',
  auth,
  validate(marketplaceValidation.createReview),
  marketplaceController.createReview,
);
router.post(
  '/reviews/:reviewId/reply',
  auth,
  validate(marketplaceValidation.replyReview),
  marketplaceController.replyReview,
);

export default router;
