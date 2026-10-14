import test from 'node:test';
import assert from 'node:assert/strict';

import eqService from '../src/modules/reports/eq.service.js';

const skillIdByCode = {
  self_awareness: 'skill-self',
  social_awareness: 'skill-social',
};
const TOPIC_SKILL = 'skill-topic';

test('resolveSkillId: nang luc co dinh theo kieu diem dung', () => {
  const resolve = (type) => eqService.resolveSkillId({ type }, TOPIC_SKILL, skillIdByCode);
  assert.equal(resolve('emotion_self'), 'skill-self');
  assert.equal(resolve('emotion_other'), 'skill-social');
  assert.equal(resolve('perspective'), 'skill-social');
  assert.equal(resolve('problem_solving'), TOPIC_SKILL);
  assert.equal(resolve('reflection'), null);
});

test('scoreFirstChoice: cau cam xuc dung 1, sai 0', () => {
  const cp = { type: 'emotion_self', answerEmotion: 'sad' };
  assert.equal(eqService.scoreFirstChoice(cp, { firstEmotion: 'sad' }), 1);
  assert.equal(eqService.scoreFirstChoice(cp, { firstEmotion: 'happy' }), 0);
});

test('scoreFirstChoice: perspective theo is_correct', () => {
  const cp = { type: 'perspective' };
  assert.equal(eqService.scoreFirstChoice(cp, { firstOption: { isCorrect: true } }), 1);
  assert.equal(eqService.scoreFirstChoice(cp, { firstOption: { isCorrect: false } }), 0);
});

test('scoreFirstChoice: problem_solving theo vai cua phuong an', () => {
  const cp = { type: 'problem_solving' };
  assert.equal(eqService.scoreFirstChoice(cp, { firstOption: { role: 'constructive' } }), 1);
  assert.equal(eqService.scoreFirstChoice(cp, { firstOption: { role: 'avoidant' } }), 0.5);
  assert.equal(eqService.scoreFirstChoice(cp, { firstOption: { role: 'impulsive' } }), 0);
});

test('scoreFirstChoice: reflection khong cham diem', () => {
  assert.equal(eqService.scoreFirstChoice({ type: 'reflection' }, {}), null);
});
