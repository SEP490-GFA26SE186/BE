import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatChild,
  summarizeReading,
  vnDate,
} from '../../src/modules/children/lib/childFormat.js';

const NOW = new Date('2026-10-17T03:00:00Z');

const row = (over = {}) => ({
  id: 'c1',
  parentId: 'p1',
  name: 'Bin',
  birthDate: new Date('2020-05-01T00:00:00Z'),
  preferredVoice: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  character: {
    id: 'ch1', name: 'Bin', appearance: 'tóc ngắn', portraitImageKey: null, portraitStatus: 'none', deletedAt: null,
  },
  _count: { bookshelfItems: 3, playSessions: 5 },
  ...over,
});

test('formatChild: dung hinh dang Web (character, khong bedtime, tuoi)', () => {
  assert.deepEqual(formatChild(row(), NOW), {
    id: 'c1',
    name: 'Bin',
    birthDate: '2020-05-01',
    age: 6,
    preferredVoice: null,
    character: { id: 'ch1', name: 'Bin', appearance: 'tóc ngắn', portraitImageKey: null, portraitImageUrl: null, portraitStatus: 'none' },
    booksCount: 3,
    completedSessionsCount: 5,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
  });
});

test('formatChild: khong co nhan vat / nhan vat da xoa mem -> character null', () => {
  assert.equal(formatChild(row({ character: null }), NOW).character, null);
  assert.equal(formatChild(row({ character: { ...row().character, deletedAt: new Date() } }), NOW).character, null);
  assert.equal(formatChild(row({ birthDate: null }), NOW).age, null);
});

test('vnDate: ngay theo gio Viet Nam, khong theo UTC', () => {
  assert.equal(vnDate(new Date('2026-10-16T18:30:00Z')), '2026-10-17'); // 01:30 sang 17/10 o VN
  assert.equal(vnDate(new Date('2026-10-17T16:59:00Z')), '2026-10-17'); // 23:59 VN
});

test('summarizeReading: cong thoi gian cac luot doc, luot bo do toi da 60 phut, dem luot xong', () => {
  const t = (m) => new Date(Date.UTC(2026, 9, 17, 1, m));
  const sessions = [
    { startedAt: t(0), lastActivityAt: t(9), completedAt: t(11), status: 'completed' },
    { startedAt: t(20), lastActivityAt: t(27), completedAt: null, status: 'in_progress' },
    { startedAt: t(30), lastActivityAt: new Date(Date.UTC(2026, 9, 17, 5, 0)), completedAt: null, status: 'in_progress' },
  ];
  assert.deepEqual(summarizeReading({ id: 'c1' }, sessions, '2026-10-17'), {
    childId: 'c1',
    date: '2026-10-17',
    usedMinutes: 78,
    usedSeconds: (11 + 7 + 60) * 60,
    sessionsCount: 3,
    completedCount: 1,
  });
});
