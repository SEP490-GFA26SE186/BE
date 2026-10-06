// Cac transaction dung chung giua API va worker cho `ai_requests` sinh chu truyen (spec §8.3–§8.5).
// `finalizeFailure` dung chung API (enqueue loi, don job ket) + worker; phan con lai chi worker dung.
//
// Chong dua: `persistAiResult` va `finalizeFailure` deu mo dau bang UPDATE co dieu kien tren dong
// `ai_request` (dang `processing` / dang chua ket thuc). Dong do bi khoa den het transaction, nen ben
// den sau thay trang thai da ket thuc -> count = 0 -> bo qua: khong bao gio vua consume vua release.
import { consumeCredit, releaseCredit } from '../wallets/creditLedger.js';
import { storyStatusFromPages } from './lib/completeness.js';
import { formatErrorMessage } from './lib/generationStatus.js';
import { planPersist } from './lib/persistPlan.js';
import { loadStorySettings } from './lib/storySettings.js';
import { TX_OPTIONS, loadNameContextForStory } from './stories.service.js';

/** CHECK `ai_requests.attempts <= 3`. */
const MAX_RECORDED_ATTEMPTS = 3;

/**
 * Worker bat dau mot lan chay (spec §8.2 buoc 1–2): `ai_request` -> `processing`,
 * `attempts = min(attempt, 3)`. Chi khi dang `queued`/`processing`; da ket thuc (lan chay truoc da
 * commit, hoac da bi finalize) -> `false`, worker bo qua job.
 */
export async function markProcessing(db, aiRequestId, attempt) {
  const { count } = await db.aiRequest.updateMany({
    where: { id: aiRequestId, status: { in: ['queued', 'processing'] } },
    data: {
      status: 'processing',
      attempts: Math.min(Math.max(attempt, 1), MAX_RECORDED_ATTEMPTS),
      lockedAt: new Date(),
    },
  });
  return count > 0;
}

const tokenNumber = (token) => Number(/\d+/.exec(token)?.[0] ?? 0);

/**
 * Doc DB -> input cua `buildAiRequest` (spec §7). Doc ca truyen da xoa mem: persist se tu bo qua
 * phan noi dung (spec §8.3 buoc 2), con AI van chay nhu binh thuong.
 */
export async function loadGenerationInput(db, aiRequestId) {
  const request = await db.aiRequest.findUniqueOrThrow({
    where: { id: aiRequestId },
    select: { id: true, storyId: true },
  });
  if (!request.storyId) throw new Error(`ai_request ${aiRequestId} khong gan voi truyen nao`);

  const story = await db.story.findUniqueOrThrow({
    where: { id: request.storyId },
    select: {
      situation: true,
      topic: { select: { title: true, guidance: true, skill: { select: { caselCode: true } } } },
      storyCharacters: {
        select: { token: true, isMain: true, character: { select: { appearance: true } } },
      },
      pages: { select: { pageOrder: true } },
      checkpoints: { select: { type: true, targetToken: true, afterPage: { select: { pageOrder: true } } } },
    },
  });

  const [nameContext, blockedKeywords, settings] = await Promise.all([
    loadNameContextForStory(db, request.storyId),
    db.blockedKeyword.findMany({
      where: { isActive: true },
      select: { keyword: true, severity: true },
      orderBy: { keyword: 'asc' },
    }),
    loadStorySettings(db),
  ]);

  return {
    aiRequestId: request.id,
    situation: story.situation,
    topic: {
      title: story.topic.title,
      guidance: story.topic.guidance,
      caselCode: story.topic.skill.caselCode,
    },
    characters: [...story.storyCharacters]
      .sort((a, b) => tokenNumber(a.token) - tokenNumber(b.token))
      .map((sc) => ({ token: sc.token, isMain: sc.isMain, appearance: sc.character?.appearance ?? '' })),
    pages: story.pages.map((p) => ({ pageOrder: p.pageOrder })),
    checkpoints: story.checkpoints.map((c) => ({
      type: c.type,
      targetToken: c.targetToken,
      afterPageOrder: c.afterPage.pageOrder,
    })),
    limits: settings.limits,
    nameContext,
    blockedKeywords,
  };
}

