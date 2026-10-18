// Goi + thanh toan (rev8, DBML plans / subscriptions / orders). Ham thuan, khong DB.
//
// - Tra truoc, gia han thu cong (payOS VietQR khong tru tien dinh ky).
// - Moi goi cap `credits_per_month` moi thang (ke ca goi nam); credit du het han khi sang thang moi.
// - Mua / nang goi giua ky: ky moi bat dau ngay, cap du credit goi moi, credit con lai GIU mot lan.
// - Goi Mien phi cung la mot dong subscriptions, tu gia han hang thang.

export const FREE_PLAN_CODE = 'FREE';
/** Han thanh toan mot don payOS (phut). */
export const ORDER_TTL_MINUTES = 15;

/** Cong `months` thang theo lich, giu ngay (31/01 + 1 -> 28/02 hoac 29/02, khong nhay sang thang 3). */
export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Ky moi cua goi bat dau luc `now`. Lan cap credit tiep theo: sau 1 thang (hoac het ky neu som hon). */
export function newPeriod(plan, now = new Date()) {
  const periodEnd = addMonths(now, plan.durationMonths);
  const nextGrant = addMonths(now, 1);
  return { periodStart: now, periodEnd, nextCreditGrantAt: nextGrant < periodEnd ? nextGrant : periodEnd };
}

/**
 * Viec cron phai lam voi mot subscription active da toi `next_credit_grant_at`.
 * - Con trong ky: 'grant' (het han credit cu, cap thang moi), lan cap ke tiep +1 thang.
 * - Het ky: goi Mien phi -> 'renew_free' (ky mien phi moi); goi tra phi -> 'expire' (ve Mien phi).
 * @returns {{ action: 'none' | 'grant' | 'renew_free' | 'expire', nextCreditGrantAt?: Date, monthIndex?: number }}
 */
export function cycleAction(sub, plan, now = new Date()) {
  if (sub.status !== 'active' || now < sub.nextCreditGrantAt) return { action: 'none' };
  if (sub.nextCreditGrantAt < sub.periodEnd) {
    const next = addMonths(sub.nextCreditGrantAt, 1);
    return {
      action: 'grant',
      nextCreditGrantAt: next < sub.periodEnd ? next : sub.periodEnd,
      monthIndex: monthsBetween(sub.periodStart, sub.nextCreditGrantAt),
    };
  }
  return { action: plan.code === FREE_PLAN_CODE ? 'renew_free' : 'expire' };
}

/** So thang tron giua hai moc (de dat key cap credit tat dinh: thang 0, 1, 2...). */
export function monthsBetween(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  let n = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) n -= 1;
  return Math.max(0, n);
}

/** orderCode payOS: so nguyen duong <= 2^53 - 1, khong trung (unique trong DB la chot cuoi). */
export function newOrderCode(now = Date.now(), rand = Math.random()) {
  return Number(`${String(now).slice(-10)}${String(Math.floor(rand * 900) + 100)}`);
}

/**
 * Noi dung chuyen khoan payOS: "SW" + 7 so cuoi orderCode = 9 ky tu — gioi han cua tai khoan ngan
 * hang KHONG lien ket qua payOS (docs payOS). Doi soat dua vao orderCode, khong dua vao noi dung.
 */
export const payosDescription = (orderCode) => `SW${String(orderCode).slice(-7)}`;

/** BigInt -> Number cho JSON (gia VND nho hon 2^53). */
export const vnd = (v) => (v == null ? null : Number(v));

export const formatPlan = (p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  durationMonths: p.durationMonths,
  priceVnd: vnd(p.priceVnd),
  creditsPerMonth: p.creditsPerMonth,
  maxChildren: p.maxChildren,
  maxCharacters: p.maxCharacters,
  canSell: p.canSell,
});

export const formatOrder = (o) => ({
  id: o.id,
  status: o.status,
  totalVnd: vnd(o.totalVnd),
  payosOrderCode: o.payosOrderCode == null ? null : Number(o.payosOrderCode),
  paidAt: o.paidAt,
  expiresAt: o.expiresAt,
  createdAt: o.createdAt,
  items: (o.items ?? []).map((i) => ({ itemType: i.itemType, planId: i.planId, listingId: i.listingId, unitPriceVnd: vnd(i.unitPriceVnd), plan: i.plan ? formatPlan(i.plan) : undefined })),
});
