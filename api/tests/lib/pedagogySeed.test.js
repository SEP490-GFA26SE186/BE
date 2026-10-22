// Kiem tra du lieu seed su pham (khong can DB): 40 muc CASEL (= 40 ky nang con), 23 muc bat san (Phu luc A cua spec),
// mau cau hoi dung dang tra loi, topic seed gan ky nang con cung nang luc.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const { CASEL_REFERENCES, CASEL_URL } = await import('../../prisma/data/casel.js');
const { SUB_SKILLS, SELWEB_URL } = await import('../../prisma/data/pedagogy.js');
const { topicsData } = await import('../../prisma/seed_topics.js');
const { platformSettingsData } = await import('../../prisma/seed_platform_settings.js');

const EMOTIONS = ['happy', 'sad', 'angry', 'scared', 'neutral'];
const COMPETENCIES = [
  'self_awareness',
  'self_management',
  'social_awareness',
  'relationship_skills',
  'responsible_decision_making',
];
const caselByCode = new Map(CASEL_REFERENCES.map((c) => [c.code, c]));
const subByCode = new Map(SUB_SKILLS.map((s) => [s.code, s]));
const allTemplates = SUB_SKILLS.flatMap((s) => s.templates.map((t) => ({ ...t, sub: s })));

// Phu luc A cua spec: muc CASEL bat mac dinh cho lua 5-8 (nguyen van tieng Anh)
const APPENDIX_A = [
  "Identifying one's emotions",
  'Linking feelings, values, and thoughts',
  'Experiencing self-efficacy',
  'Having a growth mindset',
  "Managing one's emotions",
  'Identifying and using stress management strategies',
  'Exhibiting self-discipline and self-motivation',
  'Showing the courage to take initiative',
  "Taking others' perspectives",
  'Demonstrating empathy and compassion',
  'Showing concern for the feelings of others',
  'Understanding and expressing gratitude',
  'Recognizing strengths in others',
  'Communicating effectively',
  'Developing positive relationships',
  'Practicing teamwork and collaborative problem-solving',
  'Resolving conflicts constructively',
  'Resisting negative social pressure',
  'Seeking or offering support and help when needed',
  'Identifying solutions for personal and social problems',
  "Anticipating and evaluating the consequences of one's actions",
  'Demonstrating curiosity and open-mindedness',
  "Reflecting on one's role to promote personal, family, and community well-being",
];

// Cum giang dao ly bi cam (ai/docs/07-content-principles.md)
const MORALIZING = ['bài học', 'con phải nhớ', 'phải biết', 'ngoan hơn', 'hư hơn'];

test('casel: dung 40 muc, 9/7/8/9/7 theo nang luc, code + thu tu khong trung', () => {
  assert.equal(CASEL_REFERENCES.length, 40);
  const count = Object.fromEntries(COMPETENCIES.map((c) => [c, 0]));
  for (const c of CASEL_REFERENCES) count[c.skill] += 1;
  assert.deepEqual(count, {
    self_awareness: 9,
    self_management: 7,
    social_awareness: 8,
    relationship_skills: 9,
    responsible_decision_making: 7,
  });
  assert.equal(caselByCode.size, 40);
  assert.equal(new Set(CASEL_REFERENCES.map((c) => c.textEn)).size, 40);
  for (const c of CASEL_REFERENCES) {
    assert.ok(c.code.length <= 60, c.code);
    assert.ok(Number.isInteger(c.order) && c.order >= 1, c.code);
  }
  assert.equal(CASEL_URL, 'https://casel.org/fundamentals-of-sel/what-is-the-casel-framework/');
});

test('ky nang con bat san: 23 muc, moi muc la dung 1 muc Phu luc A, cung nang luc, tuoi 5-8', () => {
  assert.equal(SUB_SKILLS.length, 23);
  assert.equal(subByCode.size, 23);
  const texts = SUB_SKILLS.map((s) => caselByCode.get(s.caselCode)?.textEn);
  assert.deepEqual([...texts].sort(), [...APPENDIX_A].sort());
  for (const s of SUB_SKILLS) {
    const ref = caselByCode.get(s.caselCode);
    assert.ok(ref, `${s.code}: caselCode ${s.caselCode} khong ton tai`);
    assert.equal(ref.skill, s.skill, `${s.code}: khac nang luc voi muc CASEL`);
    assert.ok(s.code.length <= 60 && s.nameVi.length <= 200, s.code);
    assert.ok(s.descriptionVi.length > 20, s.code);
    assert.ok(s.ageMin >= 5 && s.ageMax <= 8 && s.ageMin <= s.ageMax, s.code);
  }
});

