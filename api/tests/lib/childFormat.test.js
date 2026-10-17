import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EQ_MIN_ITEMS,
  eqSkillsFromStats,
  formatChild,
  summarizeUsage,
  vnDate,
} from '../../src/modules/children/lib/childFormat.js';

const NOW = new Date('2026-10-17T03:00:00Z');

const row = (over = {}) => ({
  id: 'c1',
  parentId: 'p1',
  name: 'Bin',
  birthDate: new Date('2020-05-01T00:00:00Z'),
  dailyScreenTimeMinutes: 30,
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
    dailyScreenTimeMinutes: 30,
    preferredVoice: null,
    character: { id: 'ch1', name: 'Bin', appearance: 'tóc ngắn', portraitImageKey: null, portraitStatus: 'none' },
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

test('summarizeUsage: cong giay, lam tron phut, con lai khong am', () => {
  const sessions = [{ durationSeconds: 11 * 60 }, { durationSeconds: 7 * 60 + 40 }, { durationSeconds: null }];
  assert.deepEqual(summarizeUsage({ id: 'c1', dailyScreenTimeMinutes: 20 }, sessions, '2026-10-17'), {
    childId: 'c1',
    date: '2026-10-17',
    dailyLimitMinutes: 20,
    usedMinutes: 19,
    usedSeconds: 1120,
    remainingMinutes: 1,
    isLimitReached: false,
    sessionsCount: 3,
  });
  const over = summarizeUsage({ id: 'c1', dailyScreenTimeMinutes: 5 }, [{ durationSeconds: 600 }], 'd');
  assert.equal(over.remainingMinutes, 0);
  assert.equal(over.isLimitReached, true);
});

test('eqSkillsFromStats: du 5 nang luc theo thu tu, diem chi khi du so cau', () => {
  const skills = [
    { id: 's1', caselCode: 'self_awareness', nameVi: 'Tự nhận thức', displayOrder: 1 },
    { id: 's2', caselCode: 'self_management', nameVi: 'Tự quản lý', displayOrder: 2 },
  ];
  const stats = [
    { skillId: 's1', items: 12, scoreSum: '10.5' }, // Decimal tu Prisma den dang chuoi / Decimal
    { skillId: 's2', items: EQ_MIN_ITEMS - 1, scoreSum: '3' },
  ];
  assert.deepEqual(eqSkillsFromStats(skills, stats), [
    { skillId: 's1', caselCode: 'self_awareness', nameVi: 'Tự nhận thức', items: 12, scoreSum: 10.5, score: 88 },
    { skillId: 's2', caselCode: 'self_management', nameVi: 'Tự quản lý', items: 4, scoreSum: 3, score: null },
  ]);
  assert.equal(eqSkillsFromStats(skills, [])[0].items, 0);
  assert.equal(EQ_MIN_ITEMS, 5);
});