/** Du lieu `ai_request` khi thanh cong (spec §8.3 buoc 8); truong usage thieu thi giu mac dinh. */
const succeededData = (usage = {}) => {
  const data = { status: 'succeeded', finishedAt: new Date() };
  if (usage.provider) data.provider = String(usage.provider).slice(0, 40);
  if (usage.model) data.modelName = String(usage.model).slice(0, 100);
  if (Number.isInteger(usage.input_tokens)) data.inputTokens = usage.input_tokens;
  if (Number.isInteger(usage.output_tokens)) data.outputTokens = usage.output_tokens;
  if (Number.isInteger(usage.estimated_cost_micros)) {
    data.providerCostMicros = BigInt(usage.estimated_cost_micros);
  }
  return data;
};

/** Ghi noi dung AI vao truyen (spec §8.3 buoc 3–6). Dong truyen da bi khoa boi UPDATE ngay truoc. */
async function writeContent(tx, storyId, response) {
  const story = await tx.story.findUniqueOrThrow({
    where: { id: storyId },
    select: {
      scenes: { select: { id: true } },
      pages: { select: { id: true, pageOrder: true } },
      checkpoints: { select: { id: true, type: true, afterPage: { select: { pageOrder: true } } } },
    },
  });
  // Response sai hinh -> AiServiceError OUTPUT_INVALID; transaction rollback ca buoc `succeeded`.
  const plan = planPersist(response, {
    pages: story.pages,
    checkpoints: story.checkpoints.map((c) => ({
      id: c.id,
      type: c.type,
      afterPageOrder: c.afterPage.pageOrder,
    })),
  });

  // Doi canh cu sang so am de canh moi lay 1..n khong dung unique (story_id, scene_order).
  await tx.$executeRaw`UPDATE story_scenes SET scene_order = -scene_order - 1000000 WHERE story_id = ${storyId}::uuid`;

  const sceneIdByKey = new Map();
  for (const scene of plan.scenes) {
    const created = await tx.storyScene.create({
      data: { storyId, sceneOrder: scene.sceneOrder, description: scene.description },
      select: { id: true },
    });
    sceneIdByKey.set(scene.key, created.id);
  }

  for (const page of plan.pages) {
    await tx.storyPage.update({
      where: { id: page.id },
      data: {
        contentText: page.contentText,
        aiOriginalText: page.contentText,
        origin: 'ai',
        sceneId: sceneIdByKey.get(page.sceneKey),
        audioKey: null,
        audioStatus: 'none',
      },
    });
  }

  const oldSceneIds = story.scenes.map((s) => s.id);
  if (oldSceneIds.length) await tx.storyScene.deleteMany({ where: { id: { in: oldSceneIds } } });

  for (const ck of plan.checkpoints) {
    await tx.storyCheckpoint.update({
      where: { id: ck.id },
      data: {
        question: ck.question,
        hint: ck.hint,
        answerEmotion: ck.answerEmotion,
        origin: 'ai',
        questionAudioKey: null,
        hintAudioKey: null,
      },
    });
    // startGeneration chan truyen da co play_sessions. Neu be bat dau doc dung giua start va persist
    // (hiem), checkpoint_answers (FK Restrict) lam cau nay loi -> INTERNAL, het luot thi
    // finalize failed + hoan credit. Chap nhan.
    await tx.checkpointOption.deleteMany({ where: { checkpointId: ck.id } });
    if (ck.options.length) {
      await tx.checkpointOption.createMany({
        data: ck.options.map((o) => ({ checkpointId: ck.id, ...o })),
      });
    }
  }
}

