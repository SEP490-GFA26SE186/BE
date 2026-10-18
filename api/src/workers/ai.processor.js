import { UnrecoverableError } from 'bullmq';
import { callAi } from '../clients/aiClient.js';
import { AI_JOB } from '../queues/ai.jobs.js';
import { buildAiRequest } from '../modules/stories/lib/aiRequest.js';
import { classifyFailure } from '../modules/stories/lib/failure.js';

/**
 * Processor cho queue `ai` (spec §8.2). Job mang `{ ai_request_id }` (+ `mock_force` tuy chon, chi
 * dev/E2E -> `__force` gui ai/, bi bo qua khi NODE_ENV=production); moi thu khac doc tu DB.
 *
 * `deps` tiem vao de unit test khong can DB/Redis/ai:
 * - `markProcessing(aiRequestId, attempt) → boolean` — false: ai_request da ket thuc -> bo qua job
 * - `loadInput(aiRequestId) → input cua buildAiRequest`
 * - `callAi(jobName, payload) → response`
 * - `persist({ aiRequestId, response }) → boolean` — false: da bi ket thuc noi khac (don job ket)
 * - `finalize({ aiRequestId, status, code, message }) → boolean`
 * - `logger` — `{ info, warn, error }`
 *
 * Loi: `classifyFailure` quyet dinh. Con luot + retryable -> nem lai CHINH loi do (BullMQ retry,
 * khong dung credit). Khong retryable hoac lan cuoi -> `finalize` (hoan credit) roi
 * `UnrecoverableError` de BullMQ dung ngay.
 */
export const createAiProcessor = ({ markProcessing, loadInput, callAi: callAiDep, persist, finalize, logger = console }) =>
  async (job) => {
    if (job.name !== AI_JOB.STORY_TEXT) {
      throw new UnrecoverableError(`Job "${job.name}" chưa hỗ trợ`);
    }
    const aiRequestId = job.data?.ai_request_id;
    if (!aiRequestId) throw new UnrecoverableError('Job thiếu ai_request_id');

    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 1;

    // Loi DB o day -> nem ra, BullMQ retry; neu het luot thi don job ket (spec §8.5) se ket thuc no.
    if (!(await markProcessing(aiRequestId, attemptsMade + 1))) {
      logger.info?.(`[worker] ${job.name} ${aiRequestId} da ket thuc truoc do, bo qua`);
      return { aiRequestId, skipped: true };
    }

    try {
      const input = await loadInput(aiRequestId);
      const payload = buildAiRequest(input);
      // Chi smoke/E2E (scripts/enqueue-ai-job.js --force): ep ai/ mock vao mot nhanh loi (spec AI
      // §4.3). Doc NODE_ENV luc chay de production khong bao gio gui `__force`.
      const mockForce = job.data?.mock_force;
      if (mockForce && process.env.NODE_ENV !== 'production') payload.__force = mockForce;
      const response = await callAiDep(job.name, payload);
      const written = await persist({ aiRequestId, response });
      if (!written) {
        logger.info?.(`[worker] ${job.name} ${aiRequestId} da bi ket thuc noi khac, khong ghi ket qua`);
        return { aiRequestId, skipped: true };
      }

      const warnings = Array.isArray(response?.warnings) ? response.warnings : [];
      if (warnings.length) {
        // Spec §10.2: chua co cho luu warnings -> chi log.
        logger.warn(`[worker] ${job.name} ${aiRequestId} warnings: ${warnings.map((w) => w?.code ?? w).join(', ')}`);
      }
      return { aiRequestId, warnings };
    } catch (error) {
      const decision = classifyFailure(error, { attemptsMade, maxAttempts });
      if (decision.action === 'retry') throw error;

      const { status, code, message } = decision;
      if (code === 'FORBIDDEN_TERM_DETECTED') {
        // tokenizeNames da de lot ten that sang ai/ — bug phia Node (spec §8.4).
        logger.error(`[worker] BUG ${code} ${aiRequestId}: ${message}`);
      } else if (code === 'INTERNAL') {
        logger.error(`[worker] ${job.name} ${aiRequestId} loi noi bo:`, error);
      }
      await finalize({ aiRequestId, status, code, message });
      throw new UnrecoverableError(`[${code}] ${message}`);
    }
  };

/**
 * Processor that: dependency that duoc nap LUOI (import dong) de viec import file nay — vd. trong
 * unit test — khong khoi tao Prisma.
 */
let realProcessor;
const buildRealProcessor = async () => {
  const [{ prisma }, store] = await Promise.all([
    import('../config/index.js'),
    import('../modules/stories/stories.generation.store.js'),
  ]);
  return createAiProcessor({
    markProcessing: (aiRequestId, attempt) => store.markProcessing(prisma, aiRequestId, attempt),
    loadInput: (aiRequestId) => store.loadGenerationInput(prisma, aiRequestId),
    callAi,
    persist: (args) => store.persistAiResult(prisma, args),
    finalize: (args) => store.finalizeFailure(prisma, args),
    logger: console,
  });
};

const processAiJob = async (job) => {
  realProcessor ??= await buildRealProcessor();
  return realProcessor(job);
};

export default processAiJob;
