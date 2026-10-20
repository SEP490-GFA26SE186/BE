import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  prisma,
  createParent,
  createChild,
  createCharacter,
  createFixedSlotTopic,
  retireTopic,
  startServer,
} from './_fixtures.js';

const skip = !hasTestDb;
let api;
let topic;

before(async () => {
  if (skip) return;
  api = await startServer();
  // Kieu diem dung co dinh (emotion_self, perspective, problem_solving) thay vi chon mau ngau nhien.
  topic = await createFixedSlotTopic();
});

after(async () => {
  if (topic) await retireTopic(topic);
  if (api) await api.close();
  await prisma.$disconnect();
});

/** Phu huynh + nhan vat Bin (gan con Bin) + Mít; con Na KHONG la nhan vat. */
async function family() {
  const { user, token } = await createParent();
  const childBin = await createChild(user.id, 'Bin');
  await createChild(user.id, 'Na');
  const bin = await createCharacter(user.id, 'Bin', { childId: childBin.id });
  const mit = await createCharacter(user.id, 'Mít');
  return { user, token, bin, mit };
}

async function createStory(f, length = 'medium') {
  const res = await api.request('POST', '/stories', {
    token: f.token,
    body: {
      topicId: topic.id,
      length,
      title: 'Bin và Mít',
      characters: [
        { characterId: f.bin.id, isMain: true },
        { characterId: f.mit.id, isMain: false },
      ],
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.story;
}

const call = (f, method, path, body) => api.request(method, path, { token: f.token, body });
const pageRow = (id) => prisma.storyPage.findUnique({ where: { id } });
const storyRow = (id) => prisma.story.findUnique({ where: { id } });
const cpOf = (story, type) => story.checkpoints.find((c) => c.type === type);

/** Dien chu cho moi trang tru cac pageOrder trong `except`. */
async function fillPages(story, except = []) {
  for (const p of story.pages) {
    if (except.includes(p.pageOrder)) continue;
    await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `Trang ${p.pageOrder}.` } });
  }
}

// ---------------------------------------------------------------------------
// PUT /:id/pages/:pageId
// ---------------------------------------------------------------------------

test('updatePage: ten nhan vat -> token; trang human giu human; audio ve null/none', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const page = story.pages[0];
  await prisma.storyPage.update({ where: { id: page.id }, data: { audioKey: 'a/p1.mp3', audioStatus: 'ready' } });

  const res = await call(f, 'PUT', `/stories/${story.id}/pages/${page.id}`, { contentText: 'Bin chơi với Mít.' });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const row = await pageRow(page.id);
  assert.equal(row.contentText, '{NV1} chơi với {NV2}.');
  assert.equal(row.origin, 'human');
  assert.equal(row.audioKey, null);
  assert.equal(row.audioStatus, 'none');
});

test('updatePage: ten con khong phai nhan vat -> 422, khong luu', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const page = story.pages[0];
  const res = await call(f, 'PUT', `/stories/${story.id}/pages/${page.id}`, { contentText: 'Bin rủ Na đi chơi.' });
  assert.equal(res.status, 422);
  assert.match(JSON.stringify(res.body.errors), /Na/);
  assert.equal((await pageRow(page.id)).contentText, null);
});

test('updatePage: trang origin ai -> ai_edited', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const page = story.pages[1];
  await prisma.storyPage.update({ where: { id: page.id }, data: { origin: 'ai', contentText: 'cũ' } });
  const res = await call(f, 'PUT', `/stories/${story.id}/pages/${page.id}`, { contentText: 'Mới.' });
  assert.equal(res.status, 200);
  assert.equal((await pageRow(page.id)).origin, 'ai_edited');
});

test('updatePage: trang cua truyen khac -> 404', { skip }, async () => {
  const f = await family();
  const a = await createStory(f);
  const b = await createStory(f);
  const res = await call(f, 'PUT', `/stories/${a.id}/pages/${b.pages[0].id}`, { contentText: 'x' });
  assert.equal(res.status, 404);
});

test('trang thai: truyen draft dien trang cuoi cung -> ready', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  await fillPages(story, [8]);
  const last = story.pages.find((p) => p.pageOrder === 8);
  const res = await call(f, 'PUT', `/stories/${story.id}/pages/${last.id}`, { contentText: 'Hết.' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.story.status, 'ready');
  assert.equal((await storyRow(story.id)).status, 'ready');
});

