// `ai_requests` sinh anh: chan dung nhan vat (`character_portrait`) va tranh canh (`scene_image`).
// Quyet dinh 2026-10-19 (ai/docs/01): Cloudflare Workers AI, chan dung 1 anh lam anh tham chieu,
// canh gui chan dung cac nhan vat; gia chan dung / canh lay tu platform_settings.
//
// Chong dua giong job viet chu (stories.generation.store.js): ghi ket qua va ket thuc loi deu mo dau
// bang UPDATE co dieu kien tren dong ai_request -> chi mot ben thang, khong vua consume vua release.
// Khac job chu: loi anh KHONG dung toi trang thai truyen, chi danh dau chan dung / canh `failed`.
import ApiError from '../../utils/ApiError.js';
import { AI_JOB } from '../../queues/ai.jobs.js';
import { consumeCredit, releaseCredit } from '../wallets/creditLedger.js';
import { formatErrorMessage } from './lib/generationStatus.js';
import { tokenizeNames } from './lib/names.js';
import { TX_OPTIONS } from './stories.service.js';

export const IMAGE_COST_KEYS = {
  [AI_JOB.CHARACTER_PORTRAIT]: 'ai_cost.character_portrait',
  [AI_JOB.SCENE_IMAGE]: 'ai_cost.scene_image',
};

/** Credit cho mot lan ve: { character_portrait, scene_image }. Thieu / sai -> loi cau hinh 500. */
export async function loadImageCosts(db) {
  const rows = await db.platformSetting.findMany({
    where: { key: { in: Object.values(IMAGE_COST_KEYS) } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const costs = {};
  for (const [type, key] of Object.entries(IMAGE_COST_KEYS)) {
    const v = byKey.get(key);
    if (!Number.isInteger(v) || v < 0) throw ApiError.internal(`Thiếu / sai cấu hình ${key} (chạy lại seed).`);
    costs[type] = v;
  }
  return costs;
}

/**
 * Bo moi ten trong gia dinh khoi mo ta ngoai hinh: model ve khong can ten, va ten that khong duoc
 * roi khoi he thong. Ten van nam trong `forbidden_terms` de ai/ chan lan nua.
 */
export function scrubNames(text, names) {
  if (!text) return '';
  const blanked = tokenizeNames(text, names.map((name) => ({ name, token: '' })));
  return blanked.replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,.;:]+/, '').trim();
}

/** Ten cac con + moi nhan vat (ke ca da xoa) cua phu huynh. */
async function familyNames(db, parentId) {
  const [children, characters] = await Promise.all([
    db.childProfile.findMany({ where: { parentId }, select: { name: true } }),
    db.character.findMany({ where: { parentId }, select: { name: true } }),
  ]);
  return [...new Set([...children, ...characters].map((r) => r.name?.normalize('NFC').trim()).filter(Boolean))];
}

/** Input POST /v1/images/portrait. Danh dau chan dung `generating`. */
export async function loadPortraitInput(db, aiRequestId) {
  const request = await db.aiRequest.findUniqueOrThrow({ where: { id: aiRequestId }, select: { characterId: true } });
  if (!request.characterId) throw new Error(`ai_request ${aiRequestId} khong gan voi nhan vat nao`);
  const character = await db.character.findUniqueOrThrow({
    where: { id: request.characterId },
    select: { id: true, parentId: true, appearance: true },
  });
  const names = await familyNames(db, character.parentId);
  await db.character.updateMany({ where: { id: character.id, portraitStatus: 'queued' }, data: { portraitStatus: 'generating' } });
  return {
    request_id: aiRequestId,
    storage_prefix: `characters/${character.id}/portraits`,
    description: scrubNames(character.appearance, names),
    forbidden_terms: names,
  };
}

/** Input POST /v1/images/scene: mo ta canh (tieng Anh, AI viet) + nhan vat (chinh truoc) kem chan dung. */
export async function loadSceneInput(db, aiRequestId) {
  const request = await db.aiRequest.findUniqueOrThrow({ where: { id: aiRequestId }, select: { sceneId: true, storyId: true } });
  if (!request.sceneId || !request.storyId) throw new Error(`ai_request ${aiRequestId} khong gan voi canh nao`);
  const [scene, story] = await Promise.all([
    db.storyScene.findUniqueOrThrow({ where: { id: request.sceneId }, select: { id: true, description: true } }),
    db.story.findUniqueOrThrow({
      where: { id: request.storyId },
      select: {
        ownerId: true,
        storyCharacters: {
          select: {
            isMain: true, token: true, aliasName: true,
            character: { select: { appearance: true, portraitImageKey: true, portraitStatus: true } },
          },
        },
      },
    }),
  ]);
  const names = await familyNames(db, story.ownerId);
  for (const sc of story.storyCharacters) if (sc.aliasName) names.push(sc.aliasName);
  const cast = [...story.storyCharacters]
    .filter((sc) => sc.character?.appearance)
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.token.localeCompare(b.token));
  await db.storyScene.updateMany({ where: { id: scene.id, imageStatus: 'queued' }, data: { imageStatus: 'generating' } });
  return {
    request_id: aiRequestId,
    storage_prefix: `stories/${request.storyId}/scenes`,
    scene_description: scene.description,
    characters: cast.map((sc) => ({
      description: scrubNames(sc.character.appearance, names),
      portrait_key: sc.character.portraitStatus === 'ready' ? sc.character.portraitImageKey : null,
    })),
    forbidden_terms: [...new Set(names)],
  };
}

