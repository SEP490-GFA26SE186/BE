// Sinh chu truyen phia API (spec §4.3, §8.1, §8.5): bat dau sinh (giu credit, tao ai_request, day
// job) va theo doi trang thai (kem don lazy job ket).
import { randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { AI_JOB } from '../../queues/ai.jobs.js';
import { holdCredit } from '../wallets/creditLedger.js';
import { loadStorySettings } from './lib/storySettings.js';
import { STALE_AFTER_MS, isStaleRequest, parseErrorMessage, withTimeout } from './lib/generationStatus.js';
import { findGenerationNameIssues } from './lib/preflight.js';
import { loadOwnedStory, loadStoryForRead } from './stories.access.js';
import { TX_OPTIONS, loadNameContextForStory } from './stories.service.js';
import { finalizeFailure } from './stories.generation.store.js';

export { STALE_AFTER_MS };

/**
 * Gioi han cho `enqueue`. Ket noi IORedis dung chung co `maxRetriesPerRequest: null` + offline queue
 * (worker can hanh vi retry do, nen khong doi), nen khi Redis sap `queue.add` treo mai thay vi nem
 * loi -> khong co timeout thi request khong bao gio tra 503 va khong hoan credit.
 */
export const ENQUEUE_TIMEOUT_MS = 5000;

/** Mac dinh: import dong — import ai.queue.js mo ket noi Redis ngay, test tiem stub thay the. */
const defaultEnqueue = async (jobName, data, options) => {
  const { enqueueAiJob } = await import('../../queues/ai.queue.js');
  return enqueueAiJob(jobName, data, options);
};

/**
 * Chan truoc khi giu credit: ten con sot trong mo ta nhan vat / tinh huong / chu da luu -> 422 chi
 * ro cho can sua (thay vi AI tra FORBIDDEN_TERM_DETECTED -> `blocked`). Doc ngoai transaction: sua
 * chu dong thoi da di qua `tokenizeOrReject` cua editor.
 */
async function assertNoLeftoverNames(storyId) {
  const [story, nameContext] = await Promise.all([
    prisma.story.findUniqueOrThrow({
      where: { id: storyId },
      select: {
        situation: true,
        storyCharacters: {
          select: { token: true, aliasName: true, character: { select: { name: true, appearance: true } } },
        },
        pages: { select: { pageOrder: true, contentText: true } },
        checkpoints: {
          select: {
            question: true,
            hint: true,
            afterPage: { select: { pageOrder: true } },
            options: { select: { optionOrder: true, text: true, feedback: true } },
          },
        },
      },
    }),
    loadNameContextForStory(prisma, storyId),
  ]);

  const issues = findGenerationNameIssues(
    {
      characters: story.storyCharacters.map((sc) => ({
        token: sc.token,
        name: sc.character?.name ?? sc.aliasName,
        appearance: sc.character?.appearance ?? null,
      })),
      situation: story.situation,
      pages: story.pages,
      checkpoints: story.checkpoints.map((k) => ({
        afterPageOrder: k.afterPage.pageOrder,
        question: k.question,
        hint: k.hint,
        options: k.options,
      })),
    },
    nameContext,
  );
  if (issues.length > 0) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      `${issues[0].message}${issues.length > 1 ? ` (và ${issues.length - 1} chỗ khác)` : ''}. ` +
        'Hãy thêm bé làm nhân vật của truyện hoặc bỏ tên khỏi nội dung rồi thử lại.',
      issues.map(({ path, message }) => ({ path, message })),
    );
  }
}

/**
 * POST /:id/generate. Tra `{ aiRequestId }`.
 * 404/403 khong phai chu · 422 truyen `custom` hoac noi dung con sot ten con · 409 dang sinh ·
 * 402 khong du credit · 503 khong day duoc job (da hoan credit).
 *
 * `mockForce` (chi script smoke/E2E, KHONG qua HTTP): ghi `mock_force` vao job data de worker gui
 * `__force` cho ai/ mock (spec AI §4.3). Worker bo qua no khi NODE_ENV=production.
 */