test('trang thai: truyen ready xoa trang mot trang -> draft, reviewedAt giu nguyen (Review Focus 5)', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  await fillPages(story);
  const reviewedAt = new Date('2026-09-01T00:00:00Z');
  await prisma.story.update({ where: { id: story.id }, data: { status: 'ready', reviewedAt } });

  const res = await call(f, 'PUT', `/stories/${story.id}/pages/${story.pages[2].id}`, { contentText: '   ' });
  assert.equal(res.status, 200);
  const row = await storyRow(story.id);
  assert.equal(row.status, 'draft');
  assert.equal(row.reviewedAt.toISOString(), reviewedAt.toISOString());
  assert.equal((await pageRow(story.pages[2].id)).contentText, null);
});

// ---------------------------------------------------------------------------
// PUT /:id/checkpoints/:cpId
// ---------------------------------------------------------------------------

test('updateCheckpoint: kieu cam xuc gui question thieu answerEmotion -> 400', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const cp = cpOf(story, 'emotion_self');
  const res = await call(f, 'PUT', `/stories/${story.id}/checkpoints/${cp.id}`, { question: 'Bin thấy sao?' });
  assert.equal(res.status, 400);
});

test('updateCheckpoint: perspective 2 phuong an hoac 2 dap an dung -> 400', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const cp = cpOf(story, 'perspective');
  const url = `/stories/${story.id}/checkpoints/${cp.id}`;
  const two = await call(f, 'PUT', url, {
    options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
  });
  assert.equal(two.status, 400);
  const twoCorrect = await call(f, 'PUT', url, {
    options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: true }, { text: 'C', isCorrect: false }],
  });
  assert.equal(twoCorrect.status, 400);
});

test('updateCheckpoint: problem_solving thieu vai -> 400', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const cp = cpOf(story, 'problem_solving');
  const res = await call(f, 'PUT', `/stories/${story.id}/checkpoints/${cp.id}`, {
    options: [
      { text: 'A', role: 'constructive', feedback: 'fa' },
      { text: 'B', feedback: 'fb' },
      { text: 'C', role: 'impulsive', feedback: 'fc' },
    ],
  });
  assert.equal(res.status, 400);
});

test('updateCheckpoint: reflection gui options -> 400', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const cp = cpOf(story, 'reflection');
  const res = await call(f, 'PUT', `/stories/${story.id}/checkpoints/${cp.id}`, {
    question: 'Con học được gì?',
    options: [{ text: 'A', isCorrect: true }],
  });
  assert.equal(res.status, 400);
});

