// Giam sat noi dung (rev8 luong 7). Bon router theo nguoi dung:
// - moderationMonitoringRouter (/moderation): bao cao, tam go, canh cao, kiem tra ngau nhien — Specialist / Admin;
// - reportRouter (/market): phu huynh bao cao truyen dang ban;
// - sellerStrikesRouter (/sellers): nguoi ban xem canh cao + khang nghi;
// - appealsAdminRouter (/admin): Admin xet khang nghi.
// Gan TRUOC router /moderation cu (ban cu ghi sai cot cua rev8, da go cac route trung).
import { Router } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { auth, authorize, validate } from '../../middlewares/index.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import svc from './monitoring.service.js';
import { REPORT_CATEGORY_LABELS } from './lib/monitoring.js';

const ok = (fn, statusCode) => catchAsync(async (req, res) => ApiResponse.success(res, { ...(statusCode && { statusCode }), data: await fn(req) }));
const uuid = (label) => z.string({ required_error: `Thiếu ${label}` }).uuid(`${label} không hợp lệ`);
const reason = (min, label) => z.string({ required_error: `Nhập ${label}` }).trim().min(min, `${label} tối thiểu ${min} ký tự`).max(2000);
const mod = [auth, authorize('specialist', 'admin')];

export const moderationMonitoringRouter = Router();

moderationMonitoringRouter.get(
  '/reports',
  ...mod,
  validate(z.object({ query: z.object({ status: z.enum(['open', 'resolved', 'dismissed', 'all']).default('open') }) })),
  ok((req) => svc.listReports(req.query)),
);
moderationMonitoringRouter.post(
  '/reports/:reportId/dismiss',
  ...mod,
  validate(z.object({ params: z.object({ reportId: uuid('reportId') }) })),
  ok((req) => svc.dismissReport(req.user, req.params.reportId)),
);

moderationMonitoringRouter.get(
  '/listings',
  ...mod,
  validate(z.object({ query: z.object({ status: z.enum(['suspended', 'archived']).default('suspended') }) })),
  ok((req) => svc.listRestrictedListings(req.query)),
);
moderationMonitoringRouter.post(
  '/listings/:listingId/suspend',
  ...mod,
  validate(z.object({ params: z.object({ listingId: uuid('listingId') }), body: z.object({ reason: reason(5, 'Lý do') }) })),
  ok((req) => svc.suspendListing(req.user, req.params.listingId, req.body)),
);

moderationMonitoringRouter.get(
  '/strikes',
  ...mod,
  validate(z.object({ query: z.object({ sellerId: uuid('sellerId').optional(), active: z.enum(['true', 'false']).optional() }) })),
  ok((req) => svc.listStrikes({ sellerId: req.query.sellerId, active: req.query.active === 'true' })),
);
moderationMonitoringRouter.post(
  '/strikes',
  ...mod,
  validate(
    z.object({
      body: z.object({
        sellerId: uuid('sellerId'),
        source: z.enum(['report', 'rejection', 'takedown']),
        sourceId: uuid('sourceId').optional(),
        reason: reason(10, 'Lý do cảnh cáo'),
      }),
    }),
  ),
  ok((req) => svc.issueStrike(req.user, req.body), StatusCodes.CREATED),
);

moderationMonitoringRouter.get(
  '/audits',
  ...mod,
  validate(z.object({ query: z.object({ open: z.enum(['true', 'false']).optional() }) })),
  ok((req) => svc.listAudits({ open: req.query.open === undefined ? undefined : req.query.open === 'true' })),
);
moderationMonitoringRouter.post(
  '/audits/run',
  ...mod,
  validate(z.object({ body: z.object({ count: z.number().int().min(1).max(20).optional() }).default({}) })),
  ok((req) => svc.runRandomAudits(req.user, req.body), StatusCodes.CREATED),
);

moderationMonitoringRouter.get(
  '/ai-flags',
  ...mod,
  validate(z.object({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7), min: z.coerce.number().int().min(1).max(100).default(2) }) })),
  ok((req) => svc.listAiFlags(req.query)),
);
moderationMonitoringRouter.post(
  '/ai-flags/:userId/block',
  ...mod,
  validate(
    z.object({
      params: z.object({ userId: uuid('userId') }),
      body: z.object({ days: z.number().int().min(0, '0 = mở khoá').max(90), reason: z.string().max(2000).optional() }),
    }),
  ),
  ok((req) => svc.setAiBlock(req.user, req.params.userId, req.body)),
);

export const reportRouter = Router();
reportRouter.get('/report-categories', auth, ok(async () => ({ categories: Object.entries(REPORT_CATEGORY_LABELS).map(([value, label]) => ({ value, label })) })));
reportRouter.post(
  '/listings/:listingId/reports',
  auth,
  authorize('parent'),
  validate(
    z.object({
      params: z.object({ listingId: uuid('listingId') }),
      body: z.object({
        category: z.enum(Object.keys(REPORT_CATEGORY_LABELS), { errorMap: () => ({ message: 'Chọn loại vi phạm' }) }),
        description: z.string().max(2000).optional(),
        pageId: uuid('pageId').optional(),
      }),
    }),
  ),
  ok((req) => svc.createReport(req.user, req.params.listingId, req.body), StatusCodes.CREATED),
);

export const sellerStrikesRouter = Router();
sellerStrikesRouter.get('/me/strikes', auth, authorize('parent'), ok((req) => svc.listMyStrikes(req.user)));
sellerStrikesRouter.post(
  '/me/strikes/:strikeId/appeal',
  auth,
  authorize('parent'),
  validate(z.object({ params: z.object({ strikeId: uuid('strikeId') }), body: z.object({ reason: reason(20, 'Lý do kháng nghị') }) })),
  ok((req) => svc.appealStrike(req.user, req.params.strikeId, req.body), StatusCodes.CREATED),
);

export const appealsAdminRouter = Router();
appealsAdminRouter.get(
  '/appeals',
  auth,
  authorize('admin'),
  validate(z.object({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') }) })),
  ok((req) => svc.listAppeals(req.query)),
);
appealsAdminRouter.post(
  '/appeals/:appealId/decision',
  auth,
  authorize('admin'),
  validate(z.object({ params: z.object({ appealId: uuid('appealId') }), body: z.object({ approve: z.boolean(), note: z.string().max(2000).optional() }) })),
  ok((req) => svc.decideAppeal(req.user, req.params.appealId, req.body)),
);