test('mau: 1-2 mau moi ky nang con, ten khong trung, it nhat 1 mau khong nhan nhan vat khac', () => {
  for (const s of SUB_SKILLS) {
    assert.ok(s.templates.length >= 1 && s.templates.length <= 2, s.code);
    assert.equal(new Set(s.templates.map((t) => t.title)).size, s.templates.length, s.code);
    assert.ok(s.templates.some((t) => !t.needsTarget), `${s.code}: can mau needsTarget=false`);
  }
});

test('mau: noi dung chung (khung cau hoi, token, goi y phu huynh, ly do, khong giang dao ly)', () => {
  for (const t of allTemplates) {
    const id = `${t.sub.code} / ${t.title}`;
    assert.ok(['emotion_pick', 'single_correct', 'role_choice'].includes(t.answerFormat), id);
    assert.ok(t.title.length <= 200, id);
    assert.ok(t.questionFrame.includes('{NV1}'), `${id}: thieu {NV1}`);
    assert.equal(t.questionFrame.includes('{NV2}'), Boolean(t.needsTarget), `${id}: {NV2} <=> needsTarget`);
    assert.ok(!/\{NV[3-9]\}/.test(t.questionFrame), id);
    if (!t.needsTarget) {
      const all = [t.pageSetup, t.hintGuidance, t.correctDesc, t.distractorDesc, t.constructiveDesc,
        t.avoidantDesc, t.impulsiveDesc].filter(Boolean).join(' ');
      assert.ok(!all.includes('{NV2}'), `${id}: mau khong nhan nhan vat khac ma co {NV2}`);
    }
    assert.ok(t.questionFrame.split(/\s+/).length <= 15, `${id}: khung cau hoi qua 15 tieng`);
    assert.ok(t.pageSetup && t.pageSetup.length > 20, id);
    assert.ok(Array.isArray(t.parentPrompts) && t.parentPrompts.length >= 2 && t.parentPrompts.length <= 3, id);
    assert.ok(t.rationale && t.rationale.length > 40, id);
    const text = [t.questionFrame, t.pageSetup, t.hintGuidance, t.correctDesc, t.distractorDesc,
      t.constructiveDesc, t.avoidantDesc, t.impulsiveDesc, ...t.parentPrompts]
      .filter(Boolean).join(' ').toLowerCase();
    for (const p of MORALIZING) assert.ok(!text.includes(p), `${id}: co cum "${p}"`);
  }
});

test('mau: truong theo dang tra loi', () => {
  for (const t of allTemplates) {
    const id = `${t.sub.code} / ${t.title}`;
    const roleFields = [t.constructiveDesc, t.avoidantDesc, t.impulsiveDesc];
    const scores = [t.constructiveScore, t.avoidantScore, t.impulsiveScore];
    if (t.answerFormat === 'role_choice') {
      for (const d of roleFields) assert.ok(typeof d === 'string' && d.length > 10, `${id}: thieu mo ta vai`);
      for (const sc of scores) assert.ok(typeof sc === 'number' && sc >= 0 && sc <= 1, `${id}: diem ${sc}`);
      assert.equal(t.constructiveScore, 1, id);
      assert.ok(t.avoidantScore >= t.impulsiveScore, id);
      assert.ok(!t.hintGuidance, `${id}: role_choice khong co goi y`);
      assert.ok(!t.correctDesc && !t.distractorDesc && !(t.allowedEmotions ?? []).length, id);
    } else {
      assert.ok(t.hintGuidance && t.hintGuidance.length > 10, `${id}: thieu hintGuidance`);
      for (const f of [...roleFields, ...scores]) assert.equal(f ?? null, null, `${id}: thua truong vai`);
    }
    if (t.answerFormat === 'single_correct') {
      assert.ok(t.correctDesc && t.distractorDesc, `${id}: thieu mo ta phuong an`);
      assert.ok(!(t.allowedEmotions ?? []).length, id);
    }
    if (t.answerFormat === 'emotion_pick') {
      assert.ok(!t.correctDesc && !t.distractorDesc, id);
      for (const e of t.allowedEmotions ?? []) assert.ok(EMOTIONS.includes(e), `${id}: ${e}`);
    }
  }
});

