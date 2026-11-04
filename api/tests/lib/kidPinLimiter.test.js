import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCK_MS, MAX_ATTEMPTS, lockRemainingMs, recordFailure, reset } from '../../src/modules/auth/lib/kidPinLimiter.js';

test('PIN Kid Mode: sai 4 lan con luot, lan 5 khoa 15 phut; het khoa thi thu lai duoc', () => {
  const id = 'parent-a';
  const t0 = 1_000_000;
  for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
    assert.deepEqual(recordFailure(id, t0), { locked: false, attemptsLeft: MAX_ATTEMPTS - i });
  }
  assert.equal(lockRemainingMs(id, t0), 0);
  assert.deepEqual(recordFailure(id, t0), { locked: true, attemptsLeft: 0 });
  assert.equal(lockRemainingMs(id, t0 + 1000), LOCK_MS - 1000);
  assert.equal(lockRemainingMs(id, t0 + LOCK_MS), 0, 'het khoa');
  assert.deepEqual(recordFailure(id, t0 + LOCK_MS), { locked: false, attemptsLeft: MAX_ATTEMPTS - 1 }, 'dem lai tu dau');
});

test('PIN Kid Mode: nhap dung dat lai bo dem; moi phu huynh dem rieng', () => {
  recordFailure('parent-b');
  recordFailure('parent-b');
  reset('parent-b');
  assert.equal(recordFailure('parent-b').attemptsLeft, MAX_ATTEMPTS - 1);
  assert.equal(recordFailure('parent-c').attemptsLeft, MAX_ATTEMPTS - 1);
});
