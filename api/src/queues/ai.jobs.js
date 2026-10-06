/**
 * Hang so cua queue `ai` — KHONG co side effect.
 *
 * Tach rieng khoi ai.queue.js vi file do khoi tao Queue (va qua do mo ket noi
 * Redis) ngay luc import. Neu de hang so o day thi aiClient.js va test co the
 * doc ten job ma khong can Redis chay.
 */
export const AI_QUEUE_NAME = 'ai';

// Ten job = loai noi dung can sinh (khop enum `ai_request_type` trong DBML),
// va cung la key de worker chon endpoint tuong ung o ai/. Doi chuoi nay la
// doi contract — xem docs/contracts/ai-service.md.
export const AI_JOB = {
  STORY_TEXT: 'story_text',
  CHARACTER_PORTRAIT: 'character_portrait',
  SCENE_IMAGE: 'scene_image',
  NARRATION: 'narration',
};
