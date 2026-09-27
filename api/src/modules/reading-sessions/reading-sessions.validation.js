import { z } from 'zod';

const PLAY_STATUSES = ['in_progress', 'completed', 'abandoned'];

const startSession = z.object({
  body: z.object({
    childId: z.string({ required_error: 'Child ID is required' }).uuid('Invalid child ID format'),
    storyId: z.string({ required_error: 'Story ID is required' }).uuid('Invalid story ID format'),
    isReplay: z.boolean().optional().default(false),
  }),
});

const getSession = z.object({
  params: z.object({
    sessionId: z.string().uuid('Invalid session ID format'),
  }),
});

const submitChoice = z.object({
  params: z.object({
    sessionId: z.string().uuid('Invalid session ID format'),
  }),
  body: z.object({
    pageId: z.string({ required_error: 'Page ID is required' }).uuid('Invalid page ID format'),
    choiceId: z.string({ required_error: 'Choice ID is required' }).uuid('Invalid choice ID format'),
    timeToDecideMs: z.number().int().min(0, 'Decision time cannot be negative').optional(),
  }),
});

const completeSession = z.object({
  params: z.object({
    sessionId: z.string().uuid('Invalid session ID format'),
  }),
  body: z
    .object({
      durationSeconds: z.number().int().min(0, 'Duration seconds cannot be negative').optional(),
    })
    .optional(),
});

const getChildHistory = z.object({
  params: z.object({
    childId: z.string().uuid('Invalid child ID format'),
  }),
  query: z.object({
    status: z.enum(PLAY_STATUSES).optional(),
    page: z
      .string()
      .regex(/^\d+$/, 'Page must be an integer')
      .transform(Number)
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/, 'Limit must be an integer')
      .transform(Number)
      .default('10'),
  }),
});

export default {
  startSession,
  getSession,
  submitChoice,
  completeSession,
  getChildHistory,
};
