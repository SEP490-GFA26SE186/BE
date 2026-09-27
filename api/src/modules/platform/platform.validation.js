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

export default {
  updateSetting,
  getAuditLogs,
};
