import { Worker } from 'bullmq';
import { env, prisma, requireEnv } from './config/index.js';
import connection from './queues/connection.js';
import { AI_QUEUE_NAME, NARRATION_QUEUE_NAME } from './queues/ai.jobs.js';
import processAiJob from './workers/ai.processor.js';
import processNarrationJob from './workers/narration.processor.js';

// Bien chi worker can. Container `api` khong duoc cap AI_SERVICE_URL, nen moi
// yeu cau sinh noi dung buoc phai di qua queue thay vi goi truc tiep.
requireEnv(['AI_SERVICE_URL', 'INTERNAL_TOKEN']);

const worker = new Worker(AI_QUEUE_NAME, processAiJob, {
  connection,
  concurrency: env.ai.concurrency,
});

// Giong doc: concurrency 1 CO Y (spec TTS §5.3) — ai/ chi doc mot doan mot luc tren CPU.
const narrationWorker = new Worker(NARRATION_QUEUE_NAME, processNarrationJob, { connection, concurrency: 1 });

for (const w of [worker, narrationWorker]) {
  w.on('failed', (job, error) => {
    const attempts = job ? `${job.attemptsMade}/${job.opts.attempts}` : '?';
    // AiServiceError co `code`; UnrecoverableError da gan "[CODE] ..." vao message.
    const code = error.code ? ` [${error.code}]` : '';
    console.error(`[worker] ${job?.name} ${job?.id} failed (attempt ${attempts})${code}: ${error.message}`);
  });

  w.on('error', (error) => {
    console.error(`[worker] ${error.message}`);
  });
}

console.log(
  `[worker] listening on queue "${AI_QUEUE_NAME}" (concurrency=${env.ai.concurrency}) ` +
    `and "${NARRATION_QUEUE_NAME}" (concurrency=1), ai=${env.ai.serviceUrl}`,
);

// Graceful shutdown: worker.close() cho cac job dang chay hoan tat truoc khi
// thoat, thay vi cat giua duong roi de job treo o trang thai active.
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Draining worker...`);
  await Promise.all([worker.close(), narrationWorker.close()]);
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
