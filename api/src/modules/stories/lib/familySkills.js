// Ky nang con cho truyen "Ke chuyen nha minh" (spec family-story §5.2, §6.1). Ham thuan, khong DB.
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../utils/ApiError.js';

/** Khong co be gan voi nhan vat chinh -> do tuoi mac dinh. */
export const DEFAULT_AGE_RANGE = { ageMin: 5, ageMax: 8 };
/** Toi da so ky nang "be dang can" gui AI. */
export const MAX_NEEDS = 5;
// Hang uu tien "be dang can": Dang lam quen -> chua du du lieu -> Dang phat trien -> Vung.
const NEED_RANK = { emerging: 0, null: 1, developing: 2, secure: 3 };

/** Tuoi cua be -> { ageMin, ageMax } cho prompt; null -> 5-8. ai/ can so nguyen duong nen be duoi 1 tuoi -> 1. */
export const ageRangeOf = (age) => {
  if (age == null) return { ...DEFAULT_AGE_RANGE };
  const a = Math.max(1, age);
  return { ageMin: a, ageMax: a };
};

/**
 * Ky nang con (moi cai kem `templates[{ answerFormat, versions[] }]`, versions = ban published moi
 * nhat cua mau dang bat) -> danh muc dung duoc: moi phan tu kem `versions` (da gan `answerFormat`).
 * Khong co nhan vat phu -> bo phien ban `needsTarget`; het phien ban -> loai. Loc theo tuoi
 * (`ageMin <= tuoi <= ageMax`, khoang tuoi giao nhau neu khong biet tuoi); loc xong rong -> bo loc tuoi.
 * Giu thu tu dau vao.
 */
export function buildUsableCatalog(subSkills, { hasSecondary, ageRange = DEFAULT_AGE_RANGE }) {
  const usable = subSkills
    .filter((s) => s.isActive !== false)
    .map((s) => ({
      ...s,
      versions: (s.templates ?? [])
        .flatMap((t) => (t.versions ?? []).map((v) => ({ ...v, answerFormat: t.answerFormat })))
        .filter((v) => hasSecondary || !v.needsTarget),
    }))
    .filter((s) => s.versions.length > 0);
  const byAge = usable.filter(
    (s) => (s.ageMin ?? DEFAULT_AGE_RANGE.ageMin) <= ageRange.ageMax && (s.ageMax ?? DEFAULT_AGE_RANGE.ageMax) >= ageRange.ageMin,
  );
  return byAge.length > 0 ? byAge : usable;
}

/** Tron ngau nhien (Fisher-Yates) mot ban sao. */
const shuffle = (list, rng) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(Math.floor(rng() * (i + 1)), i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * "Be dang can" trong danh muc dung duoc. `levels`: Map subSkillId -> 'emerging'|'developing'|'secure'|null,
 * hoac null khi nhan vat chinh khong gan be (-> lay ngau nhien). Cung hang thi ngau nhien. Tra ve ky nang con.
 */
export function rankNeeds(catalog, levels, { rng = Math.random, max = MAX_NEEDS } = {}) {
  const shuffled = shuffle(catalog, rng);
  if (!levels) return shuffled.slice(0, max);
  const rank = (s) => NEED_RANK[levels.get(s.id) ?? 'null'];
  // sort on dinh: giu thu tu ngau nhien trong cung hang
  return shuffled.sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

/** O cham "ngay sau khoanh khac": o thu hai, hoac o cuoi neu chi co mot o. */
export const anchorSlotIndex = (count) => (count >= 2 ? 1 : count - 1);

/**
 * Xep phien ban mau vao o cham cho truyen family (spec §6.1). `subSkills` theo thu tu xac nhan
 * (dau = ky nang chinh), moi cai kem `versions` (da loc theo nhan vat phu, xem buildUsableCatalog).
 * O neo (anchorSlotIndex) luon lay ky nang chinh; cac o con lai xoay vong tu ky nang chinh.
 * Ky nang chinh khong dung duoc -> 422 "phan tich lai". Tra ve dang planSlots.
 */
export function planFamilySlots({ slots, subSkills, rng = Math.random }) {
  if (slots.length === 0) return [];
  const [main] = subSkills;
  if (!main || main.versions.length === 0) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Kỹ năng chính của truyện hiện chưa có câu hỏi dùng được. Hãy bấm "Xem bé sẽ tập gì" để phân tích lại.',
    );
  }
  const usable = subSkills.filter((s) => s.versions.length > 0);
  const anchor = anchorSlotIndex(slots.length);
  const pick = (sub) => sub.versions[Math.min(Math.floor(rng() * sub.versions.length), sub.versions.length - 1)];
  let j = 0;
  return slots.map((after, i) => {
    const sub = i === anchor ? main : usable[j++ % usable.length];
    return { afterPageOrder: after, subSkillId: sub.id, templateVersion: pick(sub) };
  });
}

/**
 * Trang neo cua khoanh khac / tinh tiet (spec A.2): trang ngay truoc diem dung cham thu hai (o cham
 * cuoi neu chi co mot); truyen khong cham -> trang ap cuoi. `checkpoints`: [{ type, afterPageOrder }].
 * Tra ve pageOrder.
 */
export function anchorPageOrder(pages, checkpoints) {
  const scored = checkpoints
    .filter((c) => c.type !== 'reflection')
    .sort((a, b) => a.afterPageOrder - b.afterPageOrder);
  if (scored.length > 0) return scored[anchorSlotIndex(scored.length)].afterPageOrder;
  const orders = pages.map((p) => p.pageOrder).sort((a, b) => a - b);
  return orders.length >= 2 ? orders[orders.length - 2] : orders[0];
}
