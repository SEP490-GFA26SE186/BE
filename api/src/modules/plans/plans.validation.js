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
    durationMonths: z
      .number({ required_error: 'Duration in months is required' })
      .int()
      .min(1, 'Duration must be at least 1 month'),
    priceVnd: z
      .number({ required_error: 'Price in VND is required' })
      .int('Price must be an integer')
      .nonnegative('Price cannot be negative'),
    creditsPerMonth: z
      .number({ required_error: 'Credits per month is required' })
      .int()
      .nonnegative('Credits per month cannot be negative'),
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
    durationMonths: z.number().int().min(1).optional(),
    priceVnd: z.number().int().nonnegative().optional(),
    creditsPerMonth: z.number().int().nonnegative().optional(),
    maxChildren: z.number().int().min(1).optional(),
    maxCharacters: z.number().int().min(1).optional(),
    canSell: z.boolean().optional(),
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
  subscribeFreeSchema,
};
