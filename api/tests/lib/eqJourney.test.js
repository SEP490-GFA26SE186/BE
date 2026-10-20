import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrend, buildEvidence, buildConversation, vnWeekStart } from '../../src/modules/children/lib/eqJourney.js';
import { DEFAULT_REPORT_SETTINGS as S } from '../../src/modules/pedagogy-settings/lib/reportSettings.js';

test('vnWeekStart: thu Hai dau tuan theo gio VN', () => {
  assert.equal(vnWeekStart(new Date('2026-10-18T10:00:00Z')), '2026-10-12'); // CN 18/10 -> T2 12/10
  assert.equal(vnWeekStart(new Date('2026-10-18T17:30:00Z')), '2026-10-19'); // 00:30 T2 19/10 o VN
});

const skills = [
  { id: 'k1', caselCode: 'self_awareness', nameVi: 'Tự nhận thức', displayOrder: 1 },
  { id: 'k2', caselCode: 'self_management', nameVi: 'Tự quản lý', displayOrder: 2 },
];
const subSkills = [
  { id: 'a', skillId: 'k1', nameVi: 'A', displayOrder: 1, caselReference: { textEn: 'x' } },
  { id: 'c', skillId: 'k2', nameVi: 'C', displayOrder: 1, caselReference: { textEn: 'y' } },
];

test('buildTrend: so cau cham moi tuan theo nang luc + muc cuoi tuan (tinh ca cau cac tuan truoc)', () => {
  const now = new Date('2026-10-18T10:00:00Z'); // tuan 12/10
  const rows = [ // moi -> cu
    { subSkillId: 'a', score: 0, answeredAt: new Date('2026-10-17T03:00:00Z') },
    { subSkillId: 'a', score: 0, answeredAt: new Date('2026-10-16T03:00:00Z') },
    { subSkillId: 'a', score: 1, answeredAt: new Date('2026-10-09T03:00:00Z') },
    { subSkillId: 'a', score: 1, answeredAt: new Date('2026-10-08T03:00:00Z') },
    { subSkillId: 'a', score: 1, answeredAt: new Date('2026-10-07T03:00:00Z') },
    { subSkillId: 'c', score: 1, answeredAt: new Date('2026-10-07T03:00:00Z') },
  ];
  assert.deepEqual(buildTrend(rows, skills, subSkills, S, { weeks: 2, now }), [
    {
      weekStart: '2026-10-05',
      competencies: { self_awareness: { items: 3, level: 'secure' }, self_management: { items: 1, level: null } },
    },
    {
      weekStart: '2026-10-12',
      // cuoi tuan: 5 cau gan nhat 0,0,1,1,1 -> 0.6 developing
      competencies: { self_awareness: { items: 2, level: 'developing' }, self_management: { items: 0, level: null } },
    },
  ]);
});

const story = {
  title: 'Bin và Bà',
  storyCharacters: [{ token: '{NV1}', character: { name: 'Bin' } }],
};
const ans = (over) => ({
  subSkillId: 'a', answeredAt: new Date('2026-10-17T03:00:00Z'), attempts: 1, score: 1, firstEmotion: null, firstOption: null,
  checkpoint: { type: 'emotion_self', question: '{NV1} thấy sao?', answerEmotion: 'angry', story },
  ...over,
});

test('buildEvidence: lua chon dau (nhan cam xuc / chu phuong an), dung ngay lan dau, can goi y; ten that; toi da 5 / ky nang con', () => {
  const answers = [
    ans({ firstEmotion: 'angry' }),
    ans({ firstEmotion: 'sad', attempts: 2, score: 0 }),
    ans({
      score: 1, firstOption: { text: '{NV1} hít thở', role: 'constructive', isCorrect: null },
      checkpoint: { type: 'problem_solving', question: '{NV1} làm gì?', story },
    }),
    ans({
      score: 0.25, firstOption: { text: 'Chạy đi', role: 'avoidant', isCorrect: null },
      checkpoint: { type: 'problem_solving', question: 'Làm gì?', story },
    }),
    ans({ score: 1, firstOption: { text: 'Bà buồn', role: null, isCorrect: true }, checkpoint: { type: 'perspective', question: 'Bà nghĩ gì?', story } }),
    ans({ firstEmotion: 'happy', score: 0 }),
    ans({ subSkillId: 'c', firstEmotion: 'scared', score: 0 }),
  ];
  const ev = buildEvidence(answers);
  assert.equal(ev.filter((e) => e.subSkillId === 'a').length, 5);
  assert.deepEqual(ev[0], {
    subSkillId: 'a', answeredAt: answers[0].answeredAt, storyTitle: 'Bin và Bà', question: 'Bin thấy sao?',
    firstChoiceText: 'Giận', correctFirstTry: true, usedHint: false, source: 'ai_template',
  });
  assert.deepEqual([ev[1].firstChoiceText, ev[1].correctFirstTry, ev[1].usedHint], ['Buồn', false, true]);
  assert.deepEqual([ev[2].firstChoiceText, ev[2].correctFirstTry, ev[2].question], ['Bin hít thở', true, 'Bin làm gì?']);
  assert.equal(ev[3].correctFirstTry, false, 'role_choice: chi constructive la dung ngay');
  assert.equal(ev[4].correctFirstTry, true);
  assert.deepEqual(ev.at(-1), { ...ev.at(-1), subSkillId: 'c', firstChoiceText: 'Sợ' });
});

test('buildConversation: parentPrompts theo truyen (bo trung, toi da 3) + reflection; truyen tu viet lay cau hoi', () => {
  const ai = {
    id: 's1', title: 'Bin và Bà', length: 'short', storyCharacters: story.storyCharacters,
    checkpoints: [
      { type: 'emotion_self', question: 'q1', subSkillId: 'a', pageOrder: 2, templateVersion: { parentPrompts: ['Hỏi con 1', 'Hỏi con 2'] } },
      { type: 'problem_solving', question: 'q2', subSkillId: 'a', pageOrder: 4, templateVersion: { parentPrompts: ['Hỏi con 2', 'Hỏi con 3', 'Hỏi con 4'] } },
      { type: 'reflection', question: '{NV1} sẽ làm gì nếu là con?', subSkillId: null, pageOrder: 6, templateVersion: null },
    ],
    answeredReflection: true,
  };
  const custom = {
    id: 's2', title: 'Truyện của mẹ', length: 'custom', storyCharacters: story.storyCharacters,
    checkpoints: [
      { type: 'perspective', question: '{NV1} nghĩ gì?', subSkillId: null, pageOrder: 2, templateVersion: null },
      { type: 'emotion_self', question: null, subSkillId: null, pageOrder: 3, templateVersion: null },
    ],
    answeredReflection: false,
  };
  const plain = { id: 's3', title: 'Trống', length: 'short', storyCharacters: [], checkpoints: [], answeredReflection: false };
  assert.deepEqual(buildConversation([ai, custom, plain]), [
    {
      storyId: 's1', storyTitle: 'Bin và Bà', subSkillId: 'a', prompts: ['Hỏi con 1', 'Hỏi con 2', 'Hỏi con 3'],
      reflection: { question: 'Bin sẽ làm gì nếu là con?', answered: true },
    },
    { storyId: 's2', storyTitle: 'Truyện của mẹ', subSkillId: null, prompts: ['Bin nghĩ gì?'] },
  ]);
});
