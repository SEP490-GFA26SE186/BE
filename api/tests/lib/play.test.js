import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const { answerOutcome, firstScore, isCorrect, kidStoryContent, readChoice } = await import(
  '../../src/modules/kid/lib/play.js'
);

const chars = [{ token: '{NV1}', character: { name: 'Bin' } }, { token: '{NV2}', aliasName: 'Bà', character: null }];
const emotionCp = { id: 'k1', type: 'emotion_self', answerEmotion: 'angry', hint: 'Mặt {NV1} đỏ bừng.', hintAudioKey: 'h.mp3', options: [] };
const perspectiveCp = {
  id: 'k2', type: 'perspective', hint: 'Nhìn {NV2} kìa.', options: [
    { id: 'o1', optionOrder: 1, text: 'Vì {NV2} buồn', isCorrect: true },
    { id: 'o2', optionOrder: 2, text: 'Vì {NV2} đói', isCorrect: false },
  ],
};
const psCp = {
  id: 'k3', type: 'problem_solving', options: [
    { id: 'p1', optionOrder: 1, role: 'constructive', text: 'Hít thở', feedback: '{NV1} dịu lại.' },
    { id: 'p2', optionOrder: 2, role: 'avoidant', text: 'Chạy đi', feedback: 'Yên hơn.' },
    { id: 'p3', optionOrder: 3, role: 'impulsive', text: 'Hét lên', feedback: 'Ồn ào.' },
  ],
};
const reflectionCp = { id: 'k4', type: 'reflection', options: [] };
const row = (over) => ({ attempts: 1, skipped: false, firstEmotion: null, firstOptionId: null, finalEmotion: null, finalOptionId: null, ...over });
const opts = { useTts: true };

test('readChoice: sai kieu -> null (cam xuc la, phuong an cua diem dung khac)', () => {
  assert.deepEqual(readChoice(emotionCp, { emotion: 'angry' }), { emotion: 'angry' });
  assert.equal(readChoice(emotionCp, { emotion: 'furious' }), null);
  assert.equal(readChoice(perspectiveCp, { optionId: 'p1' }), null);
  assert.equal(readChoice(perspectiveCp, { optionId: 'o2' }).option.id, 'o2');
  assert.deepEqual(readChoice(reflectionCp, {}), {});
});

const ver = (format, extra = {}) => ({ answerFormat: format, ...extra });
const scoredCp = (cp, templateVersion, over = {}) => ({ ...cp, scored: true, excluded: false, templateVersion, ...over });

test('firstScore: dung/sai 1 hoac 0; role_choice theo diem vai cua phien ban; reflection null', () => {
  const emo = scoredCp(emotionCp, ver('emotion_pick'));
  assert.equal(firstScore(emo, { emotion: 'angry' }), 1);
  assert.equal(firstScore(emo, { emotion: 'sad' }), 0);
  const per = scoredCp(perspectiveCp, { template: { answerFormat: 'single_correct' } });
  assert.equal(firstScore(per, readChoice(per, { optionId: 'o1' })), 1);
  assert.equal(firstScore(per, readChoice(per, { optionId: 'o2' })), 0);
  const ps = scoredCp(psCp, ver('role_choice', { constructiveScore: 1, avoidantScore: 0.25, impulsiveScore: 0 }));
  assert.deepEqual(['p1', 'p2', 'p3'].map((id) => firstScore(ps, readChoice(ps, { optionId: id }))), [1, 0.25, 0]);
  assert.equal(firstScore(scoredCp(reflectionCp, ver('emotion_pick')), {}), null);
  assert.equal(isCorrect(psCp, readChoice(psCp, { optionId: 'p3' })), true, 'giai quyet tinh huong khong co chon lai');
});

test('firstScore: scored=false, excluded, khong co phien ban -> null', () => {
  const v = ver('emotion_pick');
  assert.equal(firstScore({ ...emotionCp, scored: false, templateVersion: v }, { emotion: 'angry' }), null);
  assert.equal(firstScore(scoredCp(emotionCp, v, { excluded: true }), { emotion: 'angry' }), null);
  assert.equal(firstScore(scoredCp(emotionCp, null), { emotion: 'angry' }), null);
});

test('answerOutcome: sai lan dau -> chua xong, kem goi y da thay ten that, khong lo dap an', () => {
  const out = answerOutcome(emotionCp, row({ firstEmotion: 'sad' }), chars, opts);
  assert.equal(out.done, false);
  assert.equal(out.correct, false);
  assert.equal(out.hint, 'Mặt Bin đỏ bừng.');
  assert.equal(out.answer, undefined);
});

