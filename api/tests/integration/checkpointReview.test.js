import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

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

const tag = () => Math.random().toString(36).slice(2, 8);

/** Truyen AI (medium) cua phu huynh: nhan vat ten that "Bin" + "Bà", 2 diem dung cham diem (emotion_self + problem_solving). */
async function setup() {
  const { user, token } = await createParent();
  const child = await createChild(user.id, 'Bin');
  const bin = await createCharacter(user.id, 'Bin', { childId: child.id });
  const ba = await createCharacter(user.id, 'Bà');
  const secret = `Tinh huong bi mat ${tag()}`;
  const res = await api.request('POST', '/stories', {
    token,
    body: {
      topicId: topic.id, length: 'custom', title: 'Bin va bin', useTts: false,
      characters: [{ characterId: bin.id, isMain: true }, { characterId: ba.id, isMain: false }],
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const story = res.body.data.story;
  // Doi thanh truyen AI + dat tinh huong
  await prisma.story.update({ where: { id: story.id }, data: { length: 'medium', situation: secret } });
  const pages = [...story.pages].sort((a, b) => a.pageOrder - b.pageOrder);
  for (const p of pages) {
    await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `{NV1} nói chuyện với {NV2} ở trang ${p.pageOrder}.` } });
  }
  const link = await prisma.topicSubSkill.findFirst({ where: { topicId: topic.id }, select: { subSkill: { select: { skillId: true } } } });
  const sub = await prisma.eqSubSkill.create({
    data: { skillId: link.subSkill.skillId, code: `it_cr_${tag()}`, nameVi: `Kỹ năng ${tag()}`, descriptionVi: 'x', caselTextEn: 'Fixture CASEL sentence', createdBy: user.id },
  });
  const tpl = await prisma.questionTemplate.create({ data: { subSkillId: sub.id, title: `Mẫu ${tag()}`, answerFormat: 'role_choice', createdBy: user.id } });
  const ver = await prisma.questionTemplateVersion.create({
    data: { templateId: tpl.id, version: 1, status: 'published', questionFrame: 'Khung', createdBy: user.id, constructiveScore: 1, avoidantScore: 0.25, impulsiveScore: 0 },
  });
  const emo = await prisma.storyCheckpoint.create({
    data: { storyId: story.id, afterPageId: pages[1].id, type: 'emotion_self', question: '{NV1} thấy sao?', answerEmotion: 'angry', scored: true, subSkillId: sub.id, templateVersionId: ver.id },
  });
  const ps = await prisma.storyCheckpoint.create({
    data: {
      storyId: story.id, afterPageId: pages[2].id, type: 'problem_solving', question: '{NV1} làm gì với {NV2}?', scored: true, subSkillId: sub.id, templateVersionId: ver.id,
      options: { create: [
        { optionOrder: 1, role: 'constructive', text: 'Hít thở', feedback: 'f' },
        { optionOrder: 2, role: 'avoidant', text: 'Chạy đi', feedback: 'f' },
        { optionOrder: 3, role: 'impulsive', text: 'Hét vào mặt {NV2}', feedback: 'f' },
      ] },
    },
  });
  return { user, token, story, pages, emo, ps, sub, tpl, secret };
}

const specialist = () => createUser({ role: 'specialist' });
const list = (t, q = '') => api.request('GET', `/checkpoint-review${q}`, { token: t });

test('soat mau: phu huynh bi 403', { skip }, async () => {
  const f = await setup();
  assert.equal((await list(f.token)).status, 403);
  assert.equal((await api.request('POST', `/checkpoint-review/${f.emo.id}/ok`, { token: f.token })).status, 403);
  assert.equal((await api.request('GET', '/checkpoint-review/stats', { token: f.token })).status, 403);
});

