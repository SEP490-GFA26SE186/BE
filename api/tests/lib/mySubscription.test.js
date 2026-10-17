import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_PLAN_FALLBACK, formatMySubscription } from '../../src/modules/plans/lib/mySubscription.js';

const plan = {
  id: 'pl1', code: 'MONTHLY', name: 'Gói Tháng', durationMonths: 1, priceVnd: 99000n,
  creditsPerMonth: 30, maxChildren: 3, maxCharacters: 10, canSell: true, isActive: true,
};
const usage = { childrenCount: 1, charactersCount: 2 };

test('co goi dang hoat dong -> plan + ky + muc dung', () => {
  const sub = {
    id: 'sub1', status: 'active', plan,
    periodStart: new Date('2026-10-01T00:00:00Z'),
    periodEnd: new Date('2026-10-31T16:59:59Z'),
    nextCreditGrantAt: new Date('2026-10-31T17:00:00Z'),
  };
  assert.deepEqual(formatMySubscription(sub, usage), {
    isFallback: false,
    plan: { code: 'MONTHLY', name: 'Gói Tháng', durationMonths: 1, priceVnd: 99000n, creditsPerMonth: 30, maxChildren: 3, maxCharacters: 10, canSell: true },
    status: 'active',
    periodStart: sub.periodStart,
    periodEnd: sub.periodEnd,
    nextCreditGrantAt: sub.nextCreditGrantAt,
    usage,
  });
});

test('chua co dong subscription -> goi Mien phi du phong, khong co ky', () => {
  const out = formatMySubscription(null, usage);
  assert.equal(out.isFallback, true);
  assert.deepEqual(out.plan, FREE_PLAN_FALLBACK);
  assert.equal(out.status, 'active');
  assert.equal(out.periodEnd, null);
  assert.deepEqual(out.usage, usage);
});

test('goi du phong khop gioi han du phong cua children / characters (2 be, 5 nhan vat)', () => {
  assert.equal(FREE_PLAN_FALLBACK.maxChildren, 2);
  assert.equal(FREE_PLAN_FALLBACK.maxCharacters, 5);
  assert.equal(FREE_PLAN_FALLBACK.canSell, false);
});
