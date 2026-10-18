import test from 'node:test';
import assert from 'node:assert/strict';

const { assignTokens, defaultTarget, buildSkeleton } = await import(
  '../../src/modules/stories/lib/skeleton.js'
);

const layouts = {
  short: { pages: 6, checkpoints: [
    { type: 'emotion_self', after: 2 }, { type: 'perspective', after: 3 },
    { type: 'problem_solving', after: 4 }, { type: 'reflection', after: 6 }] },
  medium: { pages: 8, checkpoints: [
    { type: 'emotion_self', after: 2 }, { type: 'perspective', after: 4 },
    { type: 'problem_solving', after: 5 }, { type: 'reflection', after: 8 }] },
  long: { pages: 10, checkpoints: [
    { type: 'emotion_self', after: 2 }, { type: 'perspective', after: 4 },
    { type: 'problem_solving', after: 6 }, { type: 'emotion_other', after: 8 },
    { type: 'reflection', after: 10 }] },
};
const customLimits = { minPages: 4, maxPages: 20, maxCheckpoints: 6 };
const two = assignTokens([{ characterId: 'a', isMain: true }, { characterId: 'b', isMain: false }]);
const one = assignTokens([{ characterId: 'a', isMain: true }]);
const build = (length, storyCharacters) => buildSkeleton({ length, layouts, customLimits, storyCharacters });

test('assignTokens: nhan vat chinh gui o vi tri thu hai van la {NV1}', () => {
  const r = assignTokens([
    { characterId: 'b', isMain: false }, { characterId: 'a', isMain: true }, { characterId: 'c', isMain: false },
  ]);
  assert.equal(r.find((x) => x.characterId === 'a').token, '{NV1}');
  assert.equal(r.find((x) => x.characterId === 'b').token, '{NV2}');
  assert.equal(r.find((x) => x.characterId === 'c').token, '{NV3}');
  assert.equal(r.find((x) => x.characterId === 'a').isMain, true);
});

test('defaultTarget: nhan vat phu dau tien, null neu khong co', () => {
  assert.equal(defaultTarget(two), '{NV2}');
  assert.equal(defaultTarget(one), null);
});

test('buildSkeleton: ba layout ra dung so trang va vi tri', () => {
  for (const [len, pages, afters] of [
    ['short', 6, [2, 3, 4, 6]], ['medium', 8, [2, 4, 5, 8]], ['long', 10, [2, 4, 6, 8, 10]],
  ]) {
    const s = build(len, two);
    assert.equal(s.pageCount, pages);
    assert.deepEqual(s.checkpoints.map((c) => c.afterPageOrder), afters);
  }
});

test('buildSkeleton: target va answerEmotion', () => {
  const s = build('long', two);
  const by = Object.fromEntries(s.checkpoints.map((c) => [c.type, c]));
  assert.equal(by.perspective.targetToken, '{NV2}');
  assert.equal(by.emotion_other.targetToken, '{NV2}');
  assert.equal(by.emotion_self.targetToken, null);
  assert.equal(by.emotion_self.answerEmotion, 'neutral');
  assert.equal(by.emotion_other.answerEmotion, 'neutral');
  assert.equal(by.perspective.answerEmotion, null);
  assert.equal(by.problem_solving.answerEmotion, null);
  assert.equal(by.reflection.answerEmotion, null);
});

test('buildSkeleton: custom -> 4 trang, 0 diem dung', () => {
  assert.deepEqual(build('custom', one), { pageCount: 4, checkpoints: [] });
});

test('buildSkeleton: layout can target ma chi co mot nhan vat -> 422', () => {
  assert.throws(() => build('short', one), (e) => e.statusCode === 422);
});
