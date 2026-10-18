import { z } from 'zod';

const subscribeFreeSchema = z.object({
  body: z.object({
    planId: z.string().uuid('Invalid plan ID format').optional(),
  }),
});

export default {
  subscribeFreeSchema,
};
