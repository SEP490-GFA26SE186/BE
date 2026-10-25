// Dieu phoi sinh anh (quyet dinh 2026-10-19, ai/docs/01):
// - Chan dung: phu huynh bam tao o trang Nhan vat (1 anh, giu credit `ai_cost.character_portrait`).
// - Truyen bat tranh (`use_ai_image`): AI viet chu xong -> worker goi `queueStoryImages`: tao chan dung
//   con thieu, roi moi canh mot job (`ai_cost.scene_image`). Canh co nhan vat dang ve chan dung thi CHO
//   (`image_status = queued`, chua co ai_request); chan dung xong / loi -> `resumeAfterPortrait` chay
//   tiep (loi thi canh ve khong co anh tham chieu).
// - Chi truyen rieng (`kind = private`) co canh co mo ta (truyen AI viet). Truyen tu viet chua co mo ta
//   canh nen chua ve duoc.
import { randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { AI_JOB } from '../../queues/ai.jobs.js';
import { holdCredit } from '../wallets/creditLedger.js';
import { withTimeout } from './lib/generationStatus.js';
import { finalizeImageFailure, loadImageCosts } from './stories.images.store.js';
import { TX_OPTIONS } from './stories.service.js';

const ACTIVE = ['queued', 'processing'];
const DRAWING = ['queued', 'generating'];
const ENQUEUE_TIMEOUT_MS = 5000;

const defaultEnqueue = async (jobName, data, options) => {
  const { enqueueAiJob } = await import('../../queues/ai.queue.js');
  return enqueueAiJob(jobName, data, options);
};

async function assertAiAllowed(db, userId) {
  const { aiBlockedUntil } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { aiBlockedUntil: true } });
  if (aiBlockedUntil && aiBlockedUntil > new Date()) {
    throw ApiError.forbidden('Quyền dùng AI đang tạm khoá do nhiều lần nội dung bị chặn.');
  }
}

async function enqueueOrFail(db, enqueue, jobName, aiRequestId) {
  try {
    await withTimeout(enqueue(jobName, { ai_request_id: aiRequestId }, { jobId: aiRequestId }), ENQUEUE_TIMEOUT_MS,
      `Không đẩy được job vào queue sau ${ENQUEUE_TIMEOUT_MS}ms`);
  } catch (error) {
    console.error(`[images] khong day duoc job ${aiRequestId}:`, error);
    await finalizeImageFailure(db, { aiRequestId, status: 'failed', code: 'ENQUEUE_FAILED', message: error?.message ?? String(error) });
    throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'Hàng đợi tạm lỗi, ba mẹ thử lại sau ít phút nhé.');
  }
}

/**
 * Tao chan dung cho mot nhan vat (POST /characters/:id/portrait, hoac truyen bat tranh thieu chan dung).
 * Dang ve -> 409; khong du credit -> 402 (holdCredit). Tra { aiRequestId }.
 */
export async function startPortrait(user, characterId, { db = prisma, enqueue = defaultEnqueue } = {}) {
  const character = await db.character.findFirst({
    where: { id: characterId, parentId: user.id, deletedAt: null },
    select: { id: true, appearance: true },
  });
  if (!character) throw ApiError.notFound('Không tìm thấy nhân vật.');
  if (!character.appearance?.trim()) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Hãy mô tả ngoại hình nhân vật trước khi tạo chân dung.');
  }
  await assertAiAllowed(db, user.id);
  const { [AI_JOB.CHARACTER_PORTRAIT]: cost } = await loadImageCosts(db);
  const aiRequestId = randomUUID();

  await db.$transaction(async (tx) => {
    // UPDATE co dieu kien: hai lan bam cung luc -> lan sau thay dang ve -> 409.
    const { count } = await tx.character.updateMany({
      where: { id: character.id, portraitStatus: { notIn: DRAWING } },
      data: { portraitStatus: 'queued' },
    });
    if (count === 0) throw ApiError.conflict('Chân dung nhân vật này đang được vẽ.');
    await tx.aiRequest.create({
      data: {
        id: aiRequestId, userId: user.id, requestType: AI_JOB.CHARACTER_PORTRAIT, characterId: character.id,
        status: 'queued', creditsCharged: cost, idempotencyKey: `${AI_JOB.CHARACTER_PORTRAIT}:${aiRequestId}`,
      },
    });
    if (cost > 0) await holdCredit(tx, { userId: user.id, amount: cost, aiRequestId });
  }, TX_OPTIONS);

  await enqueueOrFail(db, enqueue, AI_JOB.CHARACTER_PORTRAIT, aiRequestId);
  return { aiRequestId };
}

