import { z } from 'zod';

const uuid = (label) => z.string({ required_error: `Thiếu ${label}` }).uuid(`${label} không hợp lệ`);
const session = z.object({ sessionId: uuid('sessionId') });

const startSession = z.object({ body: z.object({ storyId: uuid('storyId') }) });
const getSession = z.object({ params: session });
const saveProgress = z.object({ params: session, body: z.object({ pageId: uuid('pageId') }) });
const answer = z.object({
  params: session,
  body: z
    .object({
      checkpointId: uuid('checkpointId'),
      emotion: z.enum(['happy', 'sad', 'angry', 'scared', 'neutral']).optional(),
      optionId: z.string().uuid().optional(),
      skipped: z.boolean().optional(),
      timeToFirstMs: z.number().int().min(0).max(3_600_000).optional(),
      questionReplays: z.number().int().min(0).max(100).optional(),
    })
    .strict(),
});

export default { startSession, getSession, saveProgress, answer, complete: getSession };
