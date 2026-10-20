import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { buildAiRequest, labelPages, labelCheckpoints } = await import(
  '../../src/modules/stories/lib/aiRequest.js'
);
const { buildNameContext } = await import('../../src/modules/stories/lib/names.js');

const sample = JSON.parse(
  readFileSync(new URL('../../../ai/docs/samples/story_request.json', import.meta.url), 'utf8'),
);

const input = () => ({
  aiRequestId: '0f6c2d1e-demo',
  situation: sample.situation,
  topic: {
    title: sample.topic.title,
    guidance: sample.topic.guidance,
    caselCode: 'self_management',
  },
  characters: [
    { token: '{NV1}', isMain: true, appearance: 'bé trai 6 tuổi, tóc ngắn, áo xanh' },
    { token: '{NV2}', isMain: false, appearance: 'em trai 4 tuổi, hay cười' },
    { token: '{NV3}', isMain: false, appearance: 'mẹ' },
  ],
  pages: [8, 3, 1, 2, 4, 5, 6, 7].map((pageOrder) => ({ pageOrder })),
  checkpoints: [
    { type: 'reflection', afterPageOrder: 8, targetToken: null },
    { type: 'emotion_self', afterPageOrder: 2, targetToken: '{NV1}' },
    { type: 'problem_solving', afterPageOrder: 5, targetToken: '{NV2}' },
    { type: 'perspective', afterPageOrder: 4, targetToken: '{NV2}' },
  ],
  limits: sample.limits,
  nameContext: { nameMap: [], forbiddenTerms: ['An', 'Bin'] },
  blockedKeywords: [{ keyword: 'đánh', severity: 'warn' }],
});

test('buildAiRequest: khop story_request.json', () => {
  assert.deepEqual(buildAiRequest(input()), { ...sample, request_id: '0f6c2d1e-demo' });
});

test('buildAiRequest: target chi co o perspective/emotion_other', () => {
  const { checkpoints } = buildAiRequest(input());
  assert.equal('target' in checkpoints[0], false);
  assert.equal('target' in checkpoints[2], false);
  assert.equal(checkpoints[1].target, '{NV2}');
  const other = buildAiRequest({
    ...input(),
    checkpoints: [{ type: 'emotion_other', afterPageOrder: 3, targetToken: '{NV2}' }],
  });
  assert.equal(other.checkpoints[0].target, '{NV2}');
});

test('buildAiRequest: appearance duoc token hoa, forbidden_terms gom ten con khong phai nhan vat', () => {
  const nameContext = buildNameContext({
    storyCharacters: [{ token: '{NV1}', name: 'An', childId: 'c1' }],
    children: [
      { id: 'c1', name: 'An' },
      { id: 'c2', name: 'Bin' },
    ],
  });
  const payload = buildAiRequest({
    ...input(),
    characters: [{ token: '{NV2}', isMain: false, appearance: 'em trai của An' }],
    nameContext,
  });
  assert.equal(payload.characters[0].description, 'em trai của {NV1}');
  assert.deepEqual(payload.forbidden_terms, ['An', 'Bin']);
  assert.equal(payload.tone, 'gentle');
});

test('labelPages / labelCheckpoints', () => {
  assert.deepEqual([...labelPages([{ pageOrder: 1 }, { pageOrder: 2 }])], [[1, 'p1'], [2, 'p2']]);
  const m = labelCheckpoints([{ afterPageOrder: 5 }, { afterPageOrder: 2 }]);
  assert.equal(m.get(2), 'k1');
  assert.equal(m.get(5), 'k2');
});

const version = (over = {}) => ({
  questionFrame: 'Hỏi bé cảm xúc của nhân vật',
  pageSetup: 'Cảnh bé giành đồ chơi',
  hintGuidance: 'Nhìn nét mặt',
  allowedEmotions: [],
  correctDesc: null,
  distractorDesc: null,
  constructiveDesc: null,
  avoidantDesc: null,
  impulsiveDesc: null,
  constructiveScore: 1,
  avoidantScore: 0.3,
  impulsiveScore: 0,
  rationale: 'khong duoc gui',
  parentPrompts: ['x'],
  referenceUrl: 'http://x',
  ...over,
});

test('buildAiRequest: topic age + sub_skills, guide theo dang, khong lo diem', () => {
  const base = input();
  const out = buildAiRequest({
    ...base,
    topic: {
      ...base.topic,
      ageMin: 5,
      ageMax: 8,
      subSkills: [{ nameVi: 'Gọi tên cảm xúc', descriptionVi: 'mô tả' }],
    },
    checkpoints: [
      { type: 'reflection', afterPageOrder: 8, targetToken: null },
      {
        type: 'emotion_self', afterPageOrder: 2, targetToken: '{NV1}', subSkillName: 'Gọi tên cảm xúc',
        answerFormat: 'emotion_pick', version: version({ allowedEmotions: ['happy', 'sad'] }),
      },
      {
        type: 'problem_solving', afterPageOrder: 5, targetToken: null, subSkillName: 'Giải quyết',
        answerFormat: 'role_choice',
        version: version({ constructiveDesc: 'c', avoidantDesc: 'a', impulsiveDesc: 'i' }),
      },
      {
        type: 'perspective', afterPageOrder: 4, targetToken: null, subSkillName: 'Góc nhìn',
        answerFormat: 'single_correct', version: version({ correctDesc: 'đúng', distractorDesc: 'sai' }),
      },
    ],
  });
  assert.deepEqual(out.topic.age_min, 5);
  assert.deepEqual(out.topic.age_max, 8);
  assert.deepEqual(out.topic.sub_skills, [{ name: 'Gọi tên cảm xúc', description: 'mô tả' }]);
  const byType = Object.fromEntries(out.checkpoints.map((c) => [c.type, c]));
  assert.equal(byType.reflection.guide, undefined);
  assert.deepEqual(byType.emotion_self.guide, {
    sub_skill: 'Gọi tên cảm xúc',
    question_frame: 'Hỏi bé cảm xúc của nhân vật',
    page_setup: 'Cảnh bé giành đồ chơi',
    hint_guidance: 'Nhìn nét mặt',
    allowed_emotions: ['happy', 'sad'],
  });
  assert.deepEqual(byType.problem_solving.guide.roles, { constructive: 'c', avoidant: 'a', impulsive: 'i' });
  assert.equal('hint_guidance' in byType.problem_solving.guide, false);
  assert.equal('allowed_emotions' in byType.problem_solving.guide, false);
  assert.equal(byType.perspective.guide.correct_desc, 'đúng');
  assert.equal(byType.perspective.guide.distractor_desc, 'sai');
  const json = JSON.stringify(out);
  for (const bad of ['Score', 'score', 'rationale', 'parent', 'reference', 'khong duoc gui']) {
    assert.equal(json.includes(bad), false, bad);
  }
});

test('buildAiRequest: emotion_pick khong allowed_emotions -> bo khoa', () => {
  const base = input();
  const out = buildAiRequest({
    ...base,
    checkpoints: [
      { type: 'emotion_self', afterPageOrder: 2, targetToken: '{NV1}', subSkillName: 'S', version: version() },
    ],
  });
  assert.equal('allowed_emotions' in out.checkpoints[0].guide, false);
});