test('mau: dang tra loi hop ky nang (brief task 4)', () => {
  const formats = (code) => subByCode.get(code).templates.map((t) => t.answerFormat);
  const byText = (text) => SUB_SKILLS.find((s) => caselByCode.get(s.caselCode).textEn === text);
  assert.ok(byText("Identifying one's emotions").templates.every((t) => t.answerFormat === 'emotion_pick'));
  const persp = byText("Taking others' perspectives");
  assert.ok(persp.templates.some((t) => t.answerFormat === 'single_correct' && t.needsTarget));
  const manage = byText("Managing one's emotions");
  assert.ok(formats(manage.code).includes('role_choice'));
  for (const t of manage.templates.filter((x) => x.answerFormat === 'role_choice')) {
    assert.deepEqual([t.constructiveScore, t.avoidantScore, t.impulsiveScore], [1, 0.5, 0]);
  }
  const support = byText('Seeking or offering support and help when needed');
  const supportRc = support.templates.filter((t) => t.answerFormat === 'role_choice');
  assert.ok(supportRc.length >= 1);
  for (const t of supportRc) assert.equal(t.avoidantScore, 0.5);
  for (const t of allTemplates) {
    if (t.referenceUrl) assert.ok([CASEL_URL, SELWEB_URL].includes(t.referenceUrl), t.title);
  }
});

test('topic seed: 1-3 ky nang con cung nang luc, giao tuoi, co mau khong nhan nhan vat khac', () => {
  assert.equal(topicsData.length, 5);
  for (const topic of topicsData) {
    const codes = topic.subSkillCodes;
    assert.ok(Array.isArray(codes) && codes.length >= 1 && codes.length <= 3, topic.title);
    assert.equal(new Set(codes).size, codes.length, topic.title);
    for (const code of codes) {
      const s = subByCode.get(code);
      assert.ok(s, `${topic.title}: khong co ky nang con ${code}`);
      assert.equal(s.skill, topic.caselCode, `${topic.title}: ${code} khac nang luc`);
      assert.ok(s.ageMin <= topic.ageMax && topic.ageMin <= s.ageMax, `${topic.title}: ${code} lech tuoi`);
      assert.ok(s.templates.some((t) => !t.needsTarget), `${topic.title}: ${code}`);
    }
  }
});

test('platform_settings: tham so bao cao EQ mac dinh (spec muc 7)', () => {
  const v = Object.fromEntries(platformSettingsData.map((s) => [s.key, s.value]));
  assert.equal(v['eq_report.window'], 5);
  assert.equal(v['eq_report.min_items'], 3);
  assert.equal(v['eq_report.developing_from'], 0.5);
  assert.equal(v['eq_report.secure_from'], 0.8);
});

// Prisma gia lap toi thieu cho seedPedagogy: kiem luat tao ky nang con / mau va co publish ma khong can DB.
// existingSubs: { code: { id, caselTextEn? } } — dong da co trong DB.
function fakePrisma({ existingSubs = {}, templateCounts = {} } = {}) {
  const created = { subSkills: [], templates: [] };
  const updated = [];
  const rows = Object.entries(existingSubs).map(([code, r]) => ({ code, caselTextEn: null, ...r }));
  const prisma = {
    user: { findUnique: async () => ({ id: 'spec-1' }) },
    eqSkill: { findMany: async () => COMPETENCIES.map((c) => ({ id: `sk-${c}`, caselCode: c })) },
    eqSubSkill: {
      findMany: async ({ where }) => {
        const [byCode, byText] = where.OR;
        return rows.filter((r) => byCode.code.in.includes(r.code) || r.caselTextEn === byText.caselTextEn);
      },
      update: async ({ where, data }) => {
        updated.push({ id: where.id, data });
        return { id: where.id };
      },
      create: async ({ data }) => {
        created.subSkills.push(data);
        return { id: `sub-${data.code}` };
      },
    },
    questionTemplate: {
      count: async ({ where }) => templateCounts[where.subSkillId] ?? 0,
      create: async ({ data }) => {
        created.templates.push(data);
        return { id: `t-${created.templates.length}` };
      },
    },
  };
  return { prisma, created, updated };
}

const { seedPedagogy } = await import('../../prisma/seed_pedagogy.js');
const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