test('updateCheckpoint: chu -> token, ai -> ai_edited, xoa audio cau hoi/goi y/phuong an', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const cp = cpOf(story, 'perspective');
  await prisma.storyCheckpoint.update({
    where: { id: cp.id },
    data: { origin: 'ai', question: 'cũ', questionAudioKey: 'q.mp3', hintAudioKey: 'h.mp3' },
  });
  await prisma.checkpointOption.createMany({
    data: [1, 2, 3].map((n) => ({
      checkpointId: cp.id,
      optionOrder: n,
      text: `cũ ${n}`,
      isCorrect: n === 1,
      textAudioKey: `o${n}.mp3`,
      feedbackAudioKey: `f${n}.mp3`,
    })),
  });
  const optionsBefore = await prisma.checkpointOption.findMany({ where: { checkpointId: cp.id }, orderBy: { optionOrder: 'asc' } });

  const res = await call(f, 'PUT', `/stories/${story.id}/checkpoints/${cp.id}`, {
    question: 'Mít nghĩ gì khi Bin khóc?',
    hint: 'Nhớ lúc Mít nhìn Bin.',
    options: [
      { text: 'Mít lo cho Bin', isCorrect: false },
      { text: 'Mít vui', isCorrect: false },
      { text: 'Bin buồn', isCorrect: true },
    ],
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const row = await prisma.storyCheckpoint.findUnique({
    where: { id: cp.id },
    include: { options: { orderBy: { optionOrder: 'asc' } } },
  });
  assert.equal(row.question, '{NV2} nghĩ gì khi {NV1} khóc?');
  assert.equal(row.hint, 'Nhớ lúc {NV2} nhìn {NV1}.');
  assert.equal(row.origin, 'ai_edited');
  assert.equal(row.questionAudioKey, null);
  assert.equal(row.hintAudioKey, null);
  assert.deepEqual(row.options.map((o) => [o.text, o.isCorrect]), [
    ['{NV2} lo cho {NV1}', false],
    ['{NV2} vui', false],
    ['{NV1} buồn', true],
  ]);
  assert.ok(row.options.every((o) => o.textAudioKey === null && o.feedbackAudioKey === null));
  // Giu id phuong an (checkpoint_answers co the tro toi).
  assert.deepEqual(row.options.map((o) => o.id), optionsBefore.map((o) => o.id));
});

test('updateCheckpoint: emotion_self du question + answerEmotion -> luu; origin human giu human', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const cp = cpOf(story, 'emotion_self');
  const res = await call(f, 'PUT', `/stories/${story.id}/checkpoints/${cp.id}`, {
    question: 'Bin thấy thế nào?',
    answerEmotion: 'sad',
    hint: 'Nhìn mặt Bin.',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = await prisma.storyCheckpoint.findUnique({ where: { id: cp.id } });
  assert.equal(row.question, '{NV1} thấy thế nào?');
  assert.equal(row.answerEmotion, 'sad');
  assert.equal(row.origin, 'human');
});

// ---------------------------------------------------------------------------
// custom: them/xoa trang, diem dung
// ---------------------------------------------------------------------------

/** Them trang truc tiep bang prisma de len `total` trang (gan canh dau). */
async function growPages(story, total) {
  const scene = await prisma.storyScene.findFirst({ where: { storyId: story.id } });
  const count = await prisma.storyPage.count({ where: { storyId: story.id } });
  await prisma.storyPage.createMany({
    data: Array.from({ length: total - count }, (_, i) => ({
      storyId: story.id,
      pageOrder: count + i + 1,
      sceneId: scene.id,
      origin: 'human',
    })),
  });
}

test('custom: POST /pages them trang cuoi, gan canh lon nhat; trang thu 21 -> 422', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');

  const ok = await call(f, 'POST', `/stories/${story.id}/pages`, { contentText: 'Bin về nhà.' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const pages = ok.body.data.story.pages;
  assert.deepEqual(pages.map((p) => p.pageOrder), [1, 2, 3, 4, 5]);
  assert.equal(pages[4].contentText, '{NV1} về nhà.');
  assert.equal(pages[4].sceneId, story.scenes[0].id);

  await growPages(story, 20);
  const tooMany = await call(f, 'POST', `/stories/${story.id}/pages`, {});
  assert.equal(tooMany.status, 422);
  assert.equal(await prisma.storyPage.count({ where: { storyId: story.id } }), 20);
});

test('custom: xoa trang co diem dung sau no -> 409', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  const page3 = story.pages.find((p) => p.pageOrder === 3);
  const add = await call(f, 'POST', `/stories/${story.id}/checkpoints`, { type: 'emotion_self', afterPageId: page3.id });
  assert.equal(add.status, 201, JSON.stringify(add.body));

  await growPages(story, 5);
  const res = await call(f, 'DELETE', `/stories/${story.id}/pages/${page3.id}`);
  assert.equal(res.status, 409);
});

test('custom: xoa trang o giua -> pageOrder lien mach 1..N, diem dung di theo trang', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  await growPages(story, 6);
  const pagesBefore = await prisma.storyPage.findMany({ where: { storyId: story.id }, orderBy: { pageOrder: 'asc' } });
  const page5 = pagesBefore[4];
  const addCp = await call(f, 'POST', `/stories/${story.id}/checkpoints`, { type: 'problem_solving', afterPageId: page5.id });
  assert.equal(addCp.status, 201, JSON.stringify(addCp.body));

  const res = await call(f, 'DELETE', `/stories/${story.id}/pages/${pagesBefore[1].id}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const pagesAfter = await prisma.storyPage.findMany({ where: { storyId: story.id }, orderBy: { pageOrder: 'asc' } });
  assert.deepEqual(pagesAfter.map((p) => p.pageOrder), [1, 2, 3, 4, 5]);
  assert.deepEqual(pagesAfter.map((p) => p.id), pagesBefore.filter((_, i) => i !== 1).map((p) => p.id));
  const cp = res.body.data.story.checkpoints[0];
  assert.equal(cp.afterPageId, page5.id);
  assert.equal(cp.afterPageOrder, 4);
});

test('custom: xoa trang con 3 trang -> 422, khong xoa', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  const res = await call(f, 'DELETE', `/stories/${story.id}/pages/${story.pages[3].id}`);
  assert.equal(res.status, 422);
  assert.equal(await prisma.storyPage.count({ where: { storyId: story.id } }), 4);
});

test('custom: them diem dung sau trang 1 -> 422', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  const res = await call(f, 'POST', `/stories/${story.id}/checkpoints`, {
    type: 'emotion_self',
    afterPageId: story.pages[0].id,
  });
  assert.equal(res.status, 422);
});

test('custom: them reflection khong o trang cuoi -> 422; o trang cuoi -> 201', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  const bad = await call(f, 'POST', `/stories/${story.id}/checkpoints`, { type: 'reflection', afterPageId: story.pages[2].id });
  assert.equal(bad.status, 422);
  const ok = await call(f, 'POST', `/stories/${story.id}/checkpoints`, { type: 'reflection', afterPageId: story.pages[3].id });
  assert.equal(ok.status, 201);
});

test('custom: them emotion_other khong gui targetToken -> nhan vat phu dau tien; answerEmotion neutral', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  const res = await call(f, 'POST', `/stories/${story.id}/checkpoints`, {
    type: 'emotion_other',
    afterPageId: story.pages[1].id,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const cp = res.body.data.story.checkpoints[0];
  assert.equal(cp.targetToken, '{NV2}');
  assert.equal(cp.answerEmotion, 'neutral');
  assert.equal(cp.afterPageOrder, 2);
});

test('custom: hai diem dung sau cung mot trang -> 422', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  const url = `/stories/${story.id}/checkpoints`;
  assert.equal((await call(f, 'POST', url, { type: 'emotion_self', afterPageId: story.pages[1].id })).status, 201);
  assert.equal((await call(f, 'POST', url, { type: 'perspective', afterPageId: story.pages[1].id })).status, 422);
});

test('custom: xoa diem dung -> 200, phuong an bi xoa theo', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  const add = await call(f, 'POST', `/stories/${story.id}/checkpoints`, { type: 'perspective', afterPageId: story.pages[2].id });
  const cp = add.body.data.story.checkpoints[0];
  const res = await call(f, 'DELETE', `/stories/${story.id}/checkpoints/${cp.id}`);
  assert.equal(res.status, 200);
  assert.equal(await prisma.storyCheckpoint.count({ where: { storyId: story.id } }), 0);
});

test('truyen khong phai custom: them/xoa trang, diem dung -> 422', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'short');
  const cp = story.checkpoints[0];
  const results = await Promise.all([
    call(f, 'POST', `/stories/${story.id}/pages`, {}),
    call(f, 'DELETE', `/stories/${story.id}/pages/${story.pages[0].id}`),
    call(f, 'POST', `/stories/${story.id}/checkpoints`, { type: 'emotion_self', afterPageId: story.pages[4].id }),
    call(f, 'DELETE', `/stories/${story.id}/checkpoints/${cp.id}`),
  ]);
  assert.deepEqual(results.map((r) => r.status), [422, 422, 422, 422]);
});

// ---------------------------------------------------------------------------
// POST /:id/review
// ---------------------------------------------------------------------------

test('review: con trang trong / diem dung thieu -> 422 kem danh sach; reviewedAt van null', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'short');
  await fillPages(story, [3]);

  const res = await call(f, 'POST', `/stories/${story.id}/review`);
  assert.equal(res.status, 422);
  const errs = res.body.errors.map((e) => e.path);
  assert.ok(errs.includes(`pages.${story.pages.find((p) => p.pageOrder === 3).id}`));
  // Khung short co 4 diem dung chua viet.
  assert.equal(errs.filter((p) => p.startsWith('checkpoints.')).length, 4);
  assert.equal((await storyRow(story.id)).reviewedAt, null);
});

test('review: du -> dat reviewedAt', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  await fillPages(story);
  const res = await call(f, 'POST', `/stories/${story.id}/review`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok((await storyRow(story.id)).reviewedAt instanceof Date);
  assert.ok(res.body.data.story.reviewedAt);
});

// ---------------------------------------------------------------------------
// generating -> 409
// ---------------------------------------------------------------------------

test('moi thao tac editor khi generating -> 409', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, 'custom');
  const add = await call(f, 'POST', `/stories/${story.id}/checkpoints`, { type: 'reflection', afterPageId: story.pages[3].id });
  const cp = add.body.data.story.checkpoints[0];
  await prisma.story.update({ where: { id: story.id }, data: { status: 'generating' } });

  const s = `/stories/${story.id}`;
  const results = await Promise.all([
    call(f, 'PUT', `${s}/pages/${story.pages[0].id}`, { contentText: 'x' }),
    call(f, 'PUT', `${s}/checkpoints/${cp.id}`, { question: 'Q?' }),
    call(f, 'POST', `${s}/pages`, {}),
    call(f, 'DELETE', `${s}/pages/${story.pages[1].id}`),
    call(f, 'POST', `${s}/checkpoints`, { type: 'emotion_self', afterPageId: story.pages[2].id }),
    call(f, 'DELETE', `${s}/checkpoints/${cp.id}`),
    call(f, 'POST', `${s}/review`),
  ]);
  assert.deepEqual(results.map((r) => r.status), [409, 409, 409, 409, 409, 409, 409]);
});
