// Dang ban + kiem duyet (rev8). Ham thuan, khong DB.
//
// Ban dang ban (stories.kind = published) la BAN SAO da go ca nhan hoa cua truyen rieng:
// - Nhan vat: token {NVn} giu nguyen, ten that (character_id) thay bang ten chung nguoi ban dat
//   (alias_name) — DBML story_characters: (character_id IS NOT NULL) <> (alias_name IS NOT NULL).
// - Bo `situation` (chuyen that cua gia dinh), bo moi audio (audio chua ten that — spec TTS §7),
//   use_tts = false, khong anh.
// - Ten that cua nhan vat va cua cac be tuyet doi khong duoc nam trong chu ban sao.
//
// Moderator chi duyet `approved` khi da xem 100% trang va tick dat du checklist (DBML moderation_reviews).

import { findLeftoverNames } from '../../stories/lib/names.js';

export const CLAIM_MINUTES = 30;

/**
 * Tu xung ho trong gia dinh: dat lam ten nhan vat ("Bà", "Mẹ") khong lam lo danh tinh, va trong chu
 * no la dai tu thuong gap ("Bà xin lỗi con"). Khong coi la ten that khi quet ban dang ban.
 */
const KINSHIP = new Set([
  'ông', 'bà', 'bố', 'ba', 'cha', 'mẹ', 'má', 'u', 'anh', 'chị', 'em', 'cô', 'chú', 'dì', 'cậu', 'mợ',
  'thím', 'bác', 'dượng', 'ông nội', 'bà nội', 'ông ngoại', 'bà ngoại', 'anh trai', 'chị gái', 'em gái', 'em trai',
]);

/** Ten that co the lo danh tinh (bo tu xung ho). */
export const identifyingNames = (names) =>
  [...new Set(names.map((n) => String(n ?? '').normalize('NFC').trim()).filter((n) => n && !KINSHIP.has(n.toLocaleLowerCase('vi'))))];
const ALIAS_MAX = 100;
const nfc = (s) => String(s ?? '').normalize('NFC').trim();

/**
 * Kiem bi danh: moi token cua truyen co mot ten chung, khong rong, khong trung nhau, khong la ten that.
 * @param {{ token: string }[]} storyCharacters
 * @param {{ token: string, aliasName: string }[]} aliases
 * @param {string[]} forbiddenNames ten nhan vat + ten cac be cua nguoi ban
 * @returns {{ path: string, message: string }[]} loi (rong = hop le)
 */
export function aliasErrors(storyCharacters, aliases, forbiddenNames) {
  const byToken = new Map((aliases ?? []).map((a) => [a.token, nfc(a.aliasName)]));
  const forbidden = new Set(identifyingNames(forbiddenNames).map((n) => n.toLocaleLowerCase('vi')));
  const seen = new Set();
  const errors = [];
  for (const { token } of storyCharacters) {
    const alias = byToken.get(token);
    const path = `aliases.${token}`;
    if (!alias) errors.push({ path, message: `Đặt tên chung cho nhân vật ${token}.` });
    else if (alias.length > ALIAS_MAX) errors.push({ path, message: `Tên tối đa ${ALIAS_MAX} ký tự.` });
    else if (forbidden.has(alias.toLocaleLowerCase('vi'))) errors.push({ path, message: 'Không dùng tên thật của bé / người nhà khi đăng bán.' });
    else if (seen.has(alias.toLocaleLowerCase('vi'))) errors.push({ path, message: 'Mỗi nhân vật một tên khác nhau.' });
    if (alias) seen.add(alias.toLocaleLowerCase('vi'));
  }
  for (const token of byToken.keys()) {
    if (!storyCharacters.some((c) => c.token === token)) errors.push({ path: `aliases.${token}`, message: 'Truyện không có nhân vật này.' });
  }
  return errors;
}

/**
 * Moi doan chu cua truyen (de quet ten that con sot) kem duong dan de bao loi. Khong gom ten truyen
 * goc: ban dang ban dung ten moi nguoi ban dat (listing.title, quet rieng).
 */
export function storyTexts(story) {
  const out = [];
  for (const p of story.pages ?? []) out.push({ path: `pages.${p.id}`, text: p.contentText });
  for (const c of story.checkpoints ?? []) {
    out.push({ path: `checkpoints.${c.id}`, text: [c.question, c.hint].filter(Boolean).join(' ') });
    for (const o of c.options ?? []) out.push({ path: `checkpoints.${c.id}`, text: [o.text, o.feedback].filter(Boolean).join(' ') });
  }
  return out.filter((t) => t.text);
}

/** Ten that con sot trong chu (chu da luu dang token, nen thuong rong). */
export function leftoverNameErrors(story, forbiddenNames, listingTitle) {
  const errors = [];
  forbiddenNames = identifyingNames(forbiddenNames);
  if (!forbiddenNames.length) return errors;
  for (const { path, text } of [...storyTexts(story), { path: 'listing.title', text: listingTitle }]) {
    const found = findLeftoverNames(text, forbiddenNames);
    if (found.length) errors.push({ path, message: `Còn tên thật: ${found.join(', ')}. Sửa lại trước khi đăng bán.` });
  }
  return errors;
}

/**
 * Tien do duyet: da xem bao nhieu trang, checklist da tick chua.
 * @param {string[]} pageIds   trang cua ban dang ban
 * @param {string[]} viewedIds trang Moderator da xem
 * @param {string[]} itemIds   muc checklist dang dung
 * @param {{ checklistItemId: string, passed: boolean }[]} results
 */
export function reviewProgress(pageIds, viewedIds, itemIds, results) {
  const viewed = new Set(viewedIds);
  const passed = new Set(results.filter((r) => r.passed).map((r) => r.checklistItemId));
  const pagesViewed = pageIds.filter((id) => viewed.has(id)).length;
  const checklistPassed = itemIds.filter((id) => passed.has(id)).length;
  return {
    pagesTotal: pageIds.length,
    pagesViewed,
    checklistTotal: itemIds.length,
    checklistPassed,
    canApprove: pagesViewed === pageIds.length && checklistPassed === itemIds.length,
  };
}

/** Quyet dinh -> trang thai listing. */
export const LISTING_STATUS_BY_DECISION = {
  approved: 'published',
  changes_requested: 'changes_requested',
  rejected: 'rejected',
};

/** Claim con hieu luc cua nguoi khac? */
export const claimedByOther = (review, moderatorId, now = new Date()) =>
  Boolean(review.moderatorId && review.moderatorId !== moderatorId && review.claimExpiresAt && review.claimExpiresAt > now);
