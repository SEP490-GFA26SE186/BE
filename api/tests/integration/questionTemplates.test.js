import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createUser, createParent, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let spec;
let subSkill;

before(async () => {
  if (skip) return;
  api = await startServer();
  spec = await createUser({ role: 'specialist' });
  subSkill = await prisma.eqSubSkill.findFirst({ where: { isActive: true } });
});
after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });
const tpl = (format = 'role_choice') => call(spec.token, 'POST', '/question-templates', { subSkillId: subSkill.id, title: `Mẫu thử ${Date.now()}`, answerFormat: format });
const full = {
  questionFrame: '{NV1} sẽ làm gì?', pageSetup: 'Bé bị bạn giành đồ chơi', parentPrompts: ['Con sẽ làm gì?', 'Vì sao?'], rationale: 'Giải quyết vấn đề.',
  constructiveDesc: 'Nói với bạn', avoidantDesc: 'Bỏ đi', impulsiveDesc: 'Giật lại', constructiveScore: 1, avoidantScore: 0.5, impulsiveScore: 0,
};

test('mau cau hoi: phu huynh 403, chua dang nhap 401', { skip }, async () => {
  const parent = await createParent();
  assert.equal((await call(parent.token, 'GET', '/question-templates')).status, 403);
  assert.equal((await call(undefined, 'GET', '/question-templates')).status, 401);
});

test('mau cau hoi: tao -> nhap v1 rong, thieu truong -> 422, du -> publish', { skip }, async () => {
  const created = await tpl();
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const t = created.body.data;
  assert.equal(t.draft.version, 1);
  assert.equal(t.draft.questionFrame, '');
  assert.equal(t.latestPublished, null);
  assert.equal(t.subSkill.id, subSkill.id);

  const bad = await call(spec.token, 'POST', `/question-templates/${t.id}/publish`);
  assert.equal(bad.status, 422);
  assert.match(bad.body.message, /questionFrame/);

  const saved = await call(spec.token, 'PUT', `/question-templates/${t.id}/draft`, full);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const pub = await call(spec.token, 'POST', `/question-templates/${t.id}/publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.equal(pub.body.data.latestPublished.version, 1);
  assert.equal(pub.body.data.latestPublished.avoidantScore, 0.5);
  assert.equal(pub.body.data.latestPublished.publishedBy, spec.user.id);
  assert.equal(pub.body.data.draft, null);

  // Khong con nhap -> 409
  assert.equal((await call(spec.token, 'POST', `/question-templates/${t.id}/publish`)).status, 409);

  // Sua -> v2 nhap sao tu v1, v1 van published
  const edit = await call(spec.token, 'PUT', `/question-templates/${t.id}/draft`, { avoidantScore: 0.25 });
  assert.equal(edit.body.data.draft.version, 2);
  assert.equal(edit.body.data.draft.status, 'draft');
  assert.equal(edit.body.data.draft.questionFrame, full.questionFrame);
  assert.equal(edit.body.data.draft.avoidantScore, 0.25);
  assert.equal(edit.body.data.latestPublished.version, 1);
  assert.equal(edit.body.data.latestPublished.avoidantScore, 0.5);

  // Loc danh sach
  const list = await call(spec.token, 'GET', `/question-templates?subSkillId=${subSkill.id}`);
  assert.ok(list.body.data.some((x) => x.id === t.id && x.answerFormat === 'role_choice'));
});

test('mau cau hoi: diem ngoai 0-1 bi tu choi, doi ten/tat, xoa mau chua dung', { skip }, async () => {
  const t = (await tpl('emotion_pick')).body.data;
  assert.equal((await call(spec.token, 'PUT', `/question-templates/${t.id}/draft`, { constructiveScore: 1.2 })).status, 400);
  const upd = await call(spec.token, 'PUT', `/question-templates/${t.id}`, { title: 'Tên mới thử', isActive: false });
  assert.equal(upd.body.data.title, 'Tên mới thử');
  assert.equal(upd.body.data.isActive, false);
  assert.equal((await call(spec.token, 'DELETE', `/question-templates/${t.id}`)).status, 200);
  assert.equal(await prisma.questionTemplate.count({ where: { id: t.id } }), 0);
  assert.equal((await call(spec.token, 'DELETE', `/question-templates/${t.id}`)).status, 404);
});

test('mau cau hoi: xoa 409 khi checkpoint dang dung 1 phien ban', { skip }, async () => {
  const t = (await tpl('emotion_pick')).body.data;
  const topic = await getSeededTopic();
  const parent = await createParent();
  const child = await createChild(parent.user.id, 'Bin');
  const bin = await createCharacter(parent.user.id, 'Bin', { childId: child.id });
  const res = await call(parent.token, 'POST', '/stories', {
    topicId: topic.id, length: 'custom', title: 'Truyện', useTts: false, characters: [{ characterId: bin.id, isMain: true }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const page = await prisma.storyPage.findFirst({ where: { storyId: res.body.data.story.id } });
  await prisma.storyCheckpoint.create({
    data: { storyId: page.storyId, afterPageId: page.id, type: 'emotion_self', question: '{NV1} thấy sao?', answerEmotion: 'angry', templateVersionId: t.draft.id },
  });
  const del = await call(spec.token, 'DELETE', `/question-templates/${t.id}`);
  assert.equal(del.status, 409);
  assert.equal(await prisma.questionTemplate.count({ where: { id: t.id } }), 1);
});

test('mau cau hoi: mac dinh ban nhap dau (diem 1/0,5/0, CASEL), ban hanh khong can page_setup/hint, 1 cau goi y', { skip }, async () => {
  const created = await tpl('role_choice');
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const t = created.body.data;
  assert.deepEqual([t.draft.constructiveScore, t.draft.avoidantScore, t.draft.impulsiveScore], [1, 0.5, 0]);
  assert.match(t.draft.referenceUrl, /casel\.org/);
  const emo = await tpl('emotion_pick');
  assert.deepEqual([...emo.body.data.draft.allowedEmotions].sort(), ['angry', 'happy', 'neutral', 'sad', 'scared']);

  const lean = {
    questionFrame: 'Bé được hỏi sẽ làm gì khi bị giành đồ', parentPrompts: ['Con sẽ làm gì?'], rationale: 'Giải quyết vấn đề.',
    constructiveDesc: 'Nói với bạn', avoidantDesc: 'Bỏ đi', impulsiveDesc: 'Giật lại',
  };
  assert.equal((await call(spec.token, 'PUT', `/question-templates/${t.id}/draft`, lean)).status, 200);
  const pub = await call(spec.token, 'POST', `/question-templates/${t.id}/publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.equal(pub.body.data.latestPublished.pageSetup, null);
});

test('mau cau hoi: tao kem noi dung, ten de trong -> tu sinh tu questionFrame', { skip }, async () => {
  const frame = 'Bé được hỏi về cảm xúc của bạn khi bị lấy mất đồ chơi yêu thích nhất trong giờ chơi';
  const res = await call(spec.token, 'POST', '/question-templates', { subSkillId: subSkill.id, answerFormat: 'emotion_pick', questionFrame: frame });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.data.title.length <= 61);
  assert.ok(frame.startsWith(res.body.data.title.replace('…', '')));
  assert.equal(res.body.data.draft.questionFrame, frame);
  assert.equal((await call(spec.token, 'POST', '/question-templates', { subSkillId: subSkill.id, answerFormat: 'emotion_pick' })).status, 400);
});