test('seedPedagogy: DB trong -> 40 ky nang con casel (23 bat, 17 tat ten tieng Viet) + mau cua 23 muc', async () => {
  for (const publish of [true, false]) {
    const { prisma, created } = fakePrisma();
    await quiet(() => seedPedagogy(prisma, { publish }));
    assert.equal(created.subSkills.length, 40);
    assert.ok(created.subSkills.every((d) => d.caselTextEn && !('source' in d)));
    assert.deepEqual(new Set(created.subSkills.map((d) => d.caselTextEn)), new Set(CASEL_REFERENCES.map((c) => c.textEn)));
    const active = created.subSkills.filter((d) => d.isActive);
    assert.equal(active.length, 23);
    assert.deepEqual(new Set(active.map((d) => d.code)), new Set(SUB_SKILLS.map((x) => x.code)));
    for (const d of created.subSkills.filter((x) => !x.isActive)) {
      const ref = caselByCode.get(d.code);
      assert.ok(ref, d.code);
      assert.equal(d.nameVi, ref.textVi);
      assert.equal(d.skillId, `sk-${ref.skill}`);
      assert.deepEqual([d.ageMin, d.ageMax], [5, 8]);
    }
    const emo = created.subSkills.find((d) => d.code === 'sa_emotion_naming');
    assert.equal(emo.nameVi, subByCode.get('sa_emotion_naming').nameVi);
    assert.equal(emo.caselTextEn, "Identifying one's emotions");
    assert.equal(created.templates.length, allTemplates.length);
    for (const t of created.templates) {
      const v = t.versions.create;
      assert.equal(v.version, 1);
      assert.equal(v.status, publish ? 'published' : 'draft');
      assert.equal(v.publishedBy, publish ? 'spec-1' : null);
      assert.equal(Boolean(v.publishedAt), publish);
    }
  }
});

test('seedPedagogy: dong da co -> chi dat lai caselTextEn, khong ghi de ten / tuoi / bat-tat; khong tao mau khi da co', async () => {
  const [a, b] = SUB_SKILLS;
  const inactiveRef = CASEL_REFERENCES.find((c) => !SUB_SKILLS.some((x) => x.caselCode === c.code));
  const { prisma, created, updated } = fakePrisma({
    existingSubs: {
      [a.code]: { id: 'sub-a' },
      [b.code]: { id: 'sub-b' },
      [inactiveRef.code]: { id: 'sub-i' },
    },
    templateCounts: { 'sub-a': 1, 'sub-b': 0 }, // a: Specialist da doi ten/giu 1 mau; b: da xoa het mau
  });
  await quiet(() => seedPedagogy(prisma, { publish: true }));
  assert.equal(created.subSkills.length, 37);
  assert.equal(updated.length, 3);
  for (const u of updated) assert.deepEqual(Object.keys(u.data), ['caselTextEn']);
  assert.equal(updated.find((u) => u.id === 'sub-i').data.caselTextEn, inactiveRef.textEn);
  assert.ok(!created.templates.some((t) => t.subSkillId === 'sub-a'));
  assert.equal(created.templates.filter((t) => t.subSkillId === 'sub-b').length, b.templates.length);
  assert.ok(!created.templates.some((t) => t.subSkillId === 'sub-i'));
});

test('seedPedagogy: tim lai dong da co theo cau tieng Anh (ma cu) hoac `<ma>_casel`, khong tao trung', async () => {
  const ref = CASEL_REFERENCES.find((c) => !SUB_SKILLS.some((x) => x.caselCode === c.code));
  const sub = SUB_SKILLS[0];
  const { prisma, created, updated } = fakePrisma({
    existingSubs: {
      [ref.code]: { id: 'sub-plain', caselTextEn: 'legacy text' },
      [`${ref.code}_casel`]: { id: 'sub-casel', caselTextEn: 'old wording' },
      old_custom_code: { id: 'sub-old', caselTextEn: caselByCode.get(sub.caselCode).textEn },
    },
    templateCounts: { 'sub-old': 2 },
  });
  await quiet(() => seedPedagogy(prisma, { publish: true }));
  assert.equal(created.subSkills.length, 38);
  assert.ok(!created.subSkills.some((d) => d.code === sub.code || d.code.startsWith(ref.code)), 'khong tao trung dong da co');
  assert.equal(updated.find((u) => u.id === 'sub-casel').data.caselTextEn, ref.textEn, 'uu tien `<ma>_casel` hon ma goc');
  assert.ok(!updated.some((u) => u.id === 'sub-plain'));
  assert.ok(updated.some((u) => u.id === 'sub-old'));
});
