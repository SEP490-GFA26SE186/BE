import { UnrecoverableError } from 'bullmq';
import { callAi } from '../clients/aiClient.js';
import { AI_JOB } from '../queues/ai.jobs.js';
import { classifyFailure } from '../modules/stories/lib/failure.js';

/**
 * Processor cho queue `narration` (spec TTS §5.3). Job mang `{ clip_id, round }`; chu doc lai tu DB
 * (tinh lai tu chu HIEN TAI, khong mang chu trong job vi chu chua ten that).
 * KHONG dung credit (nguoi dung chot 2026-10-17): khong giu, khong hoan, khong ai_requests.
 *
 * `deps` tiem vao de unit test khong can DB/Redis/ai:
 * - `markGenerating({ clipId, round, attempt }) → boolean` — false: clip da sang luot khac -> bo qua
 * - `loadInput(clipId) → { clip, storyId, kind, targetId, text, voice } | null` — null: chu da doi
 * - `callAi(jobName, payload) → response`
 * - `persist({...}) → boolean`, `fail({ clipId, round, code, message })`
 */
export const createNarrationProcessor = ({ markGenerating, loadInput, callAi: callAiDep, persist, fail, logger = console }) =>
  async (job) => {
    const clipId = job.data?.clip_id;
    const round = job.data?.round;
    if (!clipId || !Number.isInteger(round)) throw new UnrecoverableError('Job thiếu clip_id / round');

    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 1;
    if (!(await markGenerating({ clipId, round, attempt: attemptsMade + 1 }))) {
      return { clipId, skipped: true };
    }

    try {
      const input = await loadInput(clipId);
      if (!input || input.clip.round !== round) {
        // Chu / giong da doi sau khi dua di doc: luot moi (neu co) se doc ban moi.
        await fail({ clipId, round, code: 'STALE', message: 'Chữ đã đổi sau khi đưa đi đọc.' });
        return { clipId, skipped: true };
      }
      const response = await callAiDep(AI_JOB.NARRATION, {
        request_id: `${clipId}-r${round}`,
        storage_prefix: `stories/${input.storyId}/audio`,
        text: input.text,
        voice_id: input.voice,
      });
      const written = await persist({
        clipId,
        round,
        fingerprint: input.clip.fingerprint,
        kind: input.kind,
        targetId: input.targetId,
        audioKey: response.audio_key,
        durationSeconds: response.duration_seconds,
      });
      return { clipId, skipped: !written, audioKey: response.audio_key };
    } catch (error) {
      const decision = classifyFailure(error, { attemptsMade, maxAttempts });
      if (decision.action === 'retry') throw error;
      if (decision.code === 'INTERNAL') logger.error(`[narration] ${clipId} loi noi bo:`, error);
      await fail({ clipId, round, code: decision.code, message: decision.message });
      throw new UnrecoverableError(`[${decision.code}] ${decision.message}`);
    }
  };

let realProcessor;
const buildRealProcessor = async () => {
  const [{ prisma }, store] = await Promise.all([
    import('../config/index.js'),
    import('../modules/stories/stories.narration.store.js'),
  ]);
  return createNarrationProcessor({
    markGenerating: (args) => store.markClipGenerating(prisma, args),
    loadInput: (clipId) => store.loadClipInput(prisma, clipId),
    callAi,
    persist: (args) => store.persistClip(prisma, args),
    fail: (args) => store.failClip(prisma, args),
    logger: console,
  });
};

const processNarrationJob = async (job) => {
  realProcessor ??= await buildRealProcessor();
  return realProcessor(job);
};

export default processNarrationJob;
