// Luat cua editor (spec §4.2). Ham thuan, khong DB.
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../utils/ApiError.js';
import { missingCheckpointFields } from './completeness.js';
import { defaultTarget } from './skeleton.js';

const EMOTION_TYPES = new Set(['emotion_self', 'emotion_other']);
const NEEDS_TARGET = new Set(['emotion_other', 'perspective']);

// Truong phuong an theo kieu (bang "Cac kieu diem dung", ai/docs/03). Kieu khong co o day thi
// khong co phuong an.
const OPTION_RULES = {
  perspective: { required: ['isCorrect'], allowed: new Set(['text', 'isCorrect']) },
  problem_solving: { required: ['role'], allowed: new Set(['text', 'role', 'feedback']) },
};
const OPTION_FIELDS = ['text', 'role', 'isCorrect', 'feedback'];
const OPTION_COUNT = 3;

const filled = (v) => typeof v === 'string' && v.trim() !== '';

/** Chuoi trong / toan khoang trang / null -> null (coi nhu xoa trang). */
export const blankToNull = (text) => (filled(text) ? text : null);

/** Nguoi sua chu cua AI -> `ai_edited`; `human`, `ai_edited` giu nguyen. */
export const editedOrigin = (origin) => (origin === 'ai' ? 'ai_edited' : origin);

/**
 * Kiem hinh dang ban sua diem dung theo kieu. Cho luu nhap (chu trong van duoc) — du truong hay
 * chua la viec cua review. Sai -> 400 kem danh sach { path, message }.
 * body: { question?, hint?, answerEmotion?, options? } (da qua zod).
 */
export function checkCheckpointEdit(type, body) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });

  if (EMOTION_TYPES.has(type)) {
    // CHECK cua DB bat answer_emotion NOT NULL; khung dat 'neutral' tam, nen khi viet cau hoi phai
    // chon dap an that cung luc (spec §5.2).
    if (filled(body.question) && body.answerEmotion === undefined) {
      err('answerEmotion', 'Cần chọn cảm xúc đúng khi viết câu hỏi cảm xúc');
    }
  } else if (body.answerEmotion !== undefined) {
    err('answerEmotion', 'Chỉ điểm dừng hỏi về cảm xúc mới có đáp án cảm xúc');
  }

  if (body.options !== undefined) {
    const rule = OPTION_RULES[type];
    if (!rule) {
      err('options', 'Điểm dừng kiểu này không có phương án');
    } else if (body.options.length !== OPTION_COUNT) {
      err('options', `Cần đúng ${OPTION_COUNT} phương án`);
    } else {
      body.options.forEach((opt, i) => {
        for (const field of OPTION_FIELDS) {
          const present = opt[field] !== undefined && opt[field] !== null;
          if (present && !rule.allowed.has(field)) {
            err(`options.${i}.${field}`, 'Trường này không dùng cho kiểu điểm dừng này');
          }
        }
        for (const field of rule.required) {
          if (opt[field] === undefined || opt[field] === null) err(`options.${i}.${field}`, 'Thiếu trường bắt buộc');
        }
      });
      if (errors.length === 0 && type === 'perspective' && body.options.filter((o) => o.isCorrect === true).length !== 1) {
        err('options', 'Cần đúng một phương án đúng');
      }
      if (errors.length === 0 && type === 'problem_solving' && new Set(body.options.map((o) => o.role)).size !== OPTION_COUNT) {
        err('options', 'Ba phương án phải có đủ ba vai constructive, avoidant, impulsive, mỗi vai một lần');
      }
    }
  }

  if (errors.length > 0) throw ApiError.badRequest('Nội dung điểm dừng không hợp lệ', errors);
}

/** Cot co dinh cua diem dung moi. Kieu cam xuc: answerEmotion 'neutral' tam (CHECK cua DB). */
export const newCheckpointFields = (type, targetToken) => ({
  type,
  targetToken: NEEDS_TARGET.has(type) ? targetToken : null,
  answerEmotion: EMOTION_TYPES.has(type) ? 'neutral' : null,
});

/**
 * `target_token` cho diem dung moi. emotion_other/perspective: token gui len (phai la nhan vat phu
 * cua truyen) hoac nhan vat phu dau tien. Kieu khac: null.
 * storyCharacters: [{ token, isMain }].
 */
export function resolveCheckpointTarget(type, requested, storyCharacters) {
  if (!NEEDS_TARGET.has(type)) return null;
  const fail = (message) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message);

  if (requested == null) {
    const target = defaultTarget(storyCharacters);
    if (!target) throw fail('Câu hỏi về nhân vật khác cần truyện có ít nhất một nhân vật phụ.');
    return target;
  }
  const found = storyCharacters.find((c) => c.token === requested);
  if (!found || found.isMain) throw fail('Nhân vật được hỏi phải là một nhân vật phụ của truyện.');
  return requested;
}

/** Khung truyen tu cac dong DB, dang assertCustomLayout nhan. */
export function customLayoutFromRows(pages, checkpoints) {
  const orderById = new Map(pages.map((p) => [p.id, p.pageOrder]));
  return {
    pageCount: pages.length,
    checkpoints: checkpoints.map((c) => ({ type: c.type, afterPageOrder: orderById.get(c.afterPageId) })),
  };
}

/**
 * Cho con thieu truoc khi review: trang chua co chu, diem dung thieu truong theo kieu.
 * pages: [{ id, pageOrder, contentText }]; checkpoints: [{ id, afterPageId, type, question, hint, options }].
 * Tra ve [{ path, message }] theo thu tu trang; [] la du.
 */
export function findReviewGaps({ pages, checkpoints }) {
  const sorted = [...pages].sort((a, b) => a.pageOrder - b.pageOrder);
  const orderById = new Map(sorted.map((p) => [p.id, p.pageOrder]));

  const pageGaps = sorted
    .filter((p) => !filled(p.contentText))
    .map((p) => ({ path: `pages.${p.id}`, message: `Trang ${p.pageOrder} chưa có chữ` }));

  const checkpointGaps = checkpoints
    .map((c) => ({ c, at: orderById.get(c.afterPageId), missing: missingCheckpointFields(c) }))
    .filter((x) => x.missing.length > 0)
    .sort((a, b) => a.at - b.at)
    .map(({ c, at, missing }) => ({
      path: `checkpoints.${c.id}`,
      message: `Điểm dừng sau trang ${at} còn thiếu: ${missing.join(', ')}`,
    }));

  return [...pageGaps, ...checkpointGaps];
}
