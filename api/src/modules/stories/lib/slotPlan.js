// Xep phien ban mau cau hoi vao cac o cham cua khung truyen AI (spec §6.1).
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../utils/ApiError.js';

/**
 * `slots`: cac `after` cua o `scored` theo thu tu. `subSkills`: ky nang con cua topic theo
 * `displayOrder`, moi cai kem `versions` (ban published moi nhat cua tung mau dang bat).
 * O thu i lay ky nang con dung duoc thu `i % n`; trong ky nang con chon ngau nhien mot phien ban.
 * Khong co nhan vat phu -> bo phien ban `needsTarget`; ky nang con het phien ban -> bo qua.
 * Tra ve [{ afterPageOrder, subSkillId, templateVersion }]. Khong o nao dien duoc -> 422.
 */
export function planSlots({ slots, subSkills, hasSecondary, rng = Math.random }) {
  if (slots.length === 0) return [];

  const usable = subSkills
    .map((s) => ({ ...s, versions: s.versions.filter((ver) => hasSecondary || !ver.needsTarget) }))
    .filter((s) => s.versions.length > 0);

  if (usable.length === 0) {
    const blockedByTarget = !hasSecondary && subSkills.some((s) => s.versions.length > 0);
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      blockedByTarget
        ? 'Các câu hỏi của bài học này đều hỏi về nhân vật khác, cần thêm ít nhất một nhân vật phụ.'
        : 'Bài học chưa có mẫu câu hỏi dùng được, vui lòng chọn chủ đề khác.',
    );
  }

  return slots.map((after, i) => {
    const sub = usable[i % usable.length];
    const pick = Math.min(Math.floor(rng() * sub.versions.length), sub.versions.length - 1);
    return { afterPageOrder: after, subSkillId: sub.id, templateVersion: sub.versions[pick] };
  });
}
