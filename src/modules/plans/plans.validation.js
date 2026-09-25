import { z } from 'zod';

const createPlanSchema = z.object({
  body: z.object({
    code: z
      .string({ required_error: 'Plan code is required' })
      .min(2, 'Plan code must be at least 2 characters')
      .max(40, 'Plan code cannot exceed 40 characters')
      .regex(/^[A-Z0-9_-]+$/, 'Plan code must contain only uppercase letters, numbers, hyphens, and underscores'),
    name: z
      .string({ required_error: 'Plan name is required' })
      .min(2, 'Plan name must be at least 2 characters')
      .max(100, 'Plan name cannot exceed 100 characters'),
    period: z.enum(['month', 'year'], {
      required_error: 'Plan period is required and must be either month or year',
    }),
    priceVnd: z
      .number({ required_error: 'Price in VND is required' })
      .int('Price must be an integer')
      .nonnegative('Price cannot be negative'),
    aiStoryQuota: z
      .number({ required_error: 'AI story quota is required' })
      .int()
      .nonnegative('AI story quota cannot be negative'),
    aiImageQuota: z
      .number({ required_error: 'AI image quota is required' })
      .int()
      .nonnegative('AI image quota cannot be negative'),
    maxChildren: z
      .number({ required_error: 'Max children limit is required' })
      .int()
      .min(1, 'Max children must be at least 1'),
    maxCharacters: z
      .number({ required_error: 'Max characters limit is required' })
      .int()
      .min(1, 'Max characters must be at least 1'),
    canSell: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

const updatePlanSchema = z.object({
  body: z.object({
    code: z
      .string()
      .min(2)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/)
      .optional(),
    name: z.string().min(2).max(100).optional(),
    period: z.enum(['month', 'year']).optional(),
    priceVnd: z.number().int().nonnegative().optional(),
    aiStoryQuota: z.number().int().nonnegative().optional(),
    aiImageQuota: z.number().int().nonnegative().optional(),
    maxChildren: z.number().int().min(1).optional(),
    maxCharacters: z.number().int().min(1).optional(),
    canSell: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

const createCreditPackSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Credit pack name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(120, 'Name cannot exceed 120 characters'),
    credits: z
      .number({ required_error: 'Credits amount is required' })
      .int('Credits must be an integer')
      .positive('Credits must be greater than 0'),
    bonusCredits: z
      .number()
      .int('Bonus credits must be an integer')
      .nonnegative('Bonus credits cannot be negative')
      .default(0)
      .optional(),
    priceVnd: z
      .number({ required_error: 'Price in VND is required' })
      .int('Price must be an integer')
      .nonnegative('Price cannot be negative'),
    isActive: z.boolean().optional(),
  }),
});

const updateCreditPackSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120).optional(),
    credits: z.number().int().positive().optional(),
    bonusCredits: z.number().int().nonnegative().optional(),
    priceVnd: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
  }),
});

const subscribeFreeSchema = z.object({
  body: z.object({
    planId: z.string().uuid('Invalid plan ID format').optional(),
  }),
});

export default {
  createPlanSchema,
  updatePlanSchema,
  createCreditPackSchema,
  updateCreditPackSchema,
  subscribeFreeSchema,
};
