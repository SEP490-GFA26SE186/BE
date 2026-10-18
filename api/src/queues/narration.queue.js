import { Queue } from 'bullmq';
import connection from './connection.js';
import env from '../config/env.js';
import { NARRATION_QUEUE_NAME } from './ai.jobs.js';
import { narrationJobId } from '../modules/stories/lib/narration.js';

// Queue RIENG cho giong doc (spec TTS §5.3): ai/ chi doc mot doan mot luc (CPU fp32), nen worker
// cua queue nay chay concurrency 1. Chung queue `ai` (concurrency 3) thi job thu hai, thu ba se
// cho khoa ben ai/ va vuot timeout HTTP cua Node.
const narrationQueue = new Queue(NARRATION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: env.ai.attempts,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * Day job doc cac doan (thu tu doc: trang 1 truoc). `jobs`: [{ clipId, round }] tu queueNarration.
 * @param {{ clipId: string, round: number }[]} jobs
 */
export const enqueueNarration = (jobs) =>
  narrationQueue.addBulk(
    jobs.map(({ clipId, round }) => ({
      name: 'narration',
      data: { clip_id: clipId, round },
      opts: { jobId: narrationJobId(clipId, round) },
    })),
  );

export default narrationQueue;
