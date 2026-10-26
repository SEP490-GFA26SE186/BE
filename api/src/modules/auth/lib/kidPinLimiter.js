// Chong do PIN thoat Kid Mode (phieu dang ky: "rate-limited exit PIN"): sai lien tiep MAX_ATTEMPTS lan
// -> khoa LOCK_MS. Dem trong bo nho cua tien trinh api (chi chay 1 container); khoi dong lai thi bo dem ve 0
// - chap nhan duoc vi nguoi do PIN khong tu khoi dong lai may chu duoc. Khong can migration.

export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60_000;

const state = new Map(); // parentId -> { failed, lockedUntil }

/** So mili-giay con bi khoa (0 = khong khoa). */
export function lockRemainingMs(parentId, now = Date.now()) {
  const s = state.get(parentId);
  if (!s?.lockedUntil) return 0;
  if (s.lockedUntil <= now) {
    state.delete(parentId);
    return 0;
  }
  return s.lockedUntil - now;
}

/** Ghi mot lan sai. Tra { locked, attemptsLeft }. */
export function recordFailure(parentId, now = Date.now()) {
  const s = state.get(parentId) ?? { failed: 0, lockedUntil: 0 };
  s.failed += 1;
  if (s.failed >= MAX_ATTEMPTS) {
    state.set(parentId, { failed: 0, lockedUntil: now + LOCK_MS });
    return { locked: true, attemptsLeft: 0 };
  }
  state.set(parentId, s);
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - s.failed };
}

export function reset(parentId) {
  state.delete(parentId);
}
