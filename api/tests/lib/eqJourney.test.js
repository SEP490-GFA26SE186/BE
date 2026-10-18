import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEqJourney, strengths, vnWeekStart } from '../../src/modules/children/lib/eqJourney.js';

test('vnWeekStart: thu Hai dau tuan theo gio VN', () => {
  assert.equal(vnWeekStart(new Date('2026-10-18T10:00:00Z')), '2026-10-12'); // CN 18/10 -> T2 12/10
  assert.equal(vnWeekStart(new Date('2026-10-18T17:30:00Z')), '2026-10-19'); // 00:30 T2 19/10 o VN
});

test('buildEqJourney: xu huong theo tuan theo nang luc, thong ke theo loai cau hoi', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  const rows = [
    { answeredAt: new Date('2026-10-17T03:00:00Z'), score: 1, skipped: false, attempts: 1, caselCode: 'self_awareness', type: 'emotion_self' },
    { answeredAt: new Date('2026-10-16T03:00:00Z'), score: 0, skipped: false, attempts: 2, caselCode: 'self_awareness', type: 'emotion_self' },
    { answeredAt: new Date('2026-10-09T03:00:00Z'), score: 0.5, skipped: false, attempts: 1, caselCode: 'self_management', type: 'problem_solving' },
    { answeredAt: new Date('2026-10-09T04:00:00Z'), score: null, skipped: true, attempts: 1, caselCode: null, type: 'emotion_self' },
    { answeredAt: new Date('2026-06-01T04:00:00Z'), score: 1, skipped: false, attempts: 1, caselCode: 'self_awareness', type: 'emotion_self' }, // ngoai 8 tuan
  ];
  const { trend, byType } = buildEqJourney(rows, { weeks: 2, now });
  assert.deepEqual(trend, [
    { weekStart: '2026-10-05', skills: { self_management: { items: 1, score: 50 } } },
    { weekStart: '2026-10-12', skills: { self_awareness: { items: 2, score: 50 } } },
  ]);
  const emo = byType.find((t) => t.type === 'emotion_self');
  assert.deepEqual(emo, { type: 'emotion_self', answered: 4, skipped: 1, avgScore: 67, firstTryRate: 67 });
});

test('strengths: chi xet nang luc du so cau; mot nang luc -> chua co "can ho tro"', () => {
  const s = (caselCode, items, score) => ({ caselCode, items, score });
  assert.deepEqual(strengths([s('a', 6, 80), s('b', 5, 40), s('c', 2, 10)]), { strongest: 'a', focus: 'b' });
  assert.deepEqual(strengths([s('a', 6, 80), s('b', 1, null)]), { strongest: 'a', focus: null });
});

test('buildEqJourney: firstTryRate chi tinh cau dat diem toi da; thong ke nhan dien cam xuc theo cam xuc dung', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  const at = new Date('2026-10-17T03:00:00Z');
  const rows = [
    { answeredAt: at, score: 0.5, skipped: false, attempts: 1, caselCode: 'self_management', type: 'problem_solving' },
    { answeredAt: at, score: 1, skipped: false, attempts: 1, caselCode: 'self_management', type: 'problem_solving' },
    { answeredAt: at, score: 1, skipped: false, attempts: 1, caselCode: 'self_awareness', type: 'emotion_self', answerEmotion: 'sad', firstEmotion: 'sad' },
    { answeredAt: at, score: 0, skipped: false, attempts: 1, caselCode: 'social_awareness', type: 'emotion_other', answerEmotion: 'sad', firstEmotion: 'angry' },
    { answeredAt: at, score: 1, skipped: false, attempts: 1, caselCode: 'self_awareness', type: 'emotion_self', answerEmotion: 'happy', firstEmotion: 'happy' },
    { answeredAt: at, score: null, skipped: true, attempts: 1, caselCode: null, type: 'emotion_self', answerEmotion: 'angry', firstEmotion: null },
  ];
  const { byType, emotions } = buildEqJourney(rows, { weeks: 1, now });
  assert.equal(byType.find((t) => t.type === 'problem_solving').firstTryRate, 50);
  assert.deepEqual(emotions, [
    { emotion: 'happy', count: 1, correctFirstTry: 1 },
    { emotion: 'sad', count: 2, correctFirstTry: 1 },
  ]);
});
