// Quan tri (rev8) — chi Admin. Gan o /admin (cung mount voi rut tien + khang nghi).
import { Router } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { auth, authorize, validate } from '../../middlewares/index.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import admin from './admin.service.js';
import finance from './finance.service.js';
import refunds from '../refunds/refunds.service.js';

const router = Router();
const ok = (fn, statusCode) => catchAsync(async (req, res) => ApiResponse.success(res, { ...(statusCode && { statusCode }), data: await fn(req) }));
const only = [auth, authorize('admin')];
const uuid = (label) => z.string({ required_error: `Thiếu ${label}` }).uuid(`${label} không hợp lệ`);
const page = z.coerce.number().int().min(1).default(1);
const money = z.number({ invalid_type_error: 'Giá phải là số' }).int('Giá là số nguyên (đồng)').min(0).max(100_000_000);

router.get('/overview', ...only, ok(() => admin.overview()));

// Tai khoan
router.get(
  '/accounts',
  ...only,
  validate(z.object({ query: z.object({ role: z.enum(['all', 'parent', 'specialist', 'admin']).default('all'), status: z.enum(['all', 'active', 'locked']).default('all'), search: z.string().max(100).optional(), page, limit: z.coerce.number().int().min(1).max(100).default(20) }) })),
  ok((req) => admin.listAccounts(req.query)),
);
router.patch(
  '/accounts/:userId',
  ...only,
  validate(z.object({ params: z.object({ userId: uuid('userId') }), body: z.object({ isActive: z.boolean() }) })),
  ok((req) => admin.setAccountActive(req.user, req.params.userId, req.body.isActive)),
);
router.post(
  '/accounts/moderators',
  ...only,
  validate(
    z.object({
      body: z.object({
        email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
        username: z.string().trim().min(3, 'Tên đăng nhập tối thiểu 3 ký tự').max(50).regex(/^[a-zA-Z0-9_.]+$/, 'Tên đăng nhập chỉ gồm chữ, số, dấu _ và .'),
        fullName: z.string().trim().min(2, 'Nhập họ tên').max(150),
        password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100),
      }),
    }),
  ),
  ok((req) => admin.createModerator(req.user, req.body), StatusCodes.CREATED),
);

// Goi + bac gia
const planFields = {
  name: z.string().trim().min(2).max(100),
  priceVnd: money,
  creditsPerMonth: z.number().int().min(0).max(10_000),
  maxChildren: z.number().int().min(1).max(20),
  maxCharacters: z.number().int().min(1).max(200),
  canSell: z.boolean(),
  isActive: z.boolean(),
};
router.get('/plans', ...only, ok(() => admin.listAdminPlans()));
router.post(
  '/plans',
  ...only,
  validate(
    z.object({
      body: z.object({
        ...planFields,
        code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, 'Mã gói gồm chữ in hoa, số, dấu _'),
        durationMonths: z.union([z.literal(1), z.literal(12)], { errorMap: () => ({ message: 'Gói tháng (1) hoặc năm (12)' }) }),
        canSell: z.boolean().default(false),
        isActive: z.boolean().default(true),
      }),
    }),
  ),
  ok((req) => admin.createPlan(req.user, req.body), StatusCodes.CREATED),
);
router.put(
  '/plans/:planId',
  ...only,
  validate(z.object({ params: z.object({ planId: uuid('planId') }), body: z.object(Object.fromEntries(Object.entries(planFields).map(([k, v]) => [k, v.optional()]))).refine((b) => Object.keys(b).length > 0, 'Không có gì để sửa') })),
  ok((req) => admin.updatePlan(req.user, req.params.planId, req.body)),
);
router.get('/price-tiers', ...only, ok(() => admin.listPriceTiers()));
router.post(
  '/price-tiers',
  ...only,
  validate(z.object({ body: z.object({ label: z.string().trim().min(1).max(50), priceVnd: money }) })),
  ok((req) => admin.createPriceTier(req.user, req.body), StatusCodes.CREATED),
);
router.put(
  '/price-tiers/:tierId',
  ...only,
  validate(z.object({ params: z.object({ tierId: uuid('tierId') }), body: z.object({ label: z.string().trim().min(1).max(50).optional(), priceVnd: money.optional(), isActive: z.boolean().optional() }) })),
  ok((req) => admin.updatePriceTier(req.user, req.params.tierId, req.body)),
);

// Cau hinh
router.get('/settings', ...only, ok(() => admin.getSettings()));
router.put(
  '/settings/:key',
  ...only,
  validate(z.object({ params: z.object({ key: z.string().max(60) }), body: z.object({ value: z.number({ invalid_type_error: 'Giá trị phải là số' }) }) })),
  ok((req) => admin.updateSetting(req.user, req.params.key, req.body.value)),
);

// Hoan tien
router.get(
  '/refunds',
  ...only,
  validate(z.object({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') }) })),
  ok((req) => refunds.listRefunds(req.query)),
);
router.post(
  '/refunds/:refundId/decision',
  ...only,
  validate(z.object({ params: z.object({ refundId: uuid('refundId') }), body: z.object({ approve: z.boolean(), bankTransactionRef: z.string().max(100).optional(), note: z.string().max(2000).optional() }) })),
  ok((req) => refunds.decideRefund(req.user, req.params.refundId, req.body)),
);

// Tai chinh
router.get(
  '/finance/summary',
  ...only,
  validate(z.object({ query: z.object({ range: z.enum(['today', '7d', '30d', '90d', 'year']).default('30d') }) })),
  ok((req) => finance.summary(req.query)),
);
router.get('/finance/reconciliation', ...only, ok(() => finance.reconciliation()));
router.post('/finance/reconciliation/fix-counters', ...only, ok((req) => finance.fixCounters(req.user)));

// Nhat ky
router.get(
  '/audit-logs',
  ...only,
  validate(z.object({ query: z.object({ action: z.string().max(40).optional(), page, limit: z.coerce.number().int().min(1).max(100).default(30) }) })),
  ok((req) => admin.listAuditLogs(req.query)),
);

export default router;

// Phu huynh: lich su thanh toan + yeu cau hoan tien (gan o /payments).
export const parentRefundRouter = Router();
parentRefundRouter.get('/orders', auth, authorize('parent'), ok((req) => refunds.listMyOrders(req.user)));
parentRefundRouter.post(
  '/order-items/:itemId/refund',
  auth,
  authorize('parent'),
  validate(z.object({ params: z.object({ itemId: uuid('itemId') }), body: z.object({ reason: z.string({ required_error: 'Nhập lý do' }).trim().min(10, 'Lý do tối thiểu 10 ký tự').max(2000) }) })),
  ok((req) => refunds.requestRefund(req.user, req.params.itemId, req.body), StatusCodes.CREATED),
);
