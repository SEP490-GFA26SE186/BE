import { z } from 'zod';

const getChildEqReport = z.object({
  params: z.object({
    childId: z.string().uuid('Invalid child ID format'),
  }),
  query: z.object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be formatted as YYYY-MM-DD')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be formatted as YYYY-MM-DD')
      .optional(),
  }),
});

export default {
  getChildEqReport,
};
