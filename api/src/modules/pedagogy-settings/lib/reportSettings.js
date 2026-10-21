// Tham so bao cao EQ theo muc do (spec su pham CASEL §7) — Specialist sua qua /pedagogy/report-settings.
// Luu o platform_settings khoa eq_report.* (seed_platform_settings.js). Ham thuan, khong DB.

/** Mac dinh: 5 cau cham gan nhat, toi thieu 3 cau, < 50% lam quen, 50-79% phat trien, >= 80% vung. */
export const DEFAULT_REPORT_SETTINGS = Object.freeze({ window: 5, minItems: 3, developingFrom: 0.5, secureFrom: 0.8 });

const KEY_OF = {
  window: 'eq_report.window',
  minItems: 'eq_report.min_items',
  developingFrom: 'eq_report.developing_from',
  secureFrom: 'eq_report.secure_from',
};
export const REPORT_SETTING_KEYS = Object.values(KEY_OF);

/** rows: [{ key, value }] tu platform_settings -> { window, minItems, developingFrom, secureFrom }. */
export function parseReportSettings(rows) {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {};
  for (const [field, key] of Object.entries(KEY_OF)) {
    const n = Number(byKey.get(key));
    out[field] = byKey.has(key) && Number.isFinite(n) ? n : DEFAULT_REPORT_SETTINGS[field];
  }
  return out;
}

/** Nguoc lai: settings -> dong platform_settings de upsert. */
export const reportSettingsRows = (settings) =>
  Object.entries(KEY_OF).map(([field, key]) => ({ key, value: settings[field] }));
