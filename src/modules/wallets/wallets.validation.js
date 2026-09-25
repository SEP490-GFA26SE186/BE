import { z } from 'zod';

const grantCreditsSchema = z.object({
  body: z.object({
    userId: z.string().uuid('Invalid user ID format'),
    credits: z
      .number({ required_error: 'Credits amount is required' })
      .int('Credits must be an integer')
      .positive('Credits must be greater than 0'),
    reason: z.string().max(200, 'Reason cannot exceed 200 characters').optional(),
  }),
});

const requestWithdrawalSchema = z.object({
  body: z.object({
    amountVnd: z
      .number({ required_error: 'Withdrawal amount in VND is required' })
      .int('Amount must be an integer')
      .min(50000, 'Minimum withdrawal amount is 50,000 VND'),
  }),
});

const processWithdrawalSchema = z.object({
  body: z
    .object({
      status: z.enum(['paid', 'rejected'], {
        required_error: 'Decision status must be either paid or rejected',
      }),
      bankTransactionRef: z
        .string()
        .max(100, 'Bank transaction reference cannot exceed 100 characters')
        .optional(),
      rejectReason: z.string().min(5, 'Reject reason must be at least 5 characters').optional(),
    })
    .refine((data) => (data.status === 'paid' ? !!data.bankTransactionRef : true), {
      message: 'Bank transaction reference is required when approving a withdrawal',
      path: ['bankTransactionRef'],
    })
    .refine((data) => (data.status === 'rejected' ? !!data.rejectReason : true), {
      message: 'Reject reason is required when rejecting a withdrawal',
      path: ['rejectReason'],
    }),
});

const getLedgerQuerySchema = z.object({
  query: z.object({
    walletType: z.enum(['credit', 'earning']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const getWithdrawalsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['requested', 'paid', 'rejected', 'cancelled']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export default {
  grantCreditsSchema,
  requestWithdrawalSchema,
  processWithdrawalSchema,
  getLedgerQuerySchema,
  getWithdrawalsQuerySchema,
};
