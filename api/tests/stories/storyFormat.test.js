import test from 'node:test';
import assert from 'node:assert/strict';

const { formatStoryDetail, formatStorySummary } = await import(
  '../../src/modules/stories/lib/storyFormat.js'
);

const t0 = new Date('2026-09-30T00:00:00Z');

const story = () => ({
  id: 's1',
  ownerId: 'u1',
  kind: 'private',
  sourceStoryId: null,
  topicId: 'tp1',
  topic: { id: 'tp1', title: 'Chia sẻ đồ chơi' },
  length: 'medium',
  title: 'Truyện',
  situation: '{NV1} giận {NV2}',
  useAiImage: false,
  useTts: true,
  status: 'draft',
  reviewedAt: null,
  createdAt: t0,
  updatedAt: t0,
  deletedAt: null,
  // Co y xao tron thu tu de kiem tra sap xep.
  storyCharacters: [
    { storyId: 's1', token: '{NV10}', characterId: 'c10', aliasName: null, isMain: false, character: { id: 'c10', name: 'Mười' } },
    { storyId: 's1', token: '{NV2}', characterId: 'c2', aliasName: null, isMain: false, character: { id: 'c2', name: 'Mít' } },
    { storyId: 's1', token: '{NV1}', characterId: 'c1', aliasName: null, isMain: true, character: { id: 'c1', name: 'Bin' } },
    { storyId: 's1', token: '{NV3}', characterId: null, aliasName: 'Bạn nhỏ', isMain: false, character: null },
  ],
  scenes: [
    { id: 'sc2', storyId: 's1', sceneOrder: 2, description: 'b', imageKey: null, backgroundId: null, imageStatus: 'none' },
    { id: 'sc1', storyId: 's1', sceneOrder: 1, description: '', imageKey: null, backgroundId: null, imageStatus: 'none' },
  ],
  pages: [
    { id: 'p3', storyId: 's1', pageOrder: 3, sceneId: 'sc2', contentText: null, aiOriginalText: null, origin: 'human', audioKey: null, audioStatus: 'none', createdAt: t0, updatedAt: t0 },
    { id: 'p1', storyId: 's1', pageOrder: 1, sceneId: 'sc1', contentText: 'a', aiOriginalText: null, origin: 'ai', audioKey: null, audioStatus: 'none', createdAt: t0, updatedAt: t0 },
    { id: 'p2', storyId: 's1', pageOrder: 2, sceneId: 'sc1', contentText: null, aiOriginalText: null, origin: 'human', audioKey: null, audioStatus: 'none', createdAt: t0, updatedAt: t0 },
  ],
  checkpoints: [
    {
      id: 'k2', storyId: 's1', afterPageId: 'p3', type: 'perspective', targetToken: '{NV2}', question: null,
      answerEmotion: null, hint: null, origin: 'human', questionAudioKey: null, hintAudioKey: null,
      options: [
        { id: 'o3', checkpointId: 'k2', optionOrder: 3, text: 'c', role: null, isCorrect: false, feedback: null },
        { id: 'o1', checkpointId: 'k2', optionOrder: 1, text: 'a', role: null, isCorrect: true, feedback: null },
        { id: 'o2', checkpointId: 'k2', optionOrder: 2, text: 'b', role: null, isCorrect: false, feedback: null },
      ],
    },
    {
      id: 'k1', storyId: 's1', afterPageId: 'p2', type: 'emotion_self', targetToken: null, question: null,
      answerEmotion: 'neutral', hint: null, origin: 'human', questionAudioKey: null, hintAudioKey: null,
      options: [],
    },
  ],
});

test('formatStoryDetail: nhan vat sap theo so token, {NV10} sau {NV3}', () => {
  const d = formatStoryDetail(story());
  assert.deepEqual(d.characters, [
    { token: '{NV1}', characterId: 'c1', name: 'Bin', isMain: true },
    { token: '{NV2}', characterId: 'c2', name: 'Mít', isMain: false },
    { token: '{NV3}', characterId: null, name: 'Bạn nhỏ', isMain: false },
    { token: '{NV10}', characterId: 'c10', name: 'Mười', isMain: false },
  ]);
});

test('formatStoryDetail: trang, canh, diem dung, phuong an deu sap theo thu tu', () => {
  const d = formatStoryDetail(story());
  assert.deepEqual(d.scenes.map((s) => s.sceneOrder), [1, 2]);
  assert.deepEqual(d.pages.map((p) => p.pageOrder), [1, 2, 3]);
  assert.deepEqual(d.checkpoints.map((c) => c.id), ['k1', 'k2']);
  assert.deepEqual(d.checkpoints.map((c) => c.afterPageOrder), [2, 3]);
  assert.deepEqual(d.checkpoints[1].options.map((o) => o.optionOrder), [1, 2, 3]);
});

test('formatStoryDetail: chu giu dang token, khong lo cot noi bo', () => {
  const d = formatStoryDetail(story());
  assert.equal(d.situation, '{NV1} giận {NV2}');
  assert.equal(d.topic.title, 'Chia sẻ đồ chơi');
  assert.equal('ownerId' in d, false);
  assert.equal('deletedAt' in d, false);
  assert.equal('storyCharacters' in d, false);
  assert.equal('storyId' in d.pages[0], false);
  assert.equal('checkpointId' in d.checkpoints[1].options[0], false);
  assert.deepEqual(Object.keys(d.checkpoints[0]).sort(), [
    'afterPageId', 'afterPageOrder', 'answerEmotion', 'hint', 'id', 'locked', 'options', 'origin', 'question',
    'scored', 'targetToken', 'type',
  ]);
  // Truyen AI (length != custom): diem dung khoa; truyen tu viet thi khong.
  const lengthOf = (length) => formatStoryDetail({ ...story(), length }).checkpoints.map((c) => c.locked);
  assert.deepEqual(lengthOf('medium'), [true, true]);
  assert.deepEqual(lengthOf('custom'), [false, false]);
});

test('formatStoryDetail: khong lam doi mang dau vao', () => {
  const s = story();
  formatStoryDetail(s);
  assert.deepEqual(s.pages.map((p) => p.pageOrder), [3, 1, 2]);
});

test('formatStorySummary: dem trang, kem nhan vat, khong co noi dung trang', () => {
  const s = { ...story(), _count: { pages: 8 } };
  delete s.pages;
  delete s.scenes;
  delete s.checkpoints;
  const d = formatStorySummary(s);
  assert.equal(d.pageCount, 8);
  assert.equal(d.characters[0].token, '{NV1}');
  assert.equal('pages' in d, false);
  assert.equal('situation' in d, true);
});

test('formatStorySummary: so diem dung, nang luc CASEL cua chu de, che do AI / tu viet', () => {
  const s = { ...story(), topic: { id: 'tp1', title: 'Chia sẻ', skill: { caselCode: 'relationship_skills' } }, _count: { pages: 8, checkpoints: 4 } };
  const d = formatStorySummary(s);
  assert.equal(d.checkpointCount, 4);
  assert.deepEqual(d.topic, { id: 'tp1', title: 'Chia sẻ', competency: 'relationship_skills' });
  assert.equal(d.mode, 'ai');
  assert.equal(formatStorySummary({ ...s, length: 'custom' }).mode, 'manual');
  // include cu khong co skill -> competency null, khong vo
  assert.equal(formatStorySummary({ ...story(), _count: { pages: 1 } }).topic.competency, null);
});
