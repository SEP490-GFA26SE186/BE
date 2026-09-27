import { Worker } from 'bullmq';
import { env, prisma, requireEnv } from './config/index.js';
import connection from './queues/connection.js';
import { AI_QUEUE_NAME } from './queues/ai.jobs.js';
import processAiJob from './workers/ai.processor.js';

// Bien chi worker can. Container `api` khong duoc cap AI_SERVICE_URL, nen moi
// yeu cau sinh noi dung buoc phai di qua queue thay vi goi truc tiep.
requireEnv(['AI_SERVICE_URL', 'INTERNAL_TOKEN']);

const worker = new Worker(AI_QUEUE_NAME, processAiJob, {
  connection,
  concurrency: env.ai.concurrency,
});

worker.on('failed', (job, error) => {
  const attempts = job ? `${job.attemptsMade}/${job.opts.attempts}` : '?';
  console.error(`[worker] ${job?.name} ${job?.id} failed (attempt ${attempts}): ${error.message}`);
});

worker.on('error', (error) => {
  console.error(`[worker] ${error.message}`);
});

console.log(
  `[worker] listening on queue "${AI_QUEUE_NAME}" ` +
    `(concurrency=${env.ai.concurrency}, ai=${env.ai.serviceUrl}, timeout=${env.ai.timeoutMs}ms)`,
);

// Graceful shutdown: worker.close() cho cac job dang chay hoan tat truoc khi
// thoat, thay vi cat giua duong roi de job treo o trang thai active.
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Draining worker...`);
  await worker.close();
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
