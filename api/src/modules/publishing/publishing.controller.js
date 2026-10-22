import { StatusCodes } from 'http-status-codes';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import svc from './publishing.service.js';

const ok = (fn, statusCode) => catchAsync(async (req, res) => ApiResponse.success(res, { ...(statusCode && { statusCode }), data: await fn(req) }));

export default {
  getMySeller: ok((req) => svc.getMySeller(req.user)),
  applySeller: ok((req) => svc.applySeller(req.user, req.body), StatusCodes.CREATED),
  listSellerApplications: ok(async (req) => ({ sellers: await svc.listSellerApplications(req.query) })),
  decideSeller: ok((req) => svc.decideSeller(req.user, req.params.userId, req.body)),
  createListing: ok((req) => svc.createListing(req.user, req.body), StatusCodes.CREATED),
  getMyListings: ok(async (req) => ({ listings: await svc.getMyListings(req.user) })),
  getQueue: ok(async (req) => ({ queue: await svc.getQueue(req.user) })),
  claimReview: ok((req) => svc.claimReview(req.user, req.params.reviewId)),
  getReview: ok((req) => svc.getReview(req.user, req.params.reviewId)),
  viewPage: ok((req) => svc.viewPage(req.user, req.params.reviewId, req.params.pageId, req.body)),
  decide: ok((req) => svc.decide(req.user, req.params.reviewId, req.body)),
};