test('soat mau: hang doi an ten that va tinh huong, thay token bang ten chung', { skip }, async () => {
  const f = await setup();
  const { token: sp } = await specialist();
  // ten sot dang chu thuong / in hoa (khong phai token) -> van phai che
  await prisma.storyCheckpoint.update({ where: { id: f.emo.id }, data: { question: 'bin thấy sao? BIN giận, {NV1} im.' } });
  const res = await list(sp, `?subSkillId=${f.sub.id}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const emoQ = res.body.data.find((x) => x.checkpointId === f.emo.id).question;
  assert.equal(emoQ, 'Bạn A thấy sao? Bạn A giận, Bạn A im.');
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes('Bin'), 'khong duoc lo ten that Bin');
  assert.ok(!/bin/i.test(raw), 'khong lo bin o bat ky dang nao (ke ca tieu de truyen)');
  assert.ok(!raw.includes('Bà'), 'khong duoc lo ten that Bà');
  assert.ok(!raw.includes(f.secret), 'khong duoc lo situation');
  assert.ok(!raw.includes('{NV'), 'khong con token');
  const items = res.body.data;
  assert.equal(items.length, 2);
  const ps = items.find((x) => x.checkpointId === f.ps.id);
  assert.equal(ps.question, 'Bạn A làm gì với Bạn B?');
  assert.equal(ps.pageBefore, 'Bạn A nói chuyện với Bạn B ở trang 3.');
  assert.equal(ps.status, 'pending');
  assert.equal(ps.options.length, 3);
  assert.ok(ps.options.some((o) => o.text === 'Hét vào mặt Bạn B' && o.role === 'impulsive'));
  assert.ok(ps.skill.caselCode);
  assert.equal(ps.subSkill.id, f.sub.id);
  assert.equal(ps.template.title, f.tpl.title);
  assert.equal(ps.template.version, 1);
  const emo = items.find((x) => x.checkpointId === f.emo.id);
  assert.equal(emo.answerEmotion, 'angry');
});

test('soat mau: ban published dung aliasName; diem khong cham diem / truyen tu viet khong vao hang doi', { skip }, async () => {
  const f = await setup();
  const src = await prisma.story.create({ data: { ownerId: f.user.id, title: 'Nguon', length: 'medium', topicId: topic.id } });
  await prisma.story.update({ where: { id: f.story.id }, data: { kind: 'published', sourceStoryId: src.id } });
  await prisma.storyCharacter.update({ where: { storyId_token: { storyId: f.story.id, token: '{NV1}' } }, data: { aliasName: 'Mèo Con', characterId: null } });
  const unscored = await prisma.storyCheckpoint.create({
    data: { storyId: f.story.id, afterPageId: f.pages[3].id, type: 'reflection', question: 'Không chấm', scored: false },
  });
  const { token: sp } = await specialist();
  const res = await list(sp, `?subSkillId=${f.sub.id}`);
  const ps = res.body.data.find((x) => x.checkpointId === f.ps.id);
  assert.equal(ps.question, 'Mèo Con làm gì với Bạn B?');
  assert.ok(!res.body.data.some((x) => x.checkpointId === unscored.id));
  assert.ok(!JSON.stringify(res.body).includes('Bin'));
  await prisma.story.update({ where: { id: f.story.id }, data: { length: 'custom' } });
  assert.equal((await list(sp, `?subSkillId=${f.sub.id}`)).body.data.length, 0);
});

test('soat mau: flag can ly do 5-500 ky tu; flag -> excluded; ok; go co; loc theo status', { skip }, async () => {
  const f = await setup();
  const sp = await specialist();
  const t = sp.token;
  const post = (id, a, body) => api.request('POST', `/checkpoint-review/${id}/${a}`, { token: t, body });

  assert.equal((await post(f.emo.id, 'flag', {})).status, 400);
  assert.equal((await post(f.emo.id, 'flag', { reason: 'abc' })).status, 400);
  assert.equal((await post(f.emo.id, 'flag', { reason: 'x'.repeat(501) })).status, 400);

  assert.equal((await post(f.ps.id, 'ok')).status, 200);
  assert.equal((await prisma.storyCheckpoint.findUnique({ where: { id: f.ps.id } })).reviewedOkBy, sp.user.id);

  const fl = await post(f.emo.id, 'flag', { reason: 'Cau hoi gay hieu nham' });
  assert.equal(fl.status, 200, JSON.stringify(fl.body));
  const row = await prisma.storyCheckpoint.findUnique({ where: { id: f.emo.id } });
  assert.equal(row.excluded, true);
  assert.equal(row.excludedReason, 'Cau hoi gay hieu nham');
  assert.equal(row.excludedBy, sp.user.id);
  assert.ok(row.excludedAt);

  const q = (s) => list(t, `?status=${s}&subSkillId=${f.sub.id}`).then((r) => r.body.data.map((x) => x.checkpointId));
  assert.deepEqual(await q('flagged'), [f.emo.id]);
  assert.deepEqual(await q('ok'), [f.ps.id]);
  assert.deepEqual(await q('pending'), []);
  const flagged = (await list(t, `?status=flagged&subSkillId=${f.sub.id}`)).body.data[0];
  assert.equal(flagged.status, 'flagged');
  assert.equal(flagged.excludedReason, 'Cau hoi gay hieu nham');

  // gan co len diem da ok -> xoa dau ok
  assert.equal((await post(f.ps.id, 'flag', { reason: 'Xem lai thi co van de' })).status, 200);
  assert.equal((await prisma.storyCheckpoint.findUnique({ where: { id: f.ps.id } })).reviewedOkAt, null);

  // go co: khong tu dat ok
  const del = await api.request('DELETE', `/checkpoint-review/${f.emo.id}/flag`, { token: t });
  assert.equal(del.status, 200);
  const back = await prisma.storyCheckpoint.findUnique({ where: { id: f.emo.id } });
  assert.equal(back.excluded, false);
  assert.equal(back.excludedReason, null);
  assert.equal(back.excludedBy, null);
  assert.equal(back.reviewedOkAt, null);
  assert.deepEqual((await q('pending')).sort(), [f.emo.id]);
});

test('soat mau: diem khong cham diem / truyen tu viet -> 422; khong ton tai -> 404', { skip }, async () => {
  const f = await setup();
  const { token: t } = await specialist();
  const unscored = await prisma.storyCheckpoint.create({ data: { storyId: f.story.id, afterPageId: f.pages[3].id, type: 'reflection', question: 'x', scored: false } });
  assert.equal((await api.request('POST', `/checkpoint-review/${unscored.id}/ok`, { token: t })).status, 422);
  assert.equal((await api.request('POST', `/checkpoint-review/${unscored.id}/flag`, { token: t, body: { reason: 'Ly do du dai' } })).status, 422);
  await prisma.story.update({ where: { id: f.story.id }, data: { length: 'custom' } });
  assert.equal((await api.request('POST', `/checkpoint-review/${f.emo.id}/ok`, { token: t })).status, 422);
  assert.equal((await api.request('POST', '/checkpoint-review/00000000-0000-4000-8000-000000000000/ok', { token: t })).status, 404);
});

test('soat mau: phan trang con tro; stats theo mau', { skip }, async () => {
  const f = await setup();
  const { token: t } = await specialist();
  const p1 = await list(t, `?subSkillId=${f.sub.id}&limit=1`);
  assert.equal(p1.body.data.length, 1);
  const cursor = p1.body.nextCursor;
  assert.ok(cursor, JSON.stringify(p1.body));
  const p2 = await list(t, `?subSkillId=${f.sub.id}&limit=1&cursor=${cursor}`);
  assert.equal(p2.body.data.length, 1);
  assert.notEqual(p2.body.data[0].checkpointId, p1.body.data[0].checkpointId);
  assert.equal(p2.body.nextCursor, null);
  assert.equal((await list(t, '?limit=51')).status, 400);

  await api.request('POST', `/checkpoint-review/${f.ps.id}/ok`, { token: t });
  await api.request('POST', `/checkpoint-review/${f.emo.id}/flag`, { token: t, body: { reason: 'Ly do du dai' } });
  const st = await api.request('GET', '/checkpoint-review/stats', { token: t });
  assert.equal(st.status, 200, JSON.stringify(st.body));
  const row = st.body.data.find((x) => x.templateId === f.tpl.id);
  assert.deepEqual(row, { templateId: f.tpl.id, title: f.tpl.title, reviewed: 2, flagged: 1 });
});

test('soat mau: ok tren diem da loai = khoi phuc + duyet; moi hanh dong tra trang thai that', { skip }, async () => {
  const f = await setup();
  const { token: t } = await specialist();
  const act = (m, a, body) => api.request(m, `/checkpoint-review/${f.emo.id}/${a}`, { token: t, body });
  assert.equal((await act('POST', 'flag', { reason: 'Ly do du dai' })).body.data.status, 'flagged');
  const ok = await act('POST', 'ok');
  assert.equal(ok.body.data.status, 'ok');
  const row = await prisma.storyCheckpoint.findUnique({ where: { id: f.emo.id } });
  assert.equal(row.excluded, false);
  assert.equal(row.excludedReason, null);
  assert.ok(row.reviewedOkAt);
  // go co tren diem da on -> van on
  assert.equal((await act('DELETE', 'flag')).body.data.status, 'ok');
  await prisma.storyCheckpoint.update({ where: { id: f.emo.id }, data: { reviewedOkAt: null, reviewedOkBy: null } });
  assert.equal((await act('DELETE', 'flag')).body.data.status, 'pending');
});