test('POST /question-templates/:id/duplicate: mau moi cung ky nang con/dang, nhap v1 chep ban published', { skip }, async () => {
  const t = (await tpl('role_choice')).body.data;
  await call(spec.token, 'PUT', `/question-templates/${t.id}/draft`, full);
  await call(spec.token, 'POST', `/question-templates/${t.id}/publish`);
  await call(spec.token, 'PUT', `/question-templates/${t.id}/draft`, { questionFrame: 'Ban nhap moi chua ban hanh' });

  const dup = await call(spec.token, 'POST', `/question-templates/${t.id}/duplicate`);
  assert.equal(dup.status, 201, JSON.stringify(dup.body));
  const d = dup.body.data;
  assert.notEqual(d.id, t.id);
  assert.equal(d.subSkillId, t.subSkillId);
  assert.equal(d.answerFormat, 'role_choice');
  assert.equal(d.latestPublished, null);
  assert.equal(d.draft.version, 1);
  assert.equal(d.draft.questionFrame, full.questionFrame);
  assert.equal(d.draft.avoidantScore, 0.5);
  assert.match(d.title, /bản sao/);

  const parent = await createParent();
  assert.equal((await call(parent.token, 'POST', `/question-templates/${t.id}/duplicate`)).status, 403);
  assert.equal((await call(spec.token, 'POST', '/question-templates/00000000-0000-4000-8000-000000000000/duplicate')).status, 404);
});
