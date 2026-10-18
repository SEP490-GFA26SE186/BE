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
async function setup({ review = true } = {}) {
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
  const emo = await prisma.storyCheckpoint.create({
    data: { storyId: story.id, afterPageId: pages[1].id, type: 'emotion_self', question: '{NV1} thấy sao?', answerEmotion: 'angry', hint: 'Mặt {NV1} đỏ.' },
  });
  const ps = await prisma.storyCheckpoint.create({
    data: {
      storyId: story.id, afterPageId: pages[2].id, type: 'problem_solving', question: '{NV1} làm gì?',
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
  return { user, token, child, story, pages, emo, ps };
}

async function enterKid(f) {
  const res = await api.request('POST', '/auth/kid-mode/enter', { token: f.token, body: { childId: f.child.id } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const session = res.body.data.session;
  return session.kidSessionToken ?? session.token ?? session.accessToken ?? session;
}

const addToShelf = (f) => api.request('POST', '/bookshelf', { token: f.token, body: { childId: f.child.id, storyId: f.story.id } });
const stat = (childId, code) =>
  prisma.eqCompetencyStat.findFirst({ where: { childId, skill: { caselCode: code } } });

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

  // Tu nhan thuc: 1 cau, lan dau sai -> 0 diem; nang luc cua bai hoc: avoidant 0.5.
  const self = await stat(f.child.id, 'self_awareness');
  assert.deepEqual({ items: self.items, sum: Number(self.scoreSum) }, { items: 1, sum: 0 });
  const topicSkill = await prisma.topic.findUnique({ where: { id: topic.id }, select: { skill: { select: { caselCode: true } } } });
  const t = await stat(f.child.id, topicSkill.skill.caselCode);
  assert.equal(Number(t.scoreSum), 0.5);

  // Tiep tuc luot doc: cau da tra loi co san ket qua
  const resume = await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } });
  assert.equal(resume.body.data.session.id, session.id);
  assert.equal(resume.body.data.story.checkpoints.find((c) => c.id === f.emo.id).result.done, true);

  assert.equal((await api.request('PUT', `/kid/sessions/${session.id}/progress`, { token: kid, body: { pageId: f.pages[3].id } })).status, 200);
  assert.equal((await api.request('POST', `/kid/sessions/${session.id}/complete`, { token: kid })).body.data.session.status, 'completed');

  // Doc lai: luot moi, khong con la luot dau -> khong cong diem nua
  const replay = await api.request('POST', '/kid/sessions', { token: kid, body: { storyId: f.story.id } });
  assert.notEqual(replay.body.data.session.id, session.id);
  assert.equal(replay.body.data.session.isFirstPlay, false);
  await api.request('POST', `/kid/sessions/${replay.body.data.session.id}/answers`, { token: kid, body: { checkpointId: f.emo.id, emotion: 'angry' } });
  assert.equal((await stat(f.child.id, 'self_awareness')).items, 1);
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
