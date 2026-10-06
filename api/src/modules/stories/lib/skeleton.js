import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../utils/ApiError.js';

const NEEDS_TARGET = new Set(['emotion_other', 'perspective']);
const EMOTION_TYPES = new Set(['emotion_self', 'emotion_other']);
const CUSTOM_DEFAULT_PAGES = 4;

/**
 * Nhan vat chinh la {NV1}, con lai {NV2}, {NV3}... theo thu tu gui len.
 * Giu nguyen thu tu dau vao (khong sap xep lai).
 */
export function assignTokens(characters) {
  let next = 2;
  return characters.map((c) => ({
    characterId: c.characterId,
    token: c.isMain ? '{NV1}' : `{NV${next++}}`,
    isMain: c.isMain,
  }));
}

/** Token cua nhan vat phu dau tien; null neu truyen chi co mot nhan vat. */
export function defaultTarget(storyCharacters) {
  return storyCharacters.find((c) => !c.isMain)?.token ?? null;
}

/**
 * Dung khung truyen tu layout. `answerEmotion = 'neutral'` la gia tri tam cho kieu cam xuc
 * (CHECK trong DB bat buoc NOT NULL); "da viet" xac dinh bang `question`.
 */
export function buildSkeleton({ length, layouts, customLimits, storyCharacters }) {
  if (length === 'custom') {
    const pageCount = Math.min(Math.max(CUSTOM_DEFAULT_PAGES, customLimits.minPages), customLimits.maxPages);
    return { pageCount, checkpoints: [] };
  }

  const layout = layouts[length];
  if (!layout) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, `Độ dài truyện "${length}" không hợp lệ.`);
  }

  const target = defaultTarget(storyCharacters);
  if (!target && layout.checkpoints.some((c) => NEEDS_TARGET.has(c.type))) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Truyện độ dài này có câu hỏi về nhân vật khác, cần thêm ít nhất một nhân vật phụ.',
    );
  }

  return {
    pageCount: layout.pages,
    checkpoints: layout.checkpoints.map((c) => ({
      type: c.type,
      afterPageOrder: c.after,
      targetToken: NEEDS_TARGET.has(c.type) ? target : null,
      answerEmotion: EMOTION_TYPES.has(c.type) ? 'neutral' : null,
    })),
  };
}
