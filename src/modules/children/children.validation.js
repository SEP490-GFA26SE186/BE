import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const createChild = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Child name is required' })
      .trim()
      .min(1, 'Child name cannot be empty')
      .max(100, 'Child name must not exceed 100 characters'),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date must be formatted as YYYY-MM-DD')
      .optional(),
    dailyScreenTimeMinutes: z
      .number({ invalid_type_error: 'Screen time must be a number of minutes' })
      .int('Screen time must be an integer')
      .min(5, 'Minimum screen time is 5 minutes')
      .max(300, 'Maximum screen time is 300 minutes')
      .optional()
      .default(30),
    bedtimeStart: z
      .string()
      .regex(timeRegex, 'Bedtime start must be formatted as HH:mm (e.g. 21:00)')
      .optional(),
    bedtimeEnd: z
      .string()
      .regex(timeRegex, 'Bedtime end must be formatted as HH:mm (e.g. 06:00)')
      .optional(),
    preferredVoice: z
      .string()
      .trim()
      .max(50, 'Preferred voice must not exceed 50 characters')
      .optional(),
  }),
});

const updateChild = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Child name cannot be empty')
      .max(100, 'Child name must not exceed 100 characters')
      .optional(),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date must be formatted as YYYY-MM-DD')
      .optional(),
    dailyScreenTimeMinutes: z
      .number({ invalid_type_error: 'Screen time must be a number of minutes' })
      .int('Screen time must be an integer')
      .min(5, 'Minimum screen time is 5 minutes')
      .max(300, 'Maximum screen time is 300 minutes')
      .optional(),
    bedtimeStart: z
      .string()
      .regex(timeRegex, 'Bedtime start must be formatted as HH:mm (e.g. 21:00)')
      .nullable()
      .optional(),
    bedtimeEnd: z
      .string()
      .regex(timeRegex, 'Bedtime end must be formatted as HH:mm (e.g. 06:00)')
      .nullable()
      .optional(),
    preferredVoice: z
      .string()
      .trim()
      .max(50, 'Preferred voice must not exceed 50 characters')
      .nullable()
      .optional(),
  }),
});

const getChild = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
});

const deleteChild = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
});

const getUsage = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
  query: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Lookup date must be formatted as YYYY-MM-DD')
      .optional(),
  }),
});

const logUsageSession = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
  body: z.object({
    startedAt: z.string().datetime({ message: 'Started at must be a valid ISO 8601 datetime' }).optional(),
    endedAt: z.string().datetime({ message: 'Ended at must be a valid ISO 8601 datetime' }).optional(),
    durationSeconds: z.number().int().min(1, 'Duration must be at least 1 second'),
  }),
});

export default {
  createChild,
  updateChild,
  getChild,
  deleteChild,
  getUsage,
  logUsageSession,
};
