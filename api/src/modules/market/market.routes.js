import { Router } from 'express';
import { auth, authorize, validate } from '../../middlewares/index.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import { StatusCodes } from 'http-status-codes';
import svc from './market.service.js';
import v from './market.validation.js';

// Cho truyen (rev8). Tach khoi /marketplace cu (schema cu) — Web goi /market.
const router = Router();
const ok = (fn, statusCode) => catchAsync(async (req, res) => ApiResponse.success(res, { ...(statusCode && { statusCode }), data: await fn(req) }));

router.get('/listings', auth, validate(v.list), ok((req) => svc.listListings(req.user, req.query)));
router.get('/listings/:listingId', auth, validate(v.one), ok((req) => svc.getListing(req.user, req.params.listingId)));
router.get('/sellers/:sellerId', auth, validate(v.seller), ok((req) => svc.getSellerProfile(req.user, req.params.sellerId)));
router.get('/owned', auth, authorize('parent'), ok(async (req) => ({ items: await svc.listOwned(req.user) })));
router.post('/checkout', auth, authorize('parent'), validate(v.checkout), ok((req) => svc.checkoutListing(req.user, req.body.listingId), StatusCodes.CREATED));

export default router;
