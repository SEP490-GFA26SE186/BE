import test from 'node:test';
import assert from 'node:assert/strict';

const { assignTokens, defaultTarget, buildSkeleton } = await import(
  '../../src/modules/stories/lib/skeleton.js'
);

const layouts = {
  short: { pages: 6, checkpoints: [
    { type: 'scored', after: 2 }, { type: 'scored', after: 3 },
    { type: 'scored', after: 4 }, { type: 'reflection', after: 6 }] },
  medium: { pages: 8, checkpoints: [
    { type: 'scored', after: 2 }, { type: 'scored', after: 4 },
    { type: 'scored', after: 5 }, { type: 'reflection', after: 8 }] },
  long: { pages: 10, checkpoints: [
    { type: 'scored', after: 2 }, { type: 'scored', after: 4 },
    { type: 'scored', after: 6 }, { type: 'scored', after: 8 },
    { type: 'reflection', after: 10 }] },
};
// Phien ban mau theo dang tra loi; o thu 4 (long) la cam xuc hoi ve nhan vat khac.
const versions = [
  { id: 'v-emo', answerFormat: 'emotion_pick', needsTarget: false },
  { id: 'v-sc', answerFormat: 'single_correct', needsTarget: true },
  { id: 'v-role', answerFormat: 'role_choice', needsTarget: false },
  { id: 'v-emo-other', answerFormat: 'emotion_pick', needsTarget: true },
];
const planFor = (length) =>
  layouts[length].checkpoints.filter((c) => c.type === 'scored')
    .map((c, i) => ({ afterPageOrder: c.after, subSkillId: `sub-${i % 2}`, templateVersion: versions[i] }));
const customLimits = { minPages: 4, maxPages: 20, maxCheckpoints: 6 };
const two = assignTokens([{ characterId: 'a', isMain: true }, { characterId: 'b', isMain: false }]);
const one = assignTokens([{ characterId: 'a', isMain: true }]);
const build = (length, storyCharacters, plan = length === 'custom' ? [] : planFor(length)) =>
  buildSkeleton({ length, layouts, customLimits, storyCharacters, plan });

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

test('buildSkeleton: o cham lay kieu, ky nang con, phien ban tu plan', () => {
  const s = build('long', two);
  assert.deepEqual(s.checkpoints.map((c) => c.type),
    ['emotion_self', 'perspective', 'problem_solving', 'emotion_other', 'reflection']);
  assert.deepEqual(s.checkpoints.map((c) => c.scored), [true, true, true, true, false]);
  assert.deepEqual(s.checkpoints.map((c) => c.subSkillId), ['sub-0', 'sub-1', 'sub-0', 'sub-1', null]);
  assert.deepEqual(s.checkpoints.map((c) => c.templateVersionId), ['v-emo', 'v-sc', 'v-role', 'v-emo-other', null]);
  assert.equal(s.checkpoints[0].templateVersion, versions[0]);
  assert.equal(s.checkpoints[4].templateVersion, null);
});

test('buildSkeleton: target theo needsTarget, answerEmotion cho dang cam xuc', () => {
  const s = build('long', two);
  assert.deepEqual(s.checkpoints.map((c) => c.targetToken), [null, '{NV2}', null, '{NV2}', null]);
  assert.deepEqual(s.checkpoints.map((c) => c.answerEmotion), ['neutral', null, null, 'neutral', null]);
});

test('buildSkeleton: single_correct khong needsTarget -> perspective khong target', () => {
  const plan = [{ afterPageOrder: 2, subSkillId: 's', templateVersion: { id: 'x', answerFormat: 'single_correct', needsTarget: false } },
    { afterPageOrder: 3, subSkillId: 's', templateVersion: versions[0] },
    { afterPageOrder: 4, subSkillId: 's', templateVersion: versions[2] }];
  const s = build('short', one, plan);
  assert.equal(s.checkpoints[0].type, 'perspective');
  assert.equal(s.checkpoints[0].targetToken, null);
});

test('buildSkeleton: role_choice needsTarget -> problem_solving khong target (CHECK DB cam target)', () => {
  const plan = planFor('short').map((p) => ({ ...p, templateVersion: { id: 'r', answerFormat: 'role_choice', needsTarget: true } }));
  const s = build('short', two, plan);
  assert.ok(s.checkpoints.slice(0, 3).every((c) => c.type === 'problem_solving' && c.targetToken === null));
});

test('buildSkeleton: dang tra loi lay tu version.template khi version khong co answerFormat', () => {
  const plan = planFor('short').map((p) => ({ ...p, templateVersion: { id: 'y', needsTarget: false, template: { answerFormat: 'role_choice' } } }));
  assert.ok(build('short', one, plan).checkpoints.slice(0, 3).every((c) => c.type === 'problem_solving'));
});

test('buildSkeleton: thieu plan cho o cham -> loi', () => {
  assert.throws(() => build('short', two, planFor('short').slice(1)));
});

test('buildSkeleton: custom -> 4 trang, 0 diem dung', () => {
  assert.deepEqual(build('custom', one), { pageCount: 4, checkpoints: [] });
});

test('buildSkeleton: phien ban can target ma chi co mot nhan vat -> 422', () => {
  assert.throws(() => build('short', one), (e) => e.statusCode === 422);
});
