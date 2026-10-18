/**
 * Smoke test bang tay (dev only): sinh chu cho mot truyen co san qua DUNG luong that —
 * `startGeneration` giu credit, tao ai_request, day job `story_text` vao queue; worker xu ly.
 *
 *   node scripts/enqueue-ai-job.js story_text <storyId> [--force CODE]
 *
 * Trong Docker (LLM_PROVIDER=mock):
 *   docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId>
 *   docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId> --force SAFETY_BLOCKED
 *
 * `--force CODE` (chi dev/E2E): ghi `mock_force` vao job data; worker gui `__force: CODE` cho ai/
 * mock de ep mot nhanh loi (spec AI §4.3): SAFETY_BLOCKED · PROVIDER_ERROR · TIMEOUT ·
 * OUTPUT_INVALID · INVALID_OUTPUT_ONCE. Worker BO QUA co nay khi NODE_ENV=production.
 *
 * Theo doi: GET /api/v1/stories/<storyId>/generation, hoac log cua worker.
 * Luu y: ghi that vao DB dang cau hinh (tru credit cua chu truyen).
 */
import { prisma } from '../src/config/index.js';
import { AI_JOB } from '../src/queues/ai.jobs.js';
import aiQueue, { enqueueAiJob } from '../src/queues/ai.queue.js';
import { startGeneration } from '../src/modules/stories/stories.generation.service.js';

const usage = () => {
  console.error('Cach dung: node scripts/enqueue-ai-job.js story_text <storyId> [--force CODE]');
  process.exit(1);
};

/** `story_text <storyId> [--force CODE | --force=CODE]`; tham so la -> usage. */
const parseArgs = (argv) => {
  const positional = [];
  let force;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') {
      force = argv[i + 1];
      i += 1;
      if (!force || force.startsWith('--')) usage();
    } else if (arg.startsWith('--force=')) {
      force = arg.slice('--force='.length);
      if (!force) usage();
    } else if (arg.startsWith('--')) {
      usage();
    } else {
      positional.push(arg);
    }
  }
  return { jobName: positional[0], storyId: positional[1], extra: positional.length > 2, force };
};

const { jobName, storyId, extra, force } = parseArgs(process.argv.slice(2));

if (jobName !== AI_JOB.STORY_TEXT || !storyId || extra) usage();

let exitCode = 0;
try {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { owner: { select: { id: true, role: true } } },
  });
  if (!story) throw new Error(`Khong tim thay truyen ${storyId}`);

  const { aiRequestId } = await startGeneration(story.owner, storyId, {
    enqueue: enqueueAiJob,
    ...(force ? { mockForce: force } : {}),
  });
  console.log(`enqueued job=${jobName} aiRequestId=${aiRequestId}${force ? ` mock_force=${force}` : ''}`);
} catch (error) {
  console.error(`[enqueue-ai-job] ${error.statusCode ? `${error.statusCode} ` : ''}${error.message}`);
  exitCode = 1;
} finally {
  await aiQueue.close();
  await prisma.$disconnect();
}
process.exit(exitCode);
