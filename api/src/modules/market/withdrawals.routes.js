import { Router } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { auth, authorize, validate } from '../../middlewares/index.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';
import svc from './withdrawals.service.js';

const ok = (fn, statusCode) => catchAsync(async (req, res) => ApiResponse.success(res, { ...(statusCode && { statusCode }), data: await fn(req) }));
const id = z.object({ params: z.object({ id: z.string().uuid() }) });

// Nguoi ban: tai khoan nhan tien, doanh thu, rut tien. Gan vao /sellers (cung router ho so ban).
export const sellerMoneyRouter = Router();
const seller = [auth, authorize('parent')];
sellerMoneyRouter.get('/me/earnings', ...seller, ok((req) => svc.getEarnings(req.user)));
sellerMoneyRouter.put(
  '/me/bank',
  ...seller,
  validate(z.object({
    body: z.object({
      bankBin: z.string().regex(/^\d{6}$/, 'Mã BIN ngân hàng gồm 6 số'),
      bankName: z.string().trim().min(2).max(100),
      accountNumber: z.string().regex(/^[0-9A-Za-z]{4,30}$/, 'Số tài khoản không hợp lệ'),
      accountHolder: z.string().trim().min(2).max(150),
    }),
  })),
  ok((req) => svc.updateBank(req.user, req.body)),
);
sellerMoneyRouter.post(
  '/me/withdrawals',
  ...seller,
  validate(z.object({ body: z.object({ amountVnd: z.number().int().positive() }) })),
  ok((req) => svc.requestWithdrawal(req.user, req.body), StatusCodes.CREATED),
);
sellerMoneyRouter.delete('/me/withdrawals/:id', ...seller, validate(id), ok((req) => svc.cancelWithdrawal(req.user, req.params.id)));

// Admin: chuyen khoan tay roi danh dau da chuyen / tu choi. Gan vao /admin TRUOC router platform cu (duong dan khong trung).
export const adminWithdrawalsRouter = Router();
const admin = [auth, authorize('admin')];
adminWithdrawalsRouter.get(
  '/withdrawals',
  ...admin,
  validate(z.object({ query: z.object({ status: z.enum(['requested', 'processing', 'paid', 'rejected', 'cancelled']).default('requested') }) })),
  ok(async (req) => ({ withdrawals: await svc.listWithdrawals(req.query) })),
);
adminWithdrawalsRouter.post(
  '/withdrawals/:id/mark-paid',
  ...admin,
  validate(z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ bankTransactionRef: z.string().trim().max(100).optional() }).optional() })),
  ok((req) => svc.markWithdrawalPaid(req.user, req.params.id, req.body)),
);
adminWithdrawalsRouter.post(
  '/withdrawals/:id/reject',
  ...admin,
  validate(z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ reason: z.string().trim().min(3, 'Ghi lý do từ chối').max(500) }) })),
  ok((req) => svc.rejectWithdrawal(req.user, req.params.id, req.body)),
);
