import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let topic;

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await getSeededTopic();
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

/**
 * Phu huynh + be Bin + truyen tu viet 4 trang da hoan tat, tat giong doc (san sang ngay),
 * diem dung: emotion_self (dap an: giận) sau trang 2, problem_solving sau trang 3.
 */
async function setup({ review = true, scored = true } = {}) {
  const { user, token } = await createParent();
  const child = await createChild(user.id, 'Bin');
  const bin = await createCharacter(user.id, 'Bin', { childId: child.id });
  const ba = await createCharacter(user.id, 'Bà');
  const res = await api.request('POST', '/stories', {
    token,
    body: {
      topicId: topic.id, length: 'custom', title: 'Bin đọc truyện', useTts: false,
      characters: [{ characterId: bin.id, isMain: true }, { characterId: ba.id, isMain: false }],
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const story = res.body.data.story;
  const pages = [...story.pages].sort((a, b) => a.pageOrder - b.pageOrder);
  for (const p of pages) {
    await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `{NV1} ở trang ${p.pageOrder}.` } });
  }
  // Truyen AI: diem dung gan phien ban mau + ky nang con (cham diem). Truyen tu viet: khong gan gi.
  const sc = scored ? await scoringFixtures(user.id) : null;
  const emo = await prisma.storyCheckpoint.create({
    data: {
      storyId: story.id, afterPageId: pages[1].id, type: 'emotion_self', question: '{NV1} thấy sao?', answerEmotion: 'angry', hint: 'Mặt {NV1} đỏ.',
      ...(sc && { scored: true, subSkillId: sc.sub.id, templateVersionId: sc.emoVersion.id }),
    },
  });
  const ps = await prisma.storyCheckpoint.create({
    data: {
      storyId: story.id, afterPageId: pages[2].id, type: 'problem_solving', question: '{NV1} làm gì?',
      ...(sc && { scored: true, subSkillId: sc.sub.id, templateVersionId: sc.psVersion.id }),
      options: {
        create: [
          { optionOrder: 1, role: 'constructive', text: 'Hít thở', feedback: '{NV1} dịu lại.' },
          { optionOrder: 2, role: 'avoidant', text: 'Chạy đi', feedback: 'Yên hơn.' },
          { optionOrder: 3, role: 'impulsive', text: 'Hét', feedback: 'Ồn.' },
        ],
      },
    },
    include: { options: true },
  });
  if (review) {
    const r = await api.request('POST', `/stories/${story.id}/review`, { token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const pin = await api.request('POST', '/auth/kid-pin/set', { token, body: { pin: '1234' } });
  assert.ok([200, 201].includes(pin.status), JSON.stringify(pin.body));
  return { user, token, child, story, pages, emo, ps, sc };
}

/** Ky nang con + hai mau da ban hanh: emotion_pick va role_choice (constructive 1, avoidant 0.25, impulsive 0). */
async function scoringFixtures(userId) {
  const link = await prisma.topicSubSkill.findFirst({
    where: { topicId: topic.id },
    select: { subSkill: { select: { skillId: true, caselReferenceId: true } } },
  });
  const { skillId, caselReferenceId } = link.subSkill;
  const tag = Math.random().toString(36).slice(2, 8);
  const sub = await prisma.eqSubSkill.create({
    data: { skillId, caselReferenceId, code: `it_kid_${tag}`, nameVi: `Kỹ năng ${tag}`, descriptionVi: 'x', createdBy: userId },
  });
  const version = async (answerFormat, extra = {}) => {
    const tpl = await prisma.questionTemplate.create({ data: { subSkillId: sub.id, title: `Mẫu ${answerFormat}`, answerFormat, createdBy: userId } });
    return prisma.questionTemplateVersion.create({
      data: { templateId: tpl.id, version: 1, status: 'published', questionFrame: 'Khung', createdBy: userId, ...extra },
    });
  };
  const emoVersion = await version('emotion_pick');
  const psVersion = await version('role_choice', { constructiveScore: 1, avoidantScore: 0.25, impulsiveScore: 0 });
  return { sub, skillId, emoVersion, psVersion };
}

async function enterKid(f) {
  const res = await api.request('POST', '/auth/kid-mode/enter', { token: f.token, body: { childId: f.child.id } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const session = res.body.data.session;
  return session.kidSessionToken ?? session.token ?? session.accessToken ?? session;
}

const addToShelf = (f) => api.request('POST', '/bookshelf', { token: f.token, body: { childId: f.child.id, storyId: f.story.id } });
const answersOf = (sessionId) =>
  prisma.checkpointAnswer.findMany({ where: { sessionId }, orderBy: { answeredAt: 'asc' } });

test('token Kid Mode bi chan o route phu huynh; token phu huynh bi chan o route be', { skip }, async () => {
  const f = await setup();
  const kid = await enterKid(f);
  assert.equal((await api.request('GET', '/children', { token: kid })).status, 403);
  assert.equal((await api.request('GET', '/kid/bookshelf', { token: f.token })).status, 403);
  assert.equal((await api.request('GET', '/kid/me', { token: kid })).body.data.child.name, 'Bin');
});

test('gia sach: chua hoan tat -> 422; hoan tat -> them duoc, them lai khong trung', { skip }, async () => {
  const f = await setup({ review: false });
  const early = await addToShelf(f);
  assert.equal(early.status, 422);
  assert.equal(early.body.errors[0].message, 'not_reviewed');

  await api.request('POST', `/stories/${f.story.id}/review`, { token: f.token });
  assert.equal((await addToShelf(f)).status, 201);
  const again = await addToShelf(f);
  assert.equal(again.body.data.alreadyInBookshelf, true);
  const check = await api.request('GET', `/bookshelf/check/${f.story.id}`, { token: f.token });
  assert.deepEqual(check.body.data.children.map((c) => c.inBookshelf), [true]);
});

test('doc truyen: noi dung khong lo dap an; sai -> goi y -> chon lai; diem chi tinh lan dau', { skip }, async () => {
  const f = await setup();
  await addToShelf(f);
  const kid = await enterKid(f);

  const shelf = await api.request('GET', '/kid/bookshelf', { token: kid });
  assert.deepEqual(shelf.body.data.items.map((i) => i.storyId), [f.story.id]);

  const start = await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } });
  assert.equal(start.status, 201, JSON.stringify(start.body));
  const { session, story } = start.body.data;
  assert.equal(session.isFirstPlay, true);
  assert.equal(story.pages[0].text, 'Bin ở trang 1.');
  const raw = JSON.stringify(story);
  for (const leak of ['angry', 'constructive', 'dịu lại', 'isCorrect']) assert.ok(!raw.includes(leak), leak);

  const answer = (body) => api.request('POST', `/kid/sessions/${session.id}/answers`, { token: kid, body });
  const wrong = await answer({ checkpointId: f.emo.id, emotion: 'sad' });
  assert.equal(wrong.status, 200, JSON.stringify(wrong.body));
  assert.deepEqual(
    { done: wrong.body.data.result.done, hint: wrong.body.data.result.hint },
    { done: false, hint: 'Mặt Bin đỏ.' },
  );
  const right = await answer({ checkpointId: f.emo.id, emotion: 'angry' });
  assert.deepEqual({ done: right.body.data.result.done, correct: right.body.data.result.correct }, { done: true, correct: true });
  const third = await answer({ checkpointId: f.emo.id, emotion: 'happy' });
  assert.equal(third.body.data.result.attempts, 2, 'da xong: bam lai khong doi gi');

  const avoid = f.ps.options.find((o) => o.role === 'avoidant');
  const ps = await answer({ checkpointId: f.ps.id, optionId: avoid.id });
  assert.equal(ps.body.data.result.feedback, 'Yên hơn.');

  // Diem dong bang theo phien ban mau: cam xuc lan dau sai -> 0; avoidant theo phien ban -> 0.25.
  const rows = await answersOf(session.id);
  const byCp = new Map(rows.map((r) => [r.checkpointId, r]));
  const e = byCp.get(f.emo.id);
  assert.deepEqual(
    { score: Number(e.score), skillId: e.skillId, subSkillId: e.subSkillId, templateVersionId: e.templateVersionId },
    { score: 0, skillId: f.sc.skillId, subSkillId: f.sc.sub.id, templateVersionId: f.sc.emoVersion.id },
  );
  const p = byCp.get(f.ps.id);
  assert.deepEqual(
    { score: Number(p.score), skillId: p.skillId, subSkillId: p.subSkillId, templateVersionId: p.templateVersionId },
    { score: 0.25, skillId: f.sc.skillId, subSkillId: f.sc.sub.id, templateVersionId: f.sc.psVersion.id },
  );

  // Tiep tuc luot doc: cau da tra loi co san ket qua
  const resume = await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } });
  assert.equal(resume.body.data.session.id, session.id);
  assert.equal(resume.body.data.story.checkpoints.find((c) => c.id === f.emo.id).result.done, true);

  assert.equal((await api.request('PUT', `/kid/sessions/${session.id}/progress`, { token: kid, body: { pageId: f.pages[3].id } })).status, 200);
  assert.equal((await api.request('POST', `/kid/sessions/${session.id}/complete`, { token: kid })).body.data.session.status, 'completed');

  // Doc lai: luot moi, khong con la luot dau (van luu snapshot; bao cao chi loc luot dau)
  const replay = await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } });
  assert.notEqual(replay.body.data.session.id, session.id);
  assert.equal(replay.body.data.session.isFirstPlay, false);
  await api.request('POST', `/kid/sessions/${replay.body.data.session.id}/answers`, { token: kid, body: { checkpointId: f.emo.id, emotion: 'angry' } });
  const replayRows = await answersOf(replay.body.data.session.id);
  assert.equal(replayRows.length, 1);
  assert.equal(Number(replayRows[0].score), 1);
  assert.equal(replayRows[0].subSkillId, f.sc.sub.id);
});

