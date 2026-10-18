import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS,
  DECISIONS_BY_REVIEW_TYPE,
  MODERATION_DEFAULTS,
  auditDue,
  isStrikeActive,
  parseModerationSettings,
  reachesThreshold,
  strikeExpiry,
} from '../../src/modules/monitoring/lib/monitoring.js';

test('cau hinh giam sat: thieu / sai -> mac dinh; so nguyen duong -> dung', () => {
  assert.deepEqual(parseModerationSettings([]), MODERATION_DEFAULTS);
  const s = parseModerationSettings([
    { key: 'moderation.report_threshold', value: 5 },
    { key: 'moderation.strike_limit', value: 0 },
    { key: 'moderation.strike_valid_days', value: '30' },
    { key: 'moderation.audit_per_week', value: 1.5 },
  ]);
  assert.deepEqual(s, { reportThreshold: 5, strikeLimit: 3, strikeValidDays: 30, auditPerWeek: 3 });
});

test('nguong bao cao dem nguoi KHAC NHAU', () => {
  assert.equal(reachesThreshold(['a', 'a', 'a'], 3), false);
  assert.equal(reachesThreshold(['a', 'b', 'c'], 3), true);
});

test('canh cao: het han sau N ngay; thu hoi / het han -> het hieu luc', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  const exp = strikeExpiry(now, 90);
  assert.equal(exp - now, 90 * DAY_MS);
  assert.equal(isStrikeActive({ revokedAt: null, expiresAt: exp }, now), true);
  assert.equal(isStrikeActive({ revokedAt: now, expiresAt: exp }, now), false);
  assert.equal(isStrikeActive({ revokedAt: null, expiresAt: now }, now), false);
});

test('quyet dinh theo loai luot duyet; kiem tra ngau nhien moi tuan mot dot', () => {
  assert.ok(DECISIONS_BY_REVIEW_TYPE.submission.includes('rejected'));
  assert.ok(!DECISIONS_BY_REVIEW_TYPE.submission.includes('taken_down'));
  assert.deepEqual(DECISIONS_BY_REVIEW_TYPE.report_followup, ['approved', 'taken_down']);
  const now = new Date('2026-10-18T00:00:00Z');
  assert.equal(auditDue(null, now), true);
  assert.equal(auditDue(new Date(now - 6 * DAY_MS), now), false);
  assert.equal(auditDue(new Date(now - 7 * DAY_MS), now), true);
});
