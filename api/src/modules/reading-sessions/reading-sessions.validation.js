import { z } from 'zod';

const PLAY_STATUSES = ['in_progress', 'completed', 'abandoned'];
const EMOTIONS = ['happy', 'sad', 'angry', 'scared', 'neutral'];

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

const updateProgress = z.object({
  params: z.object({
    sessionId: z.string().uuid('Invalid session ID format'),
  }),
  body: z.object({
    pageId: z.string({ required_error: 'Page ID is required' }).uuid('Invalid page ID format'),
  }),
});

const submitAnswer = z.object({
  params: z.object({
    sessionId: z.string().uuid('Invalid session ID format'),
  }),
  body: z.object({
    checkpointId: z.string({ required_error: 'Checkpoint ID is required' }).uuid('Invalid checkpoint ID format'),
    firstEmotion: z.enum(EMOTIONS).optional(),
    firstOptionId: z.string().uuid('Invalid option ID format').optional(),
    finalEmotion: z.enum(EMOTIONS).optional(),
    finalOptionId: z.string().uuid('Invalid option ID format').optional(),
    attempts: z.number().int().min(1).max(2).optional(),
    skipped: z.boolean().optional(),
    timeToFirstMs: z.number().int().min(0, 'Time cannot be negative').optional(),
    questionReplays: z.number().int().min(0).optional(),
  }),
});

const completeSession = z.object({
  params: z.object({
    sessionId: z.string().uuid('Invalid session ID format'),
  }),
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
  updateProgress,
  submitAnswer,
  completeSession,
  getChildHistory,
};
