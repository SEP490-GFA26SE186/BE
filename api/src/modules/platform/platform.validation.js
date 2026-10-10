import { z } from 'zod';

const updateSetting = z.object({
  params: z.object({
    key: z.string().trim().min(1).max(60),
  }),
  body: z.object({
    value: z.any({ required_error: 'Setting value is required' }),
  }),
});

const getAuditLogs = z.object({
  query: z.object({
    actorId: z.string().uuid('Invalid actor ID format').optional(),
    action: z.string().trim().optional(),
    targetType: z.string().trim().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
  }),
});

const getUsers = z.object({
  query: z.object({
    role: z.enum(['admin', 'moderator', 'parent']).optional(),
    isActive: z.string().optional(),
    search: z.string().trim().optional(),
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
  }),
});

const getUserById = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

const updateUserRole = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
  body: z.object({
    role: z.enum(['admin', 'moderator', 'parent'], {
      required_error: 'Role là bắt buộc (admin, moderator, parent)',
    }),
  }),
});

const updateUserStatus = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive là bắt buộc (true/false)' }),
  }),
});

// Vouchers
const getVouchers = z.object({
  query: z.object({
    isActive: z.string().optional(),
    search: z.string().trim().optional(),
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
  }),
});

const getVoucherById = z.object({
  params: z.object({
    id: z.string().uuid('Invalid voucher ID format'),
  }),
});

const createVoucher = z.object({
  body: z.object({
    code: z
      .string({ required_error: 'Mã voucher là bắt buộc' })
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/i, 'Mã voucher chỉ gồm chữ cái, số, gạch nối và gạch dưới'),
    discountType: z.enum(['percent', 'fixed'], {
      required_error: 'Loại giảm giá là bắt buộc (percent/fixed)',
    }),
    value: z.coerce.number().positive('Giá trị giảm phải lớn hơn 0'),
    maxDiscountVnd: z.coerce.number().positive().optional(),
    minOrderVnd: z.coerce.number().nonnegative().default(0),
    startsAt: z.string().datetime({ message: 'Thời gian bắt đầu startsAt không hợp lệ' }),
    endsAt: z.string().datetime({ message: 'Thời gian kết thúc endsAt không hợp lệ' }),
    usageLimit: z.coerce.number().int().positive().optional(),
    perUserLimit: z.coerce.number().int().positive().default(1),
    isActive: z.boolean().default(true),
  }).refine((data) => new Date(data.startsAt) < new Date(data.endsAt), {
    message: 'Thời gian bắt đầu startsAt phải trước thời gian kết thúc endsAt',
    path: ['endsAt'],
  }),
});

const updateVoucher = z.object({
  params: z.object({
    id: z.string().uuid('Invalid voucher ID format'),
  }),
  body: z.object({
    code: z.string().trim().min(3).max(40).optional(),
    discountType: z.enum(['percent', 'fixed']).optional(),
    value: z.coerce.number().positive().optional(),
    maxDiscountVnd: z.coerce.number().positive().nullable().optional(),
    minOrderVnd: z.coerce.number().nonnegative().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    usageLimit: z.coerce.number().int().positive().nullable().optional(),
    perUserLimit: z.coerce.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  }),
});

export default {
  updateSetting,
  getAuditLogs,
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  getVouchers,
  getVoucherById,
  createVoucher,
  updateVoucher,
};
