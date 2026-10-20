import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  prisma,
  createParent,
  createUser,
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

/** Phu huynh + 2 nhan vat (Bin gan voi con Bin, Mit khong gan) + con Na khong la nhan vat. */
async function family() {
  const { user, token } = await createParent();
  const childBin = await createChild(user.id, 'Bin');
  await createChild(user.id, 'Na');
  const bin = await createCharacter(user.id, 'Bin', { childId: childBin.id });
  const mit = await createCharacter(user.id, 'Mít');
  return { user, token, bin, mit };
}

const createBody = (f, over = {}) => ({
  topicId: topic.id,
  length: 'medium',
  title: 'Bin và Mít',
  characters: [
    { characterId: f.bin.id, isMain: true },
    { characterId: f.mit.id, isMain: false },
  ],
  ...over,
});

const createStory = async (f, over) => {
  const res = await api.request('POST', '/stories', { token: f.token, body: createBody(f, over) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.story;
};

test('POST /stories medium -> 8 trang trong, 1 canh tam, 4 diem dung dung vi tri/kieu, draft', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);

  assert.equal(story.status, 'draft');
  assert.equal(story.length, 'medium');
  assert.equal(story.scenes.length, 1);
  assert.equal(story.scenes[0].description, '');
  assert.equal(story.scenes[0].sceneOrder, 1);

  assert.deepEqual(story.pages.map((p) => p.pageOrder), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(story.pages.every((p) => p.contentText === null && p.origin === 'human'));
  assert.ok(story.pages.every((p) => p.sceneId === story.scenes[0].id));

  assert.deepEqual(
    story.checkpoints.map((c) => [c.type, c.afterPageOrder]),
    [['emotion_self', 2], ['perspective', 4], ['problem_solving', 5], ['reflection', 8]],
  );
  const byType = Object.fromEntries(story.checkpoints.map((c) => [c.type, c]));
  assert.equal(byType.perspective.targetToken, '{NV2}');
  assert.equal(byType.emotion_self.answerEmotion, 'neutral');
  assert.equal(byType.emotion_self.targetToken, null);
  assert.equal(byType.reflection.answerEmotion, null);

  assert.deepEqual(story.characters, [
    { token: '{NV1}', characterId: f.bin.id, name: 'Bin', isMain: true },
    { token: '{NV2}', characterId: f.mit.id, name: 'Mít', isMain: false },
  ]);
});

test('POST /stories: situation co ten nhan vat -> luu dang token', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, { situation: 'Bin không muốn cho Mít mượn xe.' });
  assert.equal(story.situation, '{NV1} không muốn cho {NV2} mượn xe.');
  const row = await prisma.story.findUnique({ where: { id: story.id } });
  assert.equal(row.situation, '{NV1} không muốn cho {NV2} mượn xe.');
});

test('POST /stories: situation co ten con khong la nhan vat -> 422, khong tao gi', { skip }, async () => {
  const f = await family();
  const res = await api.request('POST', '/stories', {
    token: f.token,
    body: createBody(f, { situation: 'Na giành đồ chơi của Bin.' }),
  });
  assert.equal(res.status, 422);
  assert.match(res.body.message, /tên của con chưa có trong truyện/);
  assert.equal(await prisma.story.count({ where: { ownerId: f.user.id } }), 0);
});

test('POST /stories: nhan vat cua phu huynh khac -> 400/404', { skip }, async () => {
  const f = await family();
  const other = await family();
  const res = await api.request('POST', '/stories', {
    token: f.token,
    body: createBody(f, {
      characters: [
        { characterId: f.bin.id, isMain: true },
        { characterId: other.mit.id, isMain: false },
      ],
    }),
  });
  assert.ok([400, 404].includes(res.status), `status ${res.status}`);
  assert.equal(await prisma.story.count({ where: { ownerId: f.user.id } }), 0);
});

test('POST /stories: hai isMain -> 400', { skip }, async () => {
  const f = await family();
  const res = await api.request('POST', '/stories', {
    token: f.token,
    body: createBody(f, {
      characters: [
        { characterId: f.bin.id, isMain: true },
        { characterId: f.mit.id, isMain: true },
      ],
    }),
  });
  assert.equal(res.status, 400);
});

test('POST /stories custom -> 4 trang, 0 diem dung', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, {
    length: 'custom',
    characters: [{ characterId: f.bin.id, isMain: true }],
  });
  assert.equal(story.pages.length, 4);
  assert.equal(story.checkpoints.length, 0);
});

test('GET /stories/:id: nguoi khac -> 404; specialist doc duoc', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);

  const other = await createParent();
  const res = await api.request('GET', `/stories/${story.id}`, { token: other.token });
  assert.equal(res.status, 404);

  const mod = await createUser({ role: 'specialist' });
  const res2 = await api.request('GET', `/stories/${story.id}`, { token: mod.token });
  assert.equal(res2.status, 200);
  assert.equal(res2.body.data.story.id, story.id);
  assert.equal(res2.body.data.story.pages.length, 8);
});

