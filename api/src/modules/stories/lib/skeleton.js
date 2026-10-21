import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../utils/ApiError.js';
import { checkpointTypeFor } from '../../question-templates/lib/templateRules.js';

const EMOTION_TYPES = new Set(['emotion_self', 'emotion_other']);
// CHECK DB: chi emotion_other / perspective duoc co target_token.
const TARGET_TYPES = new Set(['emotion_other', 'perspective']);
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
 * Dung khung truyen tu layout + `plan` (planSlots: moi o `scored` mot phien ban mau). Kieu
 * checkpoint suy tu dang tra loi cua mau. `answerEmotion = 'neutral'` la gia tri tam cho kieu cam
 * xuc (CHECK trong DB bat buoc NOT NULL); "da viet" xac dinh bang `question`. O `reflection` khong cham.
 */
export function buildSkeleton({ length, layouts, customLimits, storyCharacters, plan = [] }) {
  if (length === 'custom') {
    const pageCount = Math.min(Math.max(CUSTOM_DEFAULT_PAGES, customLimits.minPages), customLimits.maxPages);
    return { pageCount, checkpoints: [] };
  }

  const layout = layouts[length];
  if (!layout) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, `Độ dài truyện "${length}" không hợp lệ.`);
  }

  const target = defaultTarget(storyCharacters);
  const planByAfter = new Map(plan.map((p) => [p.afterPageOrder, p]));

  const checkpoints = layout.checkpoints.map((c) => {
    if (c.type === 'reflection') {
      return {
        type: 'reflection', afterPageOrder: c.after, targetToken: null, answerEmotion: null,
        subSkillId: null, templateVersionId: null, templateVersion: null, scored: false,
      };
    }
    const slot = planByAfter.get(c.after);
    if (!slot) throw new Error(`buildSkeleton: thieu phien ban mau cho o sau trang ${c.after}`);
    const version = slot.templateVersion;
    const format = version.answerFormat ?? version.template?.answerFormat;
    const type = checkpointTypeFor(format, version.needsTarget);
    if (version.needsTarget && !target) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        'Truyện độ dài này có câu hỏi về nhân vật khác, cần thêm ít nhất một nhân vật phụ.',
      );
    }
    return {
      type,
      afterPageOrder: c.after,
      targetToken: version.needsTarget && TARGET_TYPES.has(type) ? target : null,
      answerEmotion: EMOTION_TYPES.has(type) ? 'neutral' : null,
      subSkillId: slot.subSkillId,
      templateVersionId: version.id,
      templateVersion: version,
      scored: true,
    };
  });

  return { pageCount: layout.pages, checkpoints };
}