test('truyen tu viet / bi co excluded -> score, skillId null; noi dung be khong lo phien ban / diem', { skip }, async () => {
  const f = await setup({ scored: false });
  await addToShelf(f);
  const kid = await enterKid(f);
  const { session } = (await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } })).body.data;
  const answer = (body) => api.request('POST', `/kid/sessions/${session.id}/answers`, { token: kid, body });
  assert.equal((await answer({ checkpointId: f.emo.id, emotion: 'angry' })).status, 200);
  const avoid = f.ps.options.find((o) => o.role === 'avoidant');
  assert.equal((await answer({ checkpointId: f.ps.id, optionId: avoid.id })).status, 200);
  for (const r of await answersOf(session.id)) {
    assert.deepEqual({ score: r.score, skillId: r.skillId, subSkillId: r.subSkillId, templateVersionId: r.templateVersionId },
      { score: null, skillId: null, subSkillId: null, templateVersionId: null });
  }

  // Co phien ban nhung bi co "excluded" -> khong cham.
  const g = await setup();
  await prisma.storyCheckpoint.update({ where: { id: g.emo.id }, data: { excluded: true } });
  await addToShelf(g);
  const kid2 = await enterKid(g);
  const s2 = (await api.request('POST', '/kid/sessions', { token: kid2, body: { storyId: g.story.id } })).body.data;
  await api.request('POST', `/kid/sessions/${s2.session.id}/answers`, { token: kid2, body: { checkpointId: g.emo.id, emotion: 'angry' } });
  const [ex] = await answersOf(s2.session.id);
  assert.deepEqual({ score: ex.score, subSkillId: ex.subSkillId }, { score: null, subSkillId: null });
  const raw = JSON.stringify(s2.story);
  for (const leak of ['templateVersion', 'subSkill', 'scored', 'excluded', 'Score']) assert.ok(!raw.includes(leak), `khong duoc lo ${leak}`);
});

