import { Queue } from 'bullmq';
import connection from './connection.js';
import env from '../config/env.js';
import { AI_QUEUE_NAME } from './ai.jobs.js';

const aiQueue = new Queue(AI_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: env.ai.attempts,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * Day mot job sinh noi dung vao queue.
 *
 * `idempotencyKey` duoc dung lam jobId: BullMQ tu chan job trung id, nen day
 * la lop chong trung o phia Node. ai/ KHONG tu dedupe duoc (no
 * stateless, khong co Redis lan DB) — dung dua vao no.
 *
 * @param {string} jobName      mot gia tri trong AI_JOB
 * @param {object} params
 * @param {string} params.idempotencyKey
 * @param {string} params.storagePrefix  duong dan Storage do Node quyet dinh
 * @param {object} params.input          payload nghiep vu, ai/ khong validate sau
 */
export const enqueueAiJob = (jobName, { idempotencyKey, storagePrefix, input }) =>
  aiQueue.add(
    jobName,
    { idempotencyKey, storagePrefix, input },
    { jobId: idempotencyKey },
  );

export default aiQueue;

export { AI_QUEUE_NAME, AI_JOB } from './ai.jobs.js';