test('GET /stories: danh sach cua minh, phan trang', { skip }, async () => {
  const f = await family();
  await createStory(f);
  await createStory(f, { title: 'Truyện 2' });
  const res = await api.request('GET', '/stories?page=1&limit=1', { token: f.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.pagination.total, 2);
});

test('PUT /stories/:id: dang generating -> 409', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  await prisma.story.update({ where: { id: story.id }, data: { status: 'generating' } });
  const res = await api.request('PUT', `/stories/${story.id}`, { token: f.token, body: { title: 'Mới' } });
  assert.equal(res.status, 409);
});

test('PUT /stories/:id: sua title + situation (qua token)', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const res = await api.request('PUT', `/stories/${story.id}`, {
    token: f.token,
    body: { title: 'Tên mới', situation: 'Mít buồn.' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.story.title, 'Tên mới');
  assert.equal(res.body.data.story.situation, '{NV2} buồn.');
});

test('PUT /stories/:id/characters: da co trang co chu -> 409', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  await prisma.storyPage.update({ where: { id: story.pages[0].id }, data: { contentText: '{NV1} đi học.' } });
  const res = await api.request('PUT', `/stories/${story.id}/characters`, {
    token: f.token,
    body: { characters: [{ characterId: f.mit.id, isMain: true }, { characterId: f.bin.id, isMain: false }] },
  });
  assert.equal(res.status, 409);
});

test('PUT /stories/:id/characters: chua co chu -> thay token, targetToken ve nhan vat phu dau tien moi', { skip }, async () => {
  const f = await family();
  const extra = await createCharacter(f.user.id, 'Mẹ');
  const story = await createStory(f);

  const res = await api.request('PUT', `/stories/${story.id}/characters`, {
    token: f.token,
    body: {
      characters: [
        { characterId: extra.id, isMain: false },
        { characterId: f.mit.id, isMain: true },
        { characterId: f.bin.id, isMain: false },
      ],
    },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const updated = res.body.data.story;
  assert.deepEqual(
    updated.characters.map((c) => [c.token, c.name, c.isMain]),
    [['{NV1}', 'Mít', true], ['{NV2}', 'Mẹ', false], ['{NV3}', 'Bin', false]],
  );
  const perspective = updated.checkpoints.find((c) => c.type === 'perspective');
  assert.equal(perspective.targetToken, '{NV2}');

  const rows = await prisma.storyCharacter.findMany({ where: { storyId: story.id } });
  assert.equal(rows.length, 3);
});

test('DELETE /stories/:id -> xoa mem; GET sau do -> 404', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const res = await api.request('DELETE', `/stories/${story.id}`, { token: f.token });
  assert.equal(res.status, 200);
  const row = await prisma.story.findUnique({ where: { id: story.id } });
  assert.ok(row.deletedAt instanceof Date);
  const res2 = await api.request('GET', `/stories/${story.id}`, { token: f.token });
  assert.equal(res2.status, 404);
});

test('Route editor/generation da khai bao, tam tra 501', { skip }, async () => {
  const f = await family();
  const story = await createStory(f);
  const res = await api.request('POST', `/stories/${story.id}/publish-version`, { token: f.token });
  assert.equal(res.status, 501);
  const res2 = await api.request('POST', `/stories/${story.id}/generate`, { token: f.token });
  assert.equal(res2.status, 501);
});

test('PUT /stories/:id/characters: bo nhan vat con nam trong situation -> 422, khong doi gi', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, { situation: 'Bin giận Mít.' });

  const res = await api.request('PUT', `/stories/${story.id}/characters`, {
    token: f.token,
    body: { characters: [{ characterId: f.bin.id, isMain: true }] },
  });
  assert.equal(res.status, 422);
  assert.match(res.body.message, /Mít/);

  const row = await prisma.story.findUnique({ where: { id: story.id } });
  assert.equal(row.situation, '{NV1} giận {NV2}.');
  assert.equal(await prisma.storyCharacter.count({ where: { storyId: story.id } }), 2);
});

test('PUT /stories/:id/characters: giu nhan vat, doi vai -> situation chuyen sang token moi', { skip }, async () => {
  const f = await family();
  const story = await createStory(f, { situation: 'Bin giận Mít.' });
  const res = await api.request('PUT', `/stories/${story.id}/characters`, {
    token: f.token,
    body: { characters: [{ characterId: f.mit.id, isMain: true }, { characterId: f.bin.id, isMain: false }] },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.story.situation, '{NV2} giận {NV1}.');
});
