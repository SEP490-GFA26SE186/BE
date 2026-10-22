// Anh bia truyen = anh cua mot canh (story_scenes.image_key, 1024x1024, khong chu trong anh).
// stories.cover_scene_id: canh phu huynh chon; NULL = canh 1. Canh chua co anh -> null, Web tu ve
// bia du phong theo mau nang luc CASEL (`competency`).
//
// Moi doi tuong truyen Web hien deu kem `cover: { imageUrl, competency }`.

import { assetUrl } from '../../../clients/assetUrl.js';

/** Canh co anh dung duoc (giong ban sao dang ban: image_status ready + co key). */
export const READY_IMAGE = { imageStatus: 'ready', imageKey: { not: null } };

export const hasReadyImage = (scene) => Boolean(scene && scene.imageStatus === 'ready' && scene.imageKey);

/** Ky nang chinh: chu de -> nang luc cua chu de; family -> ky nang con vi tri 1. */
const COMPETENCY_SELECT = {
  topic: { select: { skill: { select: { caselCode: true } } } },
  subSkills: { where: { position: 1 }, select: { position: true, subSkill: { select: { skill: { select: { caselCode: true } } } } } },
};

/**
 * Select Prisma du cho formatCover (gan vao select / include cua story). Chi lay canh da co anh.
 * Luu y: khi include da co `topic` / `subSkills` / `scenes` rieng thi dung cac truong do (xem storyFormat).
 */
export const COVER_SELECT = {
  coverSceneId: true,
  scenes: { where: READY_IMAGE, select: { id: true, sceneOrder: true, imageKey: true, imageStatus: true } },
  ...COMPETENCY_SELECT,
};

/** casel_code cua ky nang chinh, hoac null (truyen tu viet khong chu de). */
export function coverCompetency(story) {
  const topicCode = story.topic?.skill?.caselCode;
  if (topicCode) return topicCode;
  const first = (story.subSkills ?? []).find((l) => l.position === 1) ?? null;
  return first?.subSkill?.skill?.caselCode ?? null;
}

/** Canh lam bia: canh da chon neu co anh, khong thi canh 1 neu co anh, khong thi null. */
export function coverScene(story) {
  const scenes = story.scenes ?? [];
  const chosen = story.coverSceneId ? scenes.find((s) => s.id === story.coverSceneId) : null;
  if (hasReadyImage(chosen)) return chosen;
  const first = scenes.find((s) => s.sceneOrder === 1);
  return hasReadyImage(first) ? first : null;
}

/** Key anh bia hieu luc (de chep sang listings.cover_image_key), hoac null. */
export const coverImageKey = (story) => coverScene(story)?.imageKey ?? null;

/**
 * `cover` cho client. `imageKey` (tuy chon) ghi de anh — listing co cover_image_key rieng.
 * @returns {{ imageUrl: string | null, competency: string | null }}
 */
export function formatCover(story, { imageKey } = {}) {
  const key = imageKey || coverImageKey(story);
  return { imageUrl: assetUrl(key), competency: coverCompetency(story) };
}