async function startScene(db, enqueue, { userId, storyId, sceneId, cost }) {
  const aiRequestId = randomUUID();
  await db.$transaction(async (tx) => {
    await tx.aiRequest.create({
      data: {
        id: aiRequestId, userId, requestType: AI_JOB.SCENE_IMAGE, storyId, sceneId, status: 'queued',
        creditsCharged: cost, idempotencyKey: `${AI_JOB.SCENE_IMAGE}:${aiRequestId}`,
      },
    });
    if (cost > 0) await holdCredit(tx, { userId, amount: cost, aiRequestId });
    await tx.storyScene.update({ where: { id: sceneId }, data: { imageStatus: 'queued' } });
  }, TX_OPTIONS);
  await enqueueOrFail(db, enqueue, AI_JOB.SCENE_IMAGE, aiRequestId);
  return aiRequestId;
}

const isInsufficient = (e) => e?.statusCode === StatusCodes.PAYMENT_REQUIRED;

/**
 * Het credit: canh dang `queued` ma khong co lenh ve nao dang chay (chi dang cho chan dung) ve `none`,
 * khong thi editor hien "dang ve" mai. Phu huynh nap them roi bam "Ve tranh" de ve tiep.
 */
async function releaseWaitingScenes(db, storyId) {
  const drawing = (await db.aiRequest.findMany({
    where: { storyId, requestType: AI_JOB.SCENE_IMAGE, status: { in: ACTIVE } },
    select: { sceneId: true },
  })).map((r) => r.sceneId);
  await db.storyScene.updateMany({
    where: { storyId, imageStatus: 'queued', ...(drawing.length && { id: { notIn: drawing } }) },
    data: { imageStatus: 'none' },
  });
}

/**
 * Xep hang anh cho mot truyen. Mac dinh: chan dung con thieu + canh chua co anh (`none`/`failed`) hoac
 * dang cho chan dung. `sceneIds`: chi ve lai cac canh nay (ke ca da co anh).
 * Tra { portraits, scenes, waiting, insufficientCredit }.
 */
export async function queueStoryImages(storyId, { userId, sceneIds = null, db = prisma, enqueue = defaultEnqueue } = {}) {
  const story = await db.story.findFirst({
    where: { id: storyId, ownerId: userId, deletedAt: null, kind: 'private' },
    select: {
      id: true,
      scenes: { select: { id: true, description: true, imageStatus: true }, orderBy: { sceneOrder: 'asc' } },
      storyCharacters: { select: { character: { select: { id: true, appearance: true, portraitStatus: true, deletedAt: true } } } },
    },
  });
  if (!story) throw ApiError.notFound('Không tìm thấy truyện.');
  const result = { portraits: 0, scenes: 0, waiting: 0, insufficientCredit: false };
  const user = { id: userId };

  const cast = story.storyCharacters.map((sc) => sc.character).filter((c) => c && !c.deletedAt && c.appearance?.trim());
  for (const c of cast) {
    if (c.portraitStatus !== 'none') continue; // da co / dang ve / loi (phu huynh tu tao lai)
    try {
      await startPortrait(user, c.id, { db, enqueue });
      c.portraitStatus = 'queued';
      result.portraits += 1;
    } catch (e) {
      if (isInsufficient(e)) {
        result.insufficientCredit = true;
        await releaseWaitingScenes(db, storyId);
        return result;
      }
      if (e?.statusCode === StatusCodes.CONFLICT) c.portraitStatus = 'queued';
      else throw e;
    }
  }
  const waitForPortrait = cast.some((c) => DRAWING.includes(c.portraitStatus));

  const active = new Set(
    (await db.aiRequest.findMany({
      where: { storyId, requestType: AI_JOB.SCENE_IMAGE, status: { in: ACTIVE } },
      select: { sceneId: true },
    })).map((r) => r.sceneId),
  );
  const targets = story.scenes.filter((s) => s.description?.trim() && !active.has(s.id)
    && (sceneIds ? sceneIds.includes(s.id) : ['none', 'failed', 'queued'].includes(s.imageStatus)));
  if (!targets.length) return result;

  const { [AI_JOB.SCENE_IMAGE]: cost } = await loadImageCosts(db);
  for (const [i, scene] of targets.entries()) {
    if (waitForPortrait) {
      await db.storyScene.update({ where: { id: scene.id }, data: { imageStatus: 'queued' } });
      result.waiting += 1;
      continue;
    }
    try {
      await startScene(db, enqueue, { userId, storyId, sceneId: scene.id, cost });
      result.scenes += 1;
    } catch (e) {
      if (!isInsufficient(e)) throw e;
      result.insufficientCredit = true;
      result.skippedNoCredit = targets.length - i;
      await releaseWaitingScenes(db, storyId);
      break;
    }
  }
  return result;
}

