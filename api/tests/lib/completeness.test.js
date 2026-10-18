import test from 'node:test';
import assert from 'node:assert/strict';

const { isCheckpointComplete, missingCheckpointFields, storyStatusFromPages } = await import(
  '../../src/modules/stories/lib/completeness.js'
);

const opts3 = () => [
  { text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }, { text: 'C', isCorrect: false },
];
const ps = () => [
  { text: 'A', feedback: 'fa', role: 'constructive' },
  { text: 'B', feedback: 'fb', role: 'avoidant' },
  { text: 'C', feedback: 'fc', role: 'impulsive' },
];

test('emotion_self / emotion_other: can question + hint', () => {
  for (const type of ['emotion_self', 'emotion_other']) {
    assert.equal(isCheckpointComplete({ type, question: 'Q?', hint: 'H' }), true);
    assert.deepEqual(missingCheckpointFields({ type, question: 'Q?', hint: null }), ['hint']);
    assert.deepEqual(missingCheckpointFields({ type, question: '', hint: 'H' }), ['question']);
  }
});

test('chuoi toan khoang trang coi nhu trong', () => {
  assert.equal(isCheckpointComplete({ type: 'emotion_self', question: '   ', hint: 'H' }), false);
  assert.equal(isCheckpointComplete({ type: 'reflection', question: ' \n ' }), false);
});

test('reflection chi can question', () => {
  assert.equal(isCheckpointComplete({ type: 'reflection', question: 'Q?' }), true);
  assert.equal(isCheckpointComplete({ type: 'reflection', question: null }), false);
});

test('perspective: question, hint, 3 phuong an co chu, dung mot isCorrect', () => {
  const base = { type: 'perspective', question: 'Q', hint: 'H', options: opts3() };
  assert.equal(isCheckpointComplete(base), true);
  assert.equal(isCheckpointComplete({ ...base, hint: '' }), false);
  assert.equal(isCheckpointComplete({ ...base, options: opts3().slice(0, 2) }), false);
  assert.equal(isCheckpointComplete({ ...base, options: undefined }), false);
  const blank = opts3();
  blank[1].text = '  ';
  assert.equal(isCheckpointComplete({ ...base, options: blank }), false);
  const none = opts3().map((o) => ({ ...o, isCorrect: false }));
  assert.equal(isCheckpointComplete({ ...base, options: none }), false);
  const dup = opts3();
  dup[1].isCorrect = true;
  assert.equal(isCheckpointComplete({ ...base, options: dup }), false);
});

test('problem_solving: 3 phuong an text + feedback, du 3 role khac nhau', () => {
  const base = { type: 'problem_solving', question: 'Q', options: ps() };
  assert.equal(isCheckpointComplete(base), true);
  const noFb = ps();
  noFb[0].feedback = ' ';
  assert.equal(isCheckpointComplete({ ...base, options: noFb }), false);
  const dup = ps();
  dup[2].role = 'avoidant';
  assert.equal(isCheckpointComplete({ ...base, options: dup }), false);
  const noRole = ps();
  noRole[2].role = null;
  assert.equal(isCheckpointComplete({ ...base, options: noRole }), false);
  assert.equal(isCheckpointComplete({ ...base, options: ps().slice(0, 2) }), false);
  assert.equal(isCheckpointComplete({ ...base, question: '' }), false);
});

test('storyStatusFromPages', () => {
  assert.equal(storyStatusFromPages([{ contentText: 'a' }, { contentText: 'b' }]), 'ready');
  assert.equal(storyStatusFromPages([{ contentText: 'a' }, { contentText: '   ' }]), 'draft');
  assert.equal(storyStatusFromPages([{ contentText: 'a' }, { contentText: null }]), 'draft');
  assert.equal(storyStatusFromPages([]), 'draft');
});
