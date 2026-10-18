// Tai chinh (rev8): doanh thu, hoa hong, chi phi AI, lai lo, doi soat. Ham thuan tren du lieu da truy van.
// Tien la so nguyen VND (bigint o DB -> Number o day; du an capstone, tong << 2^53).

export const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** Ngay theo gio Viet Nam (YYYY-MM-DD) — gom chuoi theo ngay. */
export const vnDay = (date) => new Date(new Date(date).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** Khoang thoi gian: 'today' | '7d' | '30d' | '90d' | 'year' -> { from, to } (to = now). */
export function rangeOf(range = '30d', now = new Date()) {
  const startOfVnDay = new Date(Date.parse(`${vnDay(now)}T00:00:00Z`) - VN_OFFSET_MS);
  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90, year: 365 }[range] ?? 30;
  return { from: new Date(startOfVnDay.getTime() - (days - 1) * DAY_MS), to: now };
}

/**
 * items: dong order_item da thanh toan (gia > 0): { itemType, unitPriceVnd, sellerAmountVnd, status, paidAt }.
 * Hoan tien (status refunded) tru khoi doanh thu. Hoa hong = gia truyen - phan nguoi ban.
 */
export function revenueSummary(items) {
  const s = { planRevenue: 0, listingGross: 0, sellerPayable: 0, commission: 0, refunded: 0, orders: 0 };
  for (const i of items) {
    const price = Number(i.unitPriceVnd);
    if (i.status === 'refunded') {
      s.refunded += price;
      continue;
    }
    s.orders += 1;
    if (i.itemType === 'plan') s.planRevenue += price;
    else {
      const seller = Number(i.sellerAmountVnd ?? 0);
      s.listingGross += price;
      s.sellerPayable += seller;
      s.commission += price - seller;
    }
  }
  s.grossRevenue = s.planRevenue + s.listingGross; // tien khach tra (chua tru hoan)
  s.platformRevenue = s.planRevenue + s.commission; // phan nen tang giu
  return s;
}

/** Chuoi theo ngay (gio VN) tu `from` toi `to`, ngay khong co don = 0. */
export function revenueSeries(items, from, to) {
  const days = new Map();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) days.set(vnDay(t), { day: vnDay(t), plan: 0, listing: 0, commission: 0 });
  for (const i of items) {
    if (i.status === 'refunded') continue;
    const d = days.get(vnDay(i.paidAt));
    if (!d) continue;
    const price = Number(i.unitPriceVnd);
    if (i.itemType === 'plan') d.plan += price;
    else {
      d.listing += price;
      d.commission += price - Number(i.sellerAmountVnd ?? 0);
    }
  }
  return [...days.values()];
}

/** provider_cost_micros (phan trieu USD) -> VND theo ti gia cau hinh. */
export const microsToVnd = (micros, usdVnd) => Math.round((Number(micros) / 1_000_000) * usdVnd);

/** Lai lo don gian: phan nen tang giu - chi phi AI (nha cung cap). */
export const profitAndLoss = ({ platformRevenue, aiCostVnd }) => ({
  platformRevenue,
  aiCostVnd,
  grossProfit: platformRevenue - aiCostVnd,
  margin: platformRevenue > 0 ? (platformRevenue - aiCostVnd) / platformRevenue : null,
});

/**
 * Doi soat vi: so du trong `wallets` phai bang balance_after cua dong ledger cuoi cung cung loai.
 * wallets: [{ userId, creditBalance, earningTotal }]; lastLedger: Map key `${userId}:${walletType}` -> balanceAfter.
 */
export function walletMismatches(wallets, lastLedger) {
  const out = [];
  for (const w of wallets) {
    for (const [type, actual] of [['credit', Number(w.creditBalance)], ['earning', Number(w.earningTotal)]]) {
      const expected = Number(lastLedger.get(`${w.userId}:${type}`) ?? 0);
      if (expected !== actual) out.push({ userId: w.userId, walletType: type, walletBalance: actual, ledgerBalance: expected });
    }
  }
  return out;
}