/** Chan dung vua xong / loi: chay tiep cac canh dang cho trong moi truyen bat tranh co nhan vat do. */
export async function resumeAfterPortrait(characterId, { db = prisma, enqueue = defaultEnqueue } = {}) {
  const stories = await db.story.findMany({
    where: {
      kind: 'private', deletedAt: null, useAiImage: true,
      storyCharacters: { some: { characterId } },
      scenes: { some: { imageStatus: 'queued' } },
    },
    select: { id: true, ownerId: true },
  });
  for (const s of stories) {
    try {
      await queueStoryImages(s.id, { userId: s.ownerId, db, enqueue });
    } catch (e) {
      console.error(`[images] khong xep hang tiep anh cho truyen ${s.id}:`, e);
    }
  }
}

async function ownedStoryForImages(db, user, storyId) {
  const story = await db.story.findFirst({
    where: { id: storyId, ownerId: user.id, deletedAt: null },
    select: { id: true, kind: true, status: true, useAiImage: true },
  });
  if (!story) throw ApiError.notFound('Không tìm thấy truyện.');
  if (story.kind !== 'private') throw ApiError.forbidden('Bản đăng bán không vẽ lại tranh được.');
  if (story.status === 'generating') throw ApiError.conflict('AI đang viết truyện, vẽ tranh sau khi viết xong nhé.');
  return story;
}

/** POST /stories/:id/images — bat tranh cho truyen va ve moi canh con thieu. */
export async function drawStoryImages(user, storyId, { db = prisma, enqueue = defaultEnqueue } = {}) {
  const story = await ownedStoryForImages(db, user, storyId);
  await assertAiAllowed(db, user.id);
  if (!story.useAiImage) await db.story.update({ where: { id: storyId }, data: { useAiImage: true } });
  const result = await queueStoryImages(storyId, { userId: user.id, db, enqueue });
  if (result.insufficientCredit && result.scenes + result.portraits === 0) {
    throw new ApiError(StatusCodes.PAYMENT_REQUIRED, 'Ba mẹ không đủ credit để vẽ tranh.');
  }
  return result;
}

/** POST /stories/:id/scenes/:sceneId/image — ve lai mot canh (tru credit lan nua). */
export async function redrawScene(user, storyId, sceneId, { db = prisma, enqueue = defaultEnqueue } = {}) {
  const story = await ownedStoryForImages(db, user, storyId);
  await assertAiAllowed(db, user.id);
  const scene = await db.storyScene.findFirst({ where: { id: sceneId, storyId }, select: { id: true, description: true } });
  if (!scene) throw ApiError.notFound('Không tìm thấy cảnh.');
  if (!scene.description?.trim()) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Cảnh này chưa có mô tả nên chưa vẽ được.');
  }
  const busy = await db.aiRequest.findFirst({ where: { sceneId, requestType: AI_JOB.SCENE_IMAGE, status: { in: ACTIVE } }, select: { id: true } });
  if (busy) throw ApiError.conflict('Cảnh này đang được vẽ.');
  if (!story.useAiImage) await db.story.update({ where: { id: storyId }, data: { useAiImage: true } });
  const result = await queueStoryImages(storyId, { userId: user.id, sceneIds: [sceneId], db, enqueue });
  if (result.insufficientCredit && result.scenes === 0 && result.waiting === 0) {
    throw new ApiError(StatusCodes.PAYMENT_REQUIRED, 'Ba mẹ không đủ credit để vẽ lại cảnh này.');
  }
  return result;
}

export default { startPortrait, queueStoryImages, resumeAfterPortrait, drawStoryImages, redrawScene };