const succeededData = (usage = {}) => {
  const data = { status: 'succeeded', finishedAt: new Date() };
  if (usage.provider) data.provider = String(usage.provider).slice(0, 40);
  if (usage.model) data.modelName = String(usage.model).slice(0, 100);
  if (Number.isInteger(usage.units)) data.outputUnits = usage.units;
  if (Number.isInteger(usage.estimated_cost_micros)) data.providerCostMicros = BigInt(usage.estimated_cost_micros);
  return data;
};

/**
 * Ghi ket qua: chan dung -> characters.portrait_image_key, canh -> story_scenes.image_key; tru han
 * credit da giu. Tra `null` neu ai_request da ket thuc noi khac (khong ghi gi).
 */
export async function persistImageResult(db, { aiRequestId, response }) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.aiRequest.updateMany({
      where: { id: aiRequestId, status: 'processing' },
      data: succeededData(response?.usage),
    });
    if (count === 0) return null;
    const request = await tx.aiRequest.findUniqueOrThrow({
      where: { id: aiRequestId },
      select: { userId: true, requestType: true, characterId: true, sceneId: true, storyId: true, creditsCharged: true },
    });
    if (request.requestType === AI_JOB.CHARACTER_PORTRAIT) {
      const key = response?.portrait_keys?.[0];
      if (!key) throw new Error('ai/ khong tra portrait_keys');
      await tx.character.updateMany({
        where: { id: request.characterId, deletedAt: null },
        data: { portraitImageKey: key, portraitStatus: 'ready' },
      });
    } else {
      if (!response?.image_key) throw new Error('ai/ khong tra image_key');
      await tx.storyScene.updateMany({ where: { id: request.sceneId }, data: { imageKey: response.image_key, imageStatus: 'ready' } });
    }
    if (request.creditsCharged > 0) await consumeCredit(tx, { userId: request.userId, aiRequestId });
    return request;
  }, TX_OPTIONS);
}

/** Ket thuc bang loi: chan dung / canh -> `failed`, hoan credit. Tra request, hoac null neu da ket thuc. */
export async function finalizeImageFailure(db, { aiRequestId, status, code, message }) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.aiRequest.updateMany({
      where: { id: aiRequestId, status: { in: ['queued', 'processing'] } },
      data: { status, errorMessage: formatErrorMessage(code, message), finishedAt: new Date() },
    });
    if (count === 0) return null;
    const request = await tx.aiRequest.findUniqueOrThrow({
      where: { id: aiRequestId },
      select: { userId: true, requestType: true, characterId: true, sceneId: true, storyId: true, creditsCharged: true },
    });
    if (request.requestType === AI_JOB.CHARACTER_PORTRAIT && request.characterId) {
      await tx.character.updateMany({
        where: { id: request.characterId, portraitStatus: { in: ['queued', 'generating'] } },
        data: { portraitStatus: 'failed' },
      });
    } else if (request.sceneId) {
      await tx.storyScene.updateMany({
        where: { id: request.sceneId, imageStatus: { in: ['queued', 'generating'] } },
        data: { imageStatus: 'failed' },
      });
    }
    if (request.creditsCharged > 0) {
      await releaseCredit(tx, { userId: request.userId, amount: request.creditsCharged, aiRequestId });
    }
    return request;
  }, TX_OPTIONS);
}