test('answerOutcome: sai ca hai lan -> xong, bao dap an; dung lan hai -> correct', () => {
  const wrongTwice = answerOutcome(emotionCp, row({ firstEmotion: 'sad', attempts: 2, finalEmotion: 'happy' }), chars, opts);
  assert.equal(wrongTwice.done, true);
  assert.equal(wrongTwice.correct, false);
  assert.deepEqual(wrongTwice.answer, { emotion: 'angry' });
  const rightSecond = answerOutcome(perspectiveCp, row({ firstOptionId: 'o2', attempts: 2, finalOptionId: 'o1' }), chars, opts);
  assert.equal(rightSecond.correct, true);
  assert.equal(rightSecond.answer, undefined);
});

test('answerOutcome: giai quyet tinh huong tra phan hoi cua lua chon; reflection xong ngay', () => {
  const ps = answerOutcome(psCp, row({ firstOptionId: 'p1', finalOptionId: 'p1' }), chars, opts);
  assert.equal(ps.done, true);
  assert.equal(ps.feedback, 'Bin dịu lại.');
  const reflection = answerOutcome(reflectionCp, row({}), chars, opts);
  assert.deepEqual({ done: reflection.done, correct: reflection.correct }, { done: true, correct: null }, 'khong cham -> khong "dung roi"');
  const skipped = answerOutcome(emotionCp, row({ skipped: true }), chars, opts);
  assert.deepEqual({ done: skipped.done, correct: skipped.correct }, { done: true, correct: null });
});

test('kidStoryContent: ten that, khong kem dap an / vai / phan hoi; tat giong doc -> khong link audio', () => {
  const story = {
    id: 's1', title: 'T', useTts: false, topic: null, storyCharacters: chars,
    pages: [{ id: 'pg2', pageOrder: 2, contentText: '{NV2} ôm {NV1}.', audioKey: 'a.mp3' }, { id: 'pg1', pageOrder: 1, contentText: '{NV1} chơi.', audioKey: null }],
    checkpoints: [
      { ...psCp, scored: true, excluded: false, subSkill: { skillId: 'x' }, templateVersion: { avoidantScore: 0.5 }, afterPageId: 'pg2', question: '{NV1} làm gì?', questionAudioKey: 'q.mp3' },
      { ...emotionCp, afterPageId: 'pg1', question: '{NV1} thấy sao?', questionAudioKey: null },
    ],
  };
  const c = kidStoryContent(story);
  assert.deepEqual(c.pages.map((p) => p.text), ['Bin chơi.', 'Bà ôm Bin.']);
  assert.ok(c.pages.every((p) => p.audioUrl === null && p.imageUrl === null));
  assert.deepEqual(c.checkpoints.map((k) => k.id), ['k1', 'k3']);
  assert.deepEqual(c.checkpoints[0].options, []);
  const serialized = JSON.stringify(c);
  for (const leak of ['answerEmotion', 'isCorrect', 'constructive', 'feedback', 'dịu lại', 'templateVersion', 'subSkill', 'scored', 'excluded']) {
    assert.ok(!serialized.includes(leak), `khong duoc lo ${leak}`);
  }
});

test('firstScore: gan sai (thieu vai, diem NaN, dang khong khop kieu) -> null, khong nem loi', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const rc = ver('role_choice', { constructiveScore: 1, avoidantScore: 0.5, impulsiveScore: 0 });
    const noRole = { ...psCp, options: [{ id: 'px', optionOrder: 1, role: null, text: 'x' }] };
    assert.equal(firstScore(scoredCp(noRole, rc), readChoice(noRole, { optionId: 'px' })), null);
    const nan = ver('role_choice', { constructiveScore: 1, avoidantScore: null, impulsiveScore: undefined });
    assert.equal(firstScore(scoredCp(psCp, { ...nan, avoidantScore: NaN }), readChoice(psCp, { optionId: 'p2' })), null);
    assert.equal(firstScore(scoredCp(psCp, ver('emotion_pick')), readChoice(psCp, { optionId: 'p1' })), null);
    assert.equal(firstScore(scoredCp(emotionCp, rc), { emotion: 'angry' }), null);
  } finally {
    console.warn = warn;
  }
});
