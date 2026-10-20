import ApiError from '../../../utils/ApiError.js';

const LAYOUT_SIZES = ['short', 'medium', 'long'];
// O cham dien bang mau cau hoi cua ky nang con (spec §6.1); reflection o cuoi khong cham.
const SLOT_TYPES = new Set(['scored', 'reflection']);
const LIMIT_KEYS = [
  'page_min_words',
  'page_max_words',
  // Muc AI nham toi; min/max van la bien cung cua validator (ai/docs/01, 2026-10-15)
  'page_target_min_words',
  'page_target_max_words',
  'sentence_max_words',
  'question_max_words',
  'option_max_words',
  'hint_max_words',
  'feedback_max_words',
  'max_scenes',
];
const CUSTOM_LIMIT_KEYS = { min_pages: 'minPages', max_pages: 'maxPages', max_checkpoints: 'maxCheckpoints' };
// Credit cho mot lan AI viet truyen, theo do dai (ai_cost.story_text.<length>).
export const COST_KEYS = Object.fromEntries(LAYOUT_SIZES.map((size) => [size, `ai_cost.story_text.${size}`]));

const isPosInt = (v) => Number.isInteger(v) && v > 0;

/**
 * Kiem tra + gom cac dong platform_settings thanh StorySettings.
 * Loi cau hinh la loi 500 (thieu seed / Admin nhap sai), khong phai loi nguoi dung.
 */
export function parseStorySettings(rows) {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const missing = [];
  const invalid = [];

  const need = (key) => {
    if (!map.has(key) || map.get(key) === null || map.get(key) === undefined) {
      missing.push(key);
      return undefined;
    }
    return map.get(key);
  };

  const layouts = {};
  for (const size of LAYOUT_SIZES) {
    const key = `story_layout.${size}`;
    const v = need(key);
    if (v === undefined) continue;
    const ok =
      v && isPosInt(v.pages) && Array.isArray(v.checkpoints) &&
      v.checkpoints.every(
        (c) => c && SLOT_TYPES.has(c.type) && isPosInt(c.after) && c.after <= v.pages,
      );
    if (!ok) {
      invalid.push(`${key} (cần pages > 0 và mỗi checkpoint có type scored/reflection, after trong 1..pages)`);
      continue;
    }
    layouts[size] = {
      pages: v.pages,
      checkpoints: v.checkpoints.map((c) => ({ type: c.type, after: c.after })),
    };
  }

  const limits = {};
  for (const k of LIMIT_KEYS) {
    const key = `limits.${k}`;
    const v = need(key);
    if (v === undefined) continue;
    if (!isPosInt(v)) invalid.push(`${key} (cần số nguyên dương)`);
    else limits[k] = v;
  }
  // ai/ tu choi request neu thu tu sai (422); bao som o day thanh loi cau hinh cho Admin.
  const { page_min_words: lo, page_target_min_words: tlo, page_target_max_words: thi,
    page_max_words: hi } = limits;
  if ([lo, tlo, thi, hi].every(isPosInt) && !(lo <= tlo && tlo <= thi && thi <= hi)) {
    invalid.push(
      'limits.page_target_* (cần page_min_words <= page_target_min_words <= ' +
      'page_target_max_words <= page_max_words)',
    );
  }

  const customLimits = {};
  for (const [k, camel] of Object.entries(CUSTOM_LIMIT_KEYS)) {
    const key = `custom_limits.${k}`;
    const v = need(key);
    if (v === undefined) continue;
    if (!isPosInt(v)) invalid.push(`${key} (cần số nguyên dương)`);
    else customLimits[camel] = v;
  }

  const storyTextCost = {};
  for (const [size, key] of Object.entries(COST_KEYS)) {
    const cost = need(key);
    if (cost === undefined) continue;
    if (!Number.isInteger(cost) || cost < 0) invalid.push(`${key} (cần số nguyên không âm)`);
    else storyTextCost[size] = cost;
  }

  const problems = [];
  if (missing.length) problems.push(`thiếu khoá: ${missing.join(', ')}`);
  if (invalid.length) problems.push(`giá trị không hợp lệ: ${invalid.join('; ')}`);
  if (problems.length) {
    throw ApiError.internal(`Cấu hình truyện chưa đầy đủ (chạy lại seed): ${problems.join(' | ')}`);
  }

  return { layouts, limits, customLimits, storyTextCost };
}

/** Doc cau hinh truyen tu platform_settings. `db` la prisma hoac transaction client. */
export async function loadStorySettings(db) {
  const rows = await db.platformSetting.findMany({
    where: {
      OR: [
        { key: { startsWith: 'story_layout.' } },
        { key: { startsWith: 'limits.' } },
        { key: { startsWith: 'custom_limits.' } },
        { key: { startsWith: 'ai_cost.story_text.' } },
      ],
    },
    select: { key: true, value: true },
  });
  return parseStorySettings(rows);
}