test('truyen khong co tren gia cua be -> 404; sai kieu lua chon -> 400', { skip }, async () => {
  const f = await setup();
  const kid = await enterKid(f);
  assert.equal((await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } })).status, 404);
  await addToShelf(f);
  const { session } = (await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } })).body.data;
  const bad = await api.request('POST', `/kid/sessions/${session.id}/answers`, { token: kid, body: { checkpointId: f.ps.id, emotion: 'angry' } });
  assert.equal(bad.status, 400);
});

test('bao cao EQ: muc theo ky nang con tu luot doc dau (luot doc lai khong tinh), bang chung ten that, goi y tro chuyen; cau bi co -> thieu cau -> null', { skip }, async () => {
  const f = await setup();
  // Truyen AI (khong phai tu viet) de goi y tro chuyen lay parent_prompts cua mau.
  await prisma.story.update({ where: { id: f.story.id }, data: { length: 'short' } });
  await prisma.questionTemplateVersion.update({
    where: { id: f.sc.emoVersion.id },
    data: { parentPrompts: ['Hỏi {NV1} xem lúc giận con thấy trong người thế nào?'] },
  });
  // Diem dung thu 3 cung ky nang con: goc nhin (single_correct).
  const tpl = await prisma.questionTemplate.create({
    data: { subSkillId: f.sc.sub.id, title: 'Mẫu góc nhìn', answerFormat: 'single_correct', createdBy: f.user.id },
  });
  const pv = await prisma.questionTemplateVersion.create({
    data: {
      templateId: tpl.id, version: 1, status: 'published', questionFrame: 'Khung', createdBy: f.user.id,
      parentPrompts: ['Theo con Bà nghĩ gì?', 'Hỏi {NV1} xem lúc giận con thấy trong người thế nào?'],
    },
  });
  const pp = await prisma.storyCheckpoint.create({
    data: {
      storyId: f.story.id, afterPageId: f.pages[0].id, type: 'perspective', question: 'Bà nghĩ gì về {NV1}?',
      scored: true, subSkillId: f.sc.sub.id, templateVersionId: pv.id,
      options: { create: [{ optionOrder: 1, text: 'Bà thương', isCorrect: true }, { optionOrder: 2, text: 'Bà giận', isCorrect: false }] },
    },
    include: { options: true },
  });
  await addToShelf(f);
  const kid = await enterKid(f);
  const play = async ({ firstEmotion }) => {
    const { session } = (await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } })).body.data;
    const answer = (body) => api.request('POST', `/kid/sessions/${session.id}/answers`, { token: kid, body });
    await answer({ checkpointId: pp.id, optionId: pp.options.find((o) => o.isCorrect).id });
    await answer({ checkpointId: f.emo.id, emotion: firstEmotion });
    if (firstEmotion !== 'angry') await answer({ checkpointId: f.emo.id, emotion: 'angry' });
    await answer({ checkpointId: f.ps.id, optionId: f.ps.options.find((o) => o.role === 'constructive').id });
    await api.request('POST', `/kid/sessions/${session.id}/complete`, { token: kid });
  };
  await play({ firstEmotion: 'sad' }); // 1 (goc nhin) + 0 (cam xuc sai lan dau) + 1 (xay dung) -> 0.67
  await play({ firstEmotion: 'angry' }); // doc lai: dung het nhung khong tinh

  const skill = await prisma.eqSkill.findUnique({ where: { id: f.sc.skillId } });
  const report = async () => {
    const res = await api.request('GET', `/children/${f.child.id}/eq-report`, { token: f.token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const comp = res.body.data.competencies.find((c) => c.caselCode === skill.caselCode);
    return { data: res.body.data, comp, sub: comp.subSkills.find((s) => s.id === f.sc.sub.id) };
  };
  const r1 = await report();
  assert.deepEqual(Object.keys(r1.data).sort(), ['childId', 'childName', 'competencies', 'recommendations', 'settings']);
  assert.equal(r1.data.competencies.length, 5);
  assert.deepEqual({ level: r1.sub.level, items: r1.sub.items }, { level: 'developing', items: 3 });
  assert.equal(r1.comp.level, 'developing', 'cac ky nang con khac chua co muc -> muc nang luc = muc ky nang con nay');
  assert.ok(typeof r1.sub.caselTextEn === 'string' && r1.sub.caselTextEn.length > 0);
  assert.ok(!JSON.stringify(r1.data.competencies).includes('score'), 'khong tra diem / % cho phu huynh');
  assert.ok(r1.data.recommendations.length >= 1 && r1.data.recommendations.length <= 3);
  assert.ok(!r1.data.recommendations.some((t) => t.id === topic.id), 'topic vua doc khong duoc goi y lai');

  const res = await api.request('GET', `/children/${f.child.id}/eq-journey?weeks=4`, { token: f.token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const j = res.body.data;
  assert.equal(j.trend.length, 4);
  assert.deepEqual(j.trend.at(-1).competencies[skill.caselCode], { items: 3, level: 'developing' });
  const ev = j.evidence.filter((e) => e.subSkillId === f.sc.sub.id);
  assert.equal(ev.length, 3, 'luot doc lai khong vao bang chung');
  const emo = ev.find((e) => e.question === 'Bin thấy sao?');
  assert.ok(emo, 'phu huynh thay ten that cua be');
  assert.deepEqual(
    { first: emo.firstChoiceText, correct: emo.correctFirstTry, hint: emo.usedHint, source: emo.source, story: emo.storyTitle },
    { first: 'Buồn', correct: false, hint: true, source: 'ai_template', story: 'Bin đọc truyện' },
  );
  assert.deepEqual(
    [ev.find((e) => e.question === 'Bin làm gì?').firstChoiceText, ev.find((e) => e.question === 'Bin làm gì?').correctFirstTry],
    ['Hít thở', true],
  );
  assert.equal(j.conversation.length, 1);
  assert.deepEqual(j.conversation[0], {
    storyId: f.story.id, storyTitle: 'Bin đọc truyện', subSkillId: f.sc.sub.id,
    prompts: ['Theo con Bà nghĩ gì?', 'Hỏi Bin xem lúc giận con thấy trong người thế nào?'],
  });

  // Specialist gan co cau tinh huong -> con 2 cau -> chua du du lieu.
  await prisma.storyCheckpoint.update({ where: { id: f.ps.id }, data: { excluded: true } });
  const r2 = await report();
  assert.deepEqual({ level: r2.sub.level, items: r2.sub.items }, { level: null, items: 2 });

  const overview = await api.request('GET', `/children/${f.child.id}/overview`, { token: f.token });
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  assert.equal(overview.body.data.eqReport.competencies.length, 5);
  assert.equal((await api.request('GET', `/children/${f.child.id}/eq-journey`, { token: (await createParent()).token })).status, 404);
});
