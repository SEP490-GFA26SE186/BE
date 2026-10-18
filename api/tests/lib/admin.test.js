import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSettings, settingError } from '../../src/modules/admin/lib/settingsRegistry.js';
import { microsToVnd, profitAndLoss, rangeOf, revenueSeries, revenueSummary, vnDay, walletMismatches } from '../../src/modules/admin/lib/finance.js';

test('cau hinh: chi khoa trong danh sach; kieu, khoang, rang buoc hoan tien <= giu doanh thu', () => {
  assert.match(settingError('story_layout.short', 1), /không được sửa/);
  assert.match(settingError('market.min_withdrawal_vnd', 'x'), /phải là số/);
  assert.match(settingError('market.earning_hold_days', 2.5), /số nguyên/);
  assert.match(settingError('market.seller_share_rate', 0.99), /50%–95%/);
  assert.equal(settingError('market.seller_share_rate', 0.75), null);
  assert.match(settingError('market.refund_window_days', 5, { 'market.earning_hold_days': 3 }), /không được dài hơn/);
  assert.match(settingError('market.earning_hold_days', 2, { 'market.refund_window_days': 3 }), /không được dài hơn/);
  assert.equal(settingError('market.earning_hold_days', 7, { 'market.refund_window_days': 3 }), null);
  const list = describeSettings([{ key: 'ai_cost.story_text', value: 2, updatedAt: new Date(), updater: { fullName: 'Admin' } }]);
  assert.deepEqual(
    [list.find((s) => s.key === 'ai_cost.story_text').value, list.find((s) => s.key === 'moderation.strike_limit').isDefault],
    [2, true],
  );
});

test('doanh thu: goi tinh du, truyen tach phan nguoi ban / hoa hong, hoan tien tru ra', () => {
  const items = [
    { itemType: 'plan', unitPriceVnd: 99000n, status: 'active', paidAt: new Date('2026-10-17T03:00:00Z') },
    { itemType: 'listing', unitPriceVnd: 19000n, sellerAmountVnd: 15200n, status: 'active', paidAt: new Date('2026-10-17T20:00:00Z') },
    { itemType: 'listing', unitPriceVnd: 29000n, sellerAmountVnd: 23200n, status: 'refunded', paidAt: new Date('2026-10-17T03:00:00Z') },
  ];
  const s = revenueSummary(items);
  assert.deepEqual(
    { plan: s.planRevenue, gross: s.grossRevenue, seller: s.sellerPayable, commission: s.commission, platform: s.platformRevenue, refunded: s.refunded, orders: s.orders },
    { plan: 99000, gross: 118000, seller: 15200, commission: 3800, platform: 102800, refunded: 29000, orders: 2 },
  );
  // 20:00Z ngay 17 = 03:00 ngay 18 gio VN
  const series = revenueSeries(items, new Date('2026-10-16T17:00:00Z'), new Date('2026-10-18T10:00:00Z'));
  assert.deepEqual(series.map((d) => [d.day, d.plan, d.listing]), [['2026-10-17', 99000, 0], ['2026-10-18', 0, 19000]]);
});

test('khoang thoi gian theo ngay VN; quy doi chi phi AI; lai lo; doi soat vi', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  assert.equal(vnDay(new Date('2026-10-17T17:30:00Z')), '2026-10-18');
  assert.deepEqual(rangeOf('today', now).from, new Date('2026-10-17T17:00:00Z'));
  assert.deepEqual(rangeOf('7d', now).from, new Date('2026-10-11T17:00:00Z'));
  assert.equal(microsToVnd(1_500_000n, 26000), 39000);
  assert.deepEqual(profitAndLoss({ platformRevenue: 100000, aiCostVnd: 25000 }), { platformRevenue: 100000, aiCostVnd: 25000, grossProfit: 75000, margin: 0.75 });
  assert.equal(profitAndLoss({ platformRevenue: 0, aiCostVnd: 10 }).margin, null);
  const last = new Map([['u1:credit', 5n], ['u1:earning', 1000n]]);
  assert.deepEqual(walletMismatches([{ userId: 'u1', creditBalance: 5, earningTotal: 900n }, { userId: 'u2', creditBalance: 0, earningTotal: 0n }], last), [
    { userId: 'u1', walletType: 'earning', walletBalance: 900, ledgerBalance: 1000 },
  ]);
});