export async function startGeneration(
  user,
  storyId,
  { enqueue = defaultEnqueue, enqueueTimeoutMs = ENQUEUE_TIMEOUT_MS, mockForce } = {},
) {
  const story = await loadOwnedStory(user, storyId);
  if (story.length === 'custom') {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Truyện tự viết không dùng được AI viết chữ. Hãy chỉnh sửa trực tiếp các trang.',
    );
  }
  // Luong 7.6: Moderator tam khoa quyen dung AI (van doc truyen / tu viet duoc)
  const { aiBlockedUntil } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { aiBlockedUntil: true } });
  if (aiBlockedUntil && aiBlockedUntil > new Date()) {
    throw ApiError.forbidden(
      `Quyền dùng AI viết truyện đang tạm khoá đến ${aiBlockedUntil.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} do nhiều lần nội dung bị chặn. Ba mẹ vẫn tự viết truyện được.`,
    );
  }
  await assertNoLeftoverNames(storyId);
  const { storyTextCost } = await loadStorySettings(prisma);
  const cost = storyTextCost[story.length];
  const aiRequestId = randomUUID();

  await prisma.$transaction(async (tx) => {
    // Mot UPDATE co dieu kien: khoa dong truyen, hai request dong thoi thi request sau doi khoa roi
    // thay status da la generating -> 0 dong -> 409. Cung khoa voi lockForWrite cua editor.
    const { count } = await tx.story.updateMany({
      where: { id: storyId, ownerId: user.id, deletedAt: null, status: { not: 'generating' } },
      data: { status: 'generating' },
    });
    if (count === 0) {
      throw ApiError.conflict('Truyện đang được AI viết, vui lòng đợi xong.');
    }

    // Da co luot doc -> checkpoint_answers tro toi checkpoint_options (FK Restrict), persist khong
    // xoa/tao lai phuong an duoc. Chan tu dau thay vi goi AI roi that bai. Nem o day rollback ca
    // buoc doi status ben tren; chua giu credit.
    const played = await tx.playSession.findFirst({ where: { storyId }, select: { id: true } });
    if (played) {
      throw ApiError.conflict('Truyện đã được bé đọc nên không thể viết lại; hãy tạo truyện mới.');
    }

    await tx.aiRequest.create({
      data: {
        id: aiRequestId,
        userId: user.id,
        requestType: AI_JOB.STORY_TEXT,
        storyId,
        status: 'queued',
        creditsCharged: cost,
        idempotencyKey: `${AI_JOB.STORY_TEXT}:${aiRequestId}`,
      },
    });

    // 402 o day rollback ca doi status lan tao ai_request.
    if (cost > 0) await holdCredit(tx, { userId: user.id, amount: cost, aiRequestId });
  }, TX_OPTIONS);

  try {
    // Het gio -> bu tru ENQUEUE_FAILED ben duoi. `add` goc khong huy duoc: neu no thanh cong muon
    // (Redis song lai, offline queue day job di), worker `markProcessing` thay ai_request da ket thuc
    // (failed) va bo qua -> khong xu ly hai lan, khong tru credit hai lan.
    await withTimeout(
      enqueue(
        AI_JOB.STORY_TEXT,
        mockForce ? { ai_request_id: aiRequestId, mock_force: mockForce } : { ai_request_id: aiRequestId },
        { jobId: aiRequestId },
      ),
      enqueueTimeoutMs,
      `Không đẩy được job vào queue sau ${enqueueTimeoutMs}ms`,
    );
  } catch (error) {
    console.error(`[generation] khong day duoc job ${aiRequestId}:`, error);
    await finalizeFailure(prisma, {
      aiRequestId,
      status: 'failed',
      code: 'ENQUEUE_FAILED',
      message: error?.message ?? String(error),
    });
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Hệ thống AI đang tạm gián đoạn, credit đã được hoàn lại. Vui lòng thử lại sau ít phút.',
    );
  }

  return { aiRequestId };
}

const toGeneration = (req) => {
  const { errorCode, errorMessage } = parseErrorMessage(req.errorMessage);
  return {
    aiRequestId: req.id,
    status: req.status,
    errorCode,
    errorMessage,
    createdAt: req.createdAt,
    finishedAt: req.finishedAt,
  };
};

const latestRequest = (storyId) =>
  prisma.aiRequest.findFirst({
    where: { storyId, requestType: AI_JOB.STORY_TEXT },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

/**
 * GET /:id/generation. `ai_request` sinh chu moi nhat cua truyen, hoac `null` neu chua sinh lan nao.
 * Gap job `queued`/`processing` qua STALE_AFTER_MS -> `finalizeFailure` STALE_JOB (spec §8.5).
 */
export async function getGeneration(user, storyId, { now = new Date() } = {}) {
  await loadStoryForRead(user, storyId);
  let request = await latestRequest(storyId);
  if (!request) return null;

  if (isStaleRequest(request, now)) {
    await finalizeFailure(prisma, {
      aiRequestId: request.id,
      status: 'failed',
      code: 'STALE_JOB',
      message: 'Quá thời gian xử lý, credit đã được hoàn lại.',
    });
    // Doc lai: ke ca khi worker vua thang (finalizeFailure tra false) thi van tra trang thai that.
    request = await prisma.aiRequest.findUniqueOrThrow({ where: { id: request.id } });
  }
  return toGeneration(request);
}

/** Bang gia AI viet truyen cho trang tao truyen: moi do dai -> so trang, so diem dung, credit. */
export async function getAiPricing() {
  const { layouts, storyTextCost } = await loadStorySettings(prisma);
  return {
    lengths: Object.entries(layouts).map(([length, layout]) => ({
      length,
      pages: layout.pages,
      checkpoints: layout.checkpoints.length,
      credits: storyTextCost[length],
    })),
  };
}

export default { startGeneration, getGeneration, getAiPricing };
