// Cau hinh Admin duoc sua (platform_settings). Chi khoa trong danh sach nay — cac khoa khac (bo cuc truyen,
// gioi han chu cho AI...) la cau hinh su pham / ky thuat, sua sai lam hong luong sinh truyen.
// Ham thuan.

const int = (min, max) => ({ type: 'int', min, max });

export const SETTINGS_REGISTRY = {
  'ai_cost.story_text.short': {
    group: 'ai', label: 'Credit cho truyện AI ngắn', unit: 'credit', ...int(0, 100), default: 1,
    hint: 'Theo độ dài truyện (số trang ở story_layout.short). Trừ khi bắt đầu viết, hoàn lại nếu lỗi. 0 = miễn phí.',
  },
  'ai_cost.story_text.medium': {
    group: 'ai', label: 'Credit cho truyện AI vừa', unit: 'credit', ...int(0, 100), default: 2,
    hint: 'Theo độ dài truyện (số trang ở story_layout.medium). Chỉ áp dụng cho lần viết mới.',
  },
  'ai_cost.story_text.long': {
    group: 'ai', label: 'Credit cho truyện AI dài', unit: 'credit', ...int(0, 100), default: 3,
    hint: 'Theo độ dài truyện (số trang ở story_layout.long). Chỉ áp dụng cho lần viết mới.',
  },
  'finance.usd_vnd': {
    group: 'ai', label: 'Tỉ giá quy đổi chi phí AI', unit: 'đ / 1 USD', ...int(15_000, 40_000), default: 26_000,
    hint: 'Chi phí nhà cung cấp AI ghi bằng USD; chỉ dùng cho báo cáo.',
  },
  'market.seller_share_rate': {
    group: 'market', label: 'Phần người bán nhận', unit: '%', type: 'rate', min: 0.5, max: 0.95, default: 0.8,
    hint: 'Chốt vào từng đơn lúc mua; đổi chỉ áp dụng cho đơn mới.',
  },
  'market.earning_hold_days': {
    group: 'market', label: 'Số ngày giữ doanh thu trước khi rút được', unit: 'ngày', ...int(1, 30), default: 3,
    hint: 'Phải lớn hơn hoặc bằng thời hạn yêu cầu hoàn tiền.',
  },
  'market.refund_window_days': {
    group: 'market', label: 'Thời hạn yêu cầu hoàn tiền', unit: 'ngày', ...int(1, 30), default: 3,
    hint: 'Tính từ lúc thanh toán. Không vượt số ngày giữ doanh thu.',
  },
  'market.min_withdrawal_vnd': {
    group: 'market', label: 'Mức rút tối thiểu', unit: 'đ', ...int(10_000, 10_000_000), default: 50_000,
  },
  'moderation.report_threshold': {
    group: 'moderation', label: 'Số phụ huynh báo cáo trong 24 giờ để tự tạm gỡ', unit: 'người', ...int(1, 50), default: 3,
  },
  'moderation.strike_limit': {
    group: 'moderation', label: 'Số cảnh cáo còn hiệu lực thì khoá tài khoản bán', unit: 'cảnh cáo', ...int(1, 10), default: 3,
  },
  'moderation.strike_valid_days': {
    group: 'moderation', label: 'Thời hạn hiệu lực của cảnh cáo', unit: 'ngày', ...int(7, 365), default: 90,
  },
  'moderation.audit_per_week': {
    group: 'moderation', label: 'Số truyện kiểm tra ngẫu nhiên mỗi tuần', unit: 'truyện', ...int(1, 50), default: 3,
  },
};

export const SETTING_GROUPS = {
  ai: 'Chi phí AI',
  market: 'Chợ truyện & hoàn tiền',
  moderation: 'Giám sát nội dung',
};

/** Gia tri moi hop le? Tra thong bao loi tieng Viet, hoac null. `all` = gia tri hien tai moi khoa (rang buoc cheo). */
export function settingError(key, value, all = {}) {
  const def = SETTINGS_REGISTRY[key];
  if (!def) return 'Khoá cấu hình này không được sửa ở đây.';
  if (typeof value !== 'number' || Number.isNaN(value)) return `${def.label}: phải là số.`;
  if (def.type === 'int' && !Number.isInteger(value)) return `${def.label}: phải là số nguyên.`;
  if (value < def.min || value > def.max) {
    const show = (v) => (def.type === 'rate' ? `${Math.round(v * 100)}%` : `${v}`);
    return `${def.label}: trong khoảng ${show(def.min)}–${show(def.max)}.`;
  }
  const hold = key === 'market.earning_hold_days' ? value : all['market.earning_hold_days'];
  const window = key === 'market.refund_window_days' ? value : all['market.refund_window_days'];
  if (hold != null && window != null && window > hold) {
    return 'Thời hạn hoàn tiền không được dài hơn số ngày giữ doanh thu (tiền hoàn lấy lại từ doanh thu đang giữ).';
  }
  return null;
}

/** rows [{ key, value, updatedAt, updater }] -> danh sach theo registry (thieu dong -> gia tri mac dinh). */
export function describeSettings(rows) {
  const map = new Map(rows.map((r) => [r.key, r]));
  return Object.entries(SETTINGS_REGISTRY).map(([key, def]) => {
    const row = map.get(key);
    return {
      key,
      group: def.group,
      label: def.label,
      hint: def.hint ?? null,
      unit: def.unit,
      type: def.type,
      min: def.min,
      max: def.max,
      value: row ? Number(row.value) : def.default,
      isDefault: !row,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updater?.fullName ?? null,
    };
  });
}
