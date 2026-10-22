import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertVersionComplete, checkpointTypeFor, scoreFor } from '../../src/modules/question-templates/lib/templateRules.js';

const common = { questionFrame: '{NV1} đang thấy thế nào?', pageSetup: 'Bé đứng một mình', parentPrompts: ['Con nghĩ sao?', 'Vì sao vậy?'], rationale: 'Gọi tên cảm xúc.' };
const role = { ...common, constructiveDesc: 'a', avoidantDesc: 'b', impulsiveDesc: 'c', constructiveScore: 1, avoidantScore: 0.5, impulsiveScore: 0 };
const code = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('checkpointTypeFor: anh xa dang tra loi -> kieu checkpoint', () => {
  assert.equal(checkpointTypeFor('emotion_pick', true), 'emotion_other');
  assert.equal(checkpointTypeFor('emotion_pick', false), 'emotion_self');
  assert.equal(checkpointTypeFor('single_correct', false), 'perspective');
  assert.equal(checkpointTypeFor('role_choice', false), 'problem_solving');
});

test('scoreFor: role_choice theo vai (Decimal duoc ep so), dang khac 1/0', () => {
  const v = { answerFormat: 'role_choice', constructiveScore: '1.00', avoidantScore: { toString: () => '0.5', valueOf: () => 0.5 }, impulsiveScore: 0 };
  assert.equal(scoreFor(v, { role: 'avoidant' }), 0.5);
  assert.equal(scoreFor(v, { role: 'constructive' }), 1);
  assert.equal(scoreFor({ template: { answerFormat: 'role_choice' }, impulsiveScore: 0.2 }, { role: 'impulsive' }), 0.2);
  assert.equal(scoreFor({ answerFormat: 'emotion_pick' }, { type: 'emotion_self', correct: true }), 1);
  assert.equal(scoreFor({ template: { answerFormat: 'single_correct' } }, { type: 'perspective', correct: false }), 0);
});

test('assertVersionComplete: day du thi khong nem', () => {
  assertVersionComplete('emotion_pick', { ...common, hintGuidance: 'g', allowedEmotions: ['happy'] });
  assertVersionComplete('emotion_pick', { ...common, hintGuidance: 'g', allowedEmotions: null });
  assertVersionComplete('single_correct', { ...common, correctDesc: 'a', distractorDesc: 'b', hintGuidance: 'g' });
  assertVersionComplete('role_choice', role);
});

test('assertVersionComplete: thieu truong -> 422 liet ke ten truong', () => {
  const e = code(() => assertVersionComplete('role_choice', { ...role, impulsiveDesc: '  ' }));
  assert.equal(e.statusCode, 422);
  assert.match(e.message, /impulsiveDesc/);
  const e2 = code(() => assertVersionComplete('emotion_pick', { questionFrame: '' }));
  assert.equal(e2.statusCode, 422);
  for (const f of ['questionFrame', 'parentPrompts', 'rationale']) assert.match(e2.message, new RegExp(f));
  for (const f of ['pageSetup', 'hintGuidance']) assert.doesNotMatch(e2.message, new RegExp(f));
});

test('assertVersionComplete: page_setup / hint_guidance tuy chon, 1 cau goi y du (spec family-story §4.2)', () => {
  const lean = { questionFrame: 'Bé được hỏi về cảm xúc', parentPrompts: ['Con nghĩ sao?'], rationale: 'r' };
  assertVersionComplete('emotion_pick', lean);
  assertVersionComplete('single_correct', { ...lean, correctDesc: 'a', distractorDesc: 'b' });
  assert.equal(code(() => assertVersionComplete('single_correct', { ...lean, correctDesc: 'a' })).statusCode, 422);
});

test('assertVersionComplete: parentPrompts 1-3, cam xuc, diem', () => {
  assert.equal(code(() => assertVersionComplete('role_choice', { ...role, parentPrompts: [] })).statusCode, 422);
  assert.equal(code(() => assertVersionComplete('role_choice', { ...role, parentPrompts: ['a', 'b', 'c', 'd'] })).statusCode, 422);
  assert.match(code(() => assertVersionComplete('emotion_pick', { ...common, hintGuidance: 'g', allowedEmotions: ['joy'] })).message, /allowedEmotions/);
  assert.match(code(() => assertVersionComplete('role_choice', { ...role, avoidantScore: 1.2 })).message, /avoidantScore/);
  assert.match(code(() => assertVersionComplete('role_choice', { ...role, avoidantScore: 1 })).message, /constructiveScore/);
  assert.match(code(() => assertVersionComplete('role_choice', { ...role, impulsiveScore: null })).message, /impulsiveScore/);
});

test('scoreFor: role_choice thieu / sai role -> nem loi (loi lap trinh)', () => {
  const v = { answerFormat: 'role_choice', constructiveScore: 1, avoidantScore: 0.5, impulsiveScore: 0 };
  assert.throws(() => scoreFor(v, {}), /role/);
  assert.throws(() => scoreFor(v, { role: 'bogus' }), /role/);
});
