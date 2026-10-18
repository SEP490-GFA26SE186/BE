import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, cycleAction, monthsBetween, newOrderCode, newPeriod, payosDescription } from '../../src/modules/billing/lib/billing.js';

const d = (s) => new Date(s);
const month = { code: 'FAMILY_MONTH', durationMonths: 1 };
const year = { code: 'FAMILY_YEAR', durationMonths: 12 };
const free = { code: 'FREE', durationMonths: 1 };

test('addMonths: giu ngay, cuoi thang khong nhay sang thang sau', () => {
  assert.equal(addMonths(d('2026-01-31T10:00:00Z'), 1).toISOString(), '2026-02-28T10:00:00.000Z');
  assert.equal(addMonths(d('2028-01-31T10:00:00Z'), 1).toISOString(), '2028-02-29T10:00:00.000Z');
  assert.equal(addMonths(d('2026-10-18T00:00:00Z'), 12).toISOString(), '2027-10-18T00:00:00.000Z');
});

test('newPeriod: goi thang cap credit 1 lan; goi nam cap lai moi thang', () => {
  const now = d('2026-10-18T00:00:00Z');
  const m = newPeriod(month, now);
  assert.equal(m.periodEnd.toISOString(), '2026-11-18T00:00:00.000Z');
  assert.equal(m.nextCreditGrantAt.toISOString(), m.periodEnd.toISOString());
  const y = newPeriod(year, now);
  assert.equal(y.periodEnd.toISOString(), '2027-10-18T00:00:00.000Z');
  assert.equal(y.nextCreditGrantAt.toISOString(), '2026-11-18T00:00:00.000Z');
});

test('cycleAction: chua toi han -> none; goi nam giua ky -> grant thang tiep; het ky -> expire / renew_free', () => {
  const start = d('2026-10-18T00:00:00Z');
  const ySub = { status: 'active', ...newPeriod(year, start) };
  assert.equal(cycleAction(ySub, year, d('2026-11-01T00:00:00Z')).action, 'none');
  const g = cycleAction(ySub, year, d('2026-11-18T00:00:01Z'));
  assert.equal(g.action, 'grant');
  assert.equal(g.monthIndex, 1);
  assert.equal(g.nextCreditGrantAt.toISOString(), '2026-12-18T00:00:00.000Z');

  const mSub = { status: 'active', ...newPeriod(month, start) };
  assert.equal(cycleAction(mSub, month, d('2026-11-18T00:00:01Z')).action, 'expire');
  const fSub = { status: 'active', ...newPeriod(free, start) };
  assert.equal(cycleAction(fSub, free, d('2026-11-18T00:00:01Z')).action, 'renew_free');
  assert.equal(cycleAction({ ...mSub, status: 'expired' }, month, d('2027-01-01')).action, 'none');
});

test('monthsBetween: so thang tron', () => {
  assert.equal(monthsBetween(d('2026-10-18'), d('2026-11-18')), 1);
  assert.equal(monthsBetween(d('2026-10-18'), d('2026-11-17')), 0);
  assert.equal(monthsBetween(d('2026-10-18'), d('2027-10-18')), 12);
});

test('payOS: orderCode so nguyen an toan; noi dung <= 9 ky tu (tai khoan khong lien ket payOS)', () => {
  const code = newOrderCode(1792233434123, 0.5);
  assert.ok(Number.isSafeInteger(code) && code > 0);
  assert.equal(payosDescription(code).length, 9);
  assert.match(payosDescription(code), /^SW\d{7}$/);
});
