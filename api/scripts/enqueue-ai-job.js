/**
 * Day mot AI job vao queue de thu bang tay (dev only).
 *
 *   node scripts/enqueue-ai-job.js narration  '{"text":"ngu ngon nhe"}'
 *   node scripts/enqueue-ai-job.js story-page '{"__force":"blocked"}'
 *
 * Trong Docker:
 *   docker compose exec worker node scripts/enqueue-ai-job.js narration '{"text":"hi"}'
 */
import { AI_JOB } from '../src/queues/ai.jobs.js';
import aiQueue, { enqueueAiJob } from '../src/queues/ai.queue.js';

const [jobName, rawInput = '{}'] = process.argv.slice(2);
const validNames = Object.values(AI_JOB);

if (!validNames.includes(jobName)) {
  console.error(`Ten job phai la mot trong: ${validNames.join(', ')}`);
  process.exit(1);
}

const job = await enqueueAiJob(jobName, {
  idempotencyKey: `smoke_${jobName}_${Date.now()}`,
  storagePrefix: `stories/smoke/pages/1`,
  input: JSON.parse(rawInput),
});

console.log(`enqueued job=${job.name} id=${job.id}`);
await aiQueue.close();
process.exit(0);
