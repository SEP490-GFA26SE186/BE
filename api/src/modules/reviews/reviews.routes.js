// Danh gia truyen (luong 4.6) — gan o /market; an danh gia (luong 7.3) — gan o /moderation.
import { Router } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { auth, authorize, validate } from '../../middlewares/index.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import svc, { REVIEW_TAGS } from './reviews.service.js';
import { REPORT_CATEGORY_LABELS } from '../monitoring/lib/monitoring.js';

const ok = (fn, statusCode) => catchAsync(async (req, res) => ApiResponse.success(res, { ...(statusCode && { statusCode }), data: await fn(req) }));
const uuid = (label) => z.string({ required_error: `Thiếu ${label}` }).uuid(`${label} không hợp lệ`);

export const reviewsRouter = Router();
reviewsRouter.get(
  '/listings/:listingId/reviews',
  auth,
  validate(z.object({ params: z.object({ listingId: uuid('listingId') }), query: z.object({ page: z.coerce.number().int().min(1).default(1) }) })),
  ok((req) => svc.listReviews(req.user, req.params.listingId, req.query)),
);
reviewsRouter.put(
  '/listings/:listingId/review',
  auth,
  authorize('parent'),
  validate(
    z.object({
      params: z.object({ listingId: uuid('listingId') }),
      body: z.object({
        rating: z.number({ required_error: 'Chọn số sao' }).int().min(1, 'Chọn từ 1 đến 5 sao').max(5, 'Chọn từ 1 đến 5 sao'),
        comment: z.string().max(1000, 'Nhận xét tối đa 1000 ký tự').optional(),
        tags: z.array(z.enum(REVIEW_TAGS)).max(REVIEW_TAGS.length).optional(),
      }),
    }),
  ),
  ok((req) => svc.upsertReview(req.user, req.params.listingId, req.body)),
);
reviewsRouter.post(
  '/reviews/:reviewId/reply',
  auth,
  authorize('parent'),
  validate(z.object({ params: z.object({ reviewId: uuid('reviewId') }), body: z.object({ reply: z.string().trim().min(2, 'Nhập nội dung trả lời').max(1000) }) })),
  ok((req) => svc.replyReview(req.user, req.params.reviewId, req.body)),
);
reviewsRouter.post(
  '/reviews/:reviewId/reports',
  auth,
  authorize('parent'),
  validate(
    z.object({
      params: z.object({ reviewId: uuid('reviewId') }),
      body: z.object({ category: z.enum(Object.keys(REPORT_CATEGORY_LABELS)), description: z.string().max(2000).optional() }),
    }),
  ),
  ok((req) => svc.reportReview(req.user, req.params.reviewId, req.body), StatusCodes.CREATED),
);

export const reviewModerationRouter = Router();
reviewModerationRouter.post(
  '/product-reviews/:reviewId/hide',
  auth,
  authorize('moderator', 'admin'),
  validate(z.object({ params: z.object({ reviewId: uuid('reviewId') }) })),
  ok((req) => svc.hideReview(req.user, req.params.reviewId)),
);