/**
 * Ghi ket qua AI (spec §8.3), mot transaction. Tra `true` neu chinh lan goi nay dua `ai_request`
 * sang `succeeded`; `false` neu no khong con `processing` (da ghi truoc do, hoac da bi finalize — vd.
 * don job ket thang cuoc) -> khong ghi gi.
 *
 * Truyen da xoa mem -> khong ghi noi dung, nhung van `succeeded` + consume (AI da chay, tien da mat).
 * Gia 0 (`creditsCharged = 0`) -> khong co hold nen cung khong consume.
 */
export async function persistAiResult(db, { aiRequestId, response }) {
  return db.$transaction(async (tx) => {
    // Cau DAU TIEN: khoa dong ai_request; dua voi finalizeFailure thi chi mot ben co count = 1.
    const { count } = await tx.aiRequest.updateMany({
      where: { id: aiRequestId, status: 'processing' },
      data: succeededData(response?.usage),
    });
    if (count === 0) return false;

    const request = await tx.aiRequest.findUniqueOrThrow({
      where: { id: aiRequestId },
      select: { userId: true, storyId: true, creditsCharged: true },
    });

    // Truyen truoc vi (cung thu tu khoa voi startGeneration/finalizeFailure). UPDATE co dieu kien vua
    // khoa dong truyen vua kiem xoa mem.
    if (request.storyId) {
      const { count: live } = await tx.story.updateMany({
        where: { id: request.storyId, deletedAt: null },
        data: { status: 'ready', reviewedAt: null },
      });
      if (live > 0) await writeContent(tx, request.storyId, response);
    }

    if (request.creditsCharged > 0) {
      await consumeCredit(tx, { userId: request.userId, aiRequestId });
    }
    return true;
  }, TX_OPTIONS);
}

/**
 * Ket thuc `ai_request` bang loi (spec §8.4), mot transaction:
 * - `ai_request` -> `status` (`failed`/`blocked`), `errorMessage = "<code>: <message>"`, `finishedAt`
 *   — CHI khi dang `queued`/`processing`. Da ket thuc (vd. worker vua `succeeded`, hoac lan finalize
 *   truoc) -> tra `false`, khong lam gi: ben kia da thang, khong hoan credit chong len consume.
 * - Truyen dang `generating` -> status tinh lai tu cac trang (noi dung khong bi dung khi loi).
 * - Hoan credit da giu (`credit_release`, idempotent theo key).
 *
 * `db` la prisma client (khong phai transaction client). Tra `true` neu chinh lan goi nay ket thuc no.
 */
export async function finalizeFailure(db, { aiRequestId, status, code, message }) {
  return db.$transaction(async (tx) => {
    // Cau dau tien: UPDATE co dieu kien khoa dong ai_request; lan goi dong thoi thu hai doi khoa roi
    // thay trang thai da ket thuc -> count = 0.
    const { count } = await tx.aiRequest.updateMany({
      where: { id: aiRequestId, status: { in: ['queued', 'processing'] } },
      data: { status, errorMessage: formatErrorMessage(code, message), finishedAt: new Date() },
    });
    if (count === 0) return false;

    const request = await tx.aiRequest.findUniqueOrThrow({
      where: { id: aiRequestId },
      select: { userId: true, storyId: true, creditsCharged: true },
    });

    // Truyen truoc vi: cung thu tu khoa voi startGeneration (story -> wallet), tranh deadlock.
    if (request.storyId) {
      const pages = await tx.storyPage.findMany({
        where: { storyId: request.storyId },
        select: { contentText: true },
      });
      await tx.story.updateMany({
        where: { id: request.storyId, status: 'generating' },
        data: { status: storyStatusFromPages(pages) },
      });
    }

    if (request.creditsCharged > 0) {
      await releaseCredit(tx, { userId: request.userId, amount: request.creditsCharged, aiRequestId });
    }
    return true;
  }, TX_OPTIONS);
}
