// Giam sat noi dung (rev8 luong 7): bao cao -> tu tam go, canh cao tac gia, kiem tra ngau nhien.
// Ham thuan; doc / ghi DB o monitoring.service.js.

export const DAY_MS = 86_400_000;

// Truyen vua duoc Specialist xem (duyet dang ban, kiem tra, xu ly bao cao) trong khoang nay thi kiem tra ngau
// nhien bo qua: vua duyet xong ma bi chon kiem lai la phi cong. Moc tinh theo decided_at cua moi loai luot duyet.
export const AUDIT_COOLDOWN_DAYS = 30;

/** Mac dinh khi platform_settings chua co khoa moderation.* (Admin sua o buoc 4). */
export const MODERATION_DEFAULTS = {
  reportThreshold: 3, // so nguoi KHAC NHAU bao cao trong 24 gio -> tu tam go
  strikeLimit: 3, // canh cao con hieu luc -> khoa tai khoan ban
  strikeValidDays: 90,
  auditPerWeek: 3, // so truyen dang ban duoc chon kiem tra ngau nhien moi tuan
};

const SETTING_KEYS = {
  reportThreshold: 'moderation.report_threshold',
  strikeLimit: 'moderation.strike_limit',
  strikeValidDays: 'moderation.strike_valid_days',
  auditPerWeek: 'moderation.audit_per_week',
};
export const MODERATION_SETTING_KEYS = Object.values(SETTING_KEYS);

/** rows: [{ key, value }] -> cau hinh; gia tri thieu / sai (khong phai so nguyen duong) -> mac dinh. */
export function parseModerationSettings(rows = []) {
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  return Object.fromEntries(
    Object.entries(SETTING_KEYS).map(([name, key]) => {
      const v = map.get(key);
      return [name, Number.isInteger(v) && v > 0 ? v : MODERATION_DEFAULTS[name]];
    }),
  );
}

export const REPORT_CATEGORY_LABELS = {
  scary: 'Gây sợ hãi',
  violent: 'Bạo lực',
  inappropriate_lesson: 'Bài học không phù hợp',
  personal_info: 'Lộ thông tin cá nhân',
  technical_error: 'Lỗi kỹ thuật',
  other: 'Khác',
};

/** So nguoi khac nhau trong cac bao cao (24 gio gan nhat) da toi nguong tu tam go chua. */
export const reachesThreshold = (reporterIds, threshold) => new Set(reporterIds).size >= threshold;

export const strikeExpiry = (issuedAt, validDays) => new Date(issuedAt.getTime() + validDays * DAY_MS);

/** Canh cao con hieu luc: chua thu hoi va chua het han. */
export const isStrikeActive = (strike, now = new Date()) => !strike.revokedAt && strike.expiresAt > now;

/**
 * Quyet dinh hop le theo loai luot duyet. Luot nop ban: duyet / yeu cau sua / tu choi.
 * Luot hau kiem (bao cao, ngau nhien) tren truyen da ban: giu (khoi phuc) hoac go han.
 */
export const DECISIONS_BY_REVIEW_TYPE = {
  submission: ['approved', 'changes_requested', 'rejected'],
  report_followup: ['approved', 'taken_down'],
  random_audit: ['approved', 'taken_down'],
};

/** Quyet dinh -> trang thai listing. */
export const LISTING_STATUS_BY_DECISION = {
  approved: 'published',
  changes_requested: 'changes_requested',
  rejected: 'rejected',
  taken_down: 'archived',
};

/** Trang thai listing khien be TAM KHONG doc duoc ban da mua (dang tam go / da go han). */
export const BLOCKED_LISTING_STATUSES = ['suspended', 'archived'];

/** Kiem tra ngau nhien: tuan nay da chon chua (co luot random_audit tao trong 7 ngay qua). */
export const auditDue = (lastAuditCreatedAt, now = new Date()) => !lastAuditCreatedAt || now - lastAuditCreatedAt >= 7 * DAY_MS;
