import { z } from 'zod';

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
    preferredVoice: z
      .string()
      .trim()
      .max(50, 'Preferred voice must not exceed 50 characters')
      .optional(),
    appearance: z
      .string()
      .trim()
      .max(500, 'Appearance description must not exceed 500 characters')
      .optional(),
    portraitImageKey: z
      .string()
      .trim()
      .max(300, 'Portrait image key must not exceed 300 characters')
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
    preferredVoice: z
      .string()
      .trim()
      .max(50, 'Preferred voice must not exceed 50 characters')
      .nullable()
      .optional(),
    appearance: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional(),
    portraitImageKey: z
      .string()
      .trim()
      .max(300)
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

// Phien dung may: duration_seconds va usage_date la cot DB tu sinh tu started_at / ended_at (rev8).
const logUsageSession = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
  body: z
    .object({
      startedAt: z.string({ required_error: 'startedAt is required' }).datetime(),
      endedAt: z.string({ required_error: 'endedAt is required' }).datetime(),
    })
    .refine((b) => new Date(b.endedAt) > new Date(b.startedAt), {
      message: 'endedAt must be after startedAt',
      path: ['endedAt'],
    }),
});

const updateAvatar = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
  body: z.object({
    appearance: z.string().trim().max(500).optional(),
    portraitImageKey: z.string().trim().max(300).optional(),
  }),
});

// Bao cao EQ cong don toan bo lich su (eq_competency_stats, docs/01) — khong loc theo ngay.
const getEqReport = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
});

const getChildBookshelf = z.object({
  params: z.object({
    id: z.string().uuid('Invalid child ID format'),
  }),
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
    search: z.string().trim().optional(),
    status: z.enum(['all', 'reading', 'completed', 'not_started']).default('all'),
    competency: z
      .enum(['all', 'self_awareness', 'self_management', 'social_awareness', 'relationship_skills', 'responsible_decision_making'])
      .default('all'),
  }),
});

export default {
  createChild,
  updateChild,
  getChild,
  deleteChild,
  getUsage,
  logUsageSession,
  updateAvatar,
  getEqReport,
  getChildBookshelf,
};
