import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLedgerRow, ledgerKey } from '../../src/modules/wallets/creditLedger.js';

const base = { userId: 'u1', aiRequestId: 'r1', balanceAfter: 7 };

test('hold: amount am, key :hold, tham chieu ai_request', () => {
  const row = buildLedgerRow('hold', { ...base, amount: 3 });
  assert.equal(row.entryType, 'credit_hold');
  assert.equal(row.amount, -3n);
  assert.equal(row.balanceAfter, 7n);
  assert.equal(row.idempotencyKey, 'ai:r1:hold');
  assert.equal(row.walletType, 'credit');
  assert.equal(row.refType, 'ai_request');
  assert.equal(row.refId, 'r1');
});

test('release: amount duong, key :release', () => {
  const row = buildLedgerRow('release', { ...base, amount: 3 });
  assert.equal(row.entryType, 'credit_release');
  assert.equal(row.amount, 3n);
  assert.equal(row.idempotencyKey, 'ai:r1:release');
});

test('consume: amount 0 du co truyen amount, key :consume', () => {
  const row = buildLedgerRow('consume', { ...base, amount: 5 });
  assert.equal(row.entryType, 'credit_consume');
  assert.equal(row.amount, 0n);
  assert.equal(row.idempotencyKey, ledgerKey('r1', 'consume'));
});

test('loai khong hop le -> nem loi', () => {
  assert.throws(() => buildLedgerRow('grant', base));
});
