// Giong doc ke truyen phia Node (spec TTS §5.2-5.4): dua doan di doc khi hoan tat / thu lai.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { withTimeout } from './lib/generationStatus.js';
import { lockForWrite } from './stories.access.js';
import { TX_OPTIONS, getDetail } from './stories.service.js';
import { failClip, loadVoice, queueNarration } from './stories.narration.store.js';
import { ENQUEUE_TIMEOUT_MS } from './stories.generation.service.js';

/** Mac dinh: import dong — import narration.queue.js mo ket noi Redis ngay, test tiem stub thay the. */
const defaultEnqueue = async (jobs) => {
  const { enqueueNarration } = await import('../../queues/narration.queue.js');
  return enqueueNarration(jobs);
};

/**
 * Trong transaction da khoa ghi: tao / dat lai clip cho doan thieu, lech hoac loi.
 * Truyen tat giong doc -> khong lam gi. Tra job de day SAU commit (job doc lai DB).
 */
export async function prepareNarration(tx, storyId) {
  const { useTts } = await tx.story.findUniqueOrThrow({ where: { id: storyId }, select: { useTts: true } });
  if (!useTts) return [];
  return queueNarration(tx, storyId, await loadVoice(tx));
}

/**
 * Day job vao queue `narration`. Redis loi / treo -> danh dau cac clip do failed (ENQUEUE_FAILED)
 * de phu huynh bam thu lai; KHONG lam hong thao tac hoan tat (khong co credit nao can hoan).
 * @returns {Promise<boolean>} false = khong day duoc
 */
export async function dispatchNarration(jobs, { enqueue = defaultEnqueue, enqueueTimeoutMs = ENQUEUE_TIMEOUT_MS } = {}) {
  if (!jobs.length) return true;
  try {
    await withTimeout(enqueue(jobs), enqueueTimeoutMs, `Không đẩy được job giọng đọc sau ${enqueueTimeoutMs}ms`);
    return true;
  } catch (error) {
    console.error(`[narration] khong day duoc ${jobs.length} job:`, error);
    const message = 'Hệ thống giọng đọc đang tạm gián đoạn.';
    for (const job of jobs) await failClip(prisma, { ...job, code: 'ENQUEUE_FAILED', message });
    return false;
  }
}

/** POST /stories/:id/narration/retry — chi dua lai doan loi / thieu / lech (§5.4). */
export async function retryNarration(user, storyId, options) {
  const jobs = await prisma.$transaction(async (tx) => {
    const story = await lockForWrite(tx, user, storyId);
    if (!story.reviewedAt) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Hãy bấm hoàn tất truyện trước khi tạo giọng đọc.');
    }
    if (!story.useTts) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Truyện này đang tắt giọng đọc.');
    }
    return prepareNarration(tx, storyId);
  }, TX_OPTIONS);
  const dispatched = await dispatchNarration(jobs, options);
  if (!dispatched) {
    throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'Hệ thống giọng đọc đang tạm gián đoạn. Vui lòng thử lại sau ít phút.');
  }
  return getDetail(prisma, storyId);
}

export default { retryNarration };
