import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

// Anh bia = anh mot canh: mac dinh canh 1, phu huynh chon canh khac, null -> ve mac dinh.
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

// Key la URL day du -> assetUrl tra nguyen (khong phu thuoc cau hinh Cloudinary).
const IMG = (n) => `https://img.test/cover-${n}.png`;

/** Truyen chu de voi 2 canh: canh 1 va canh 2 (canh 2 tuy chon co anh). */
async function storyWithScenes({ token, user }, { firstReady = true, secondReady = true } = {}) {
  const bo = await createCharacter(user.id, 'Bo');
  const res = await api.request('POST', '/stories', {
    token,
    body: { topicId: topic.id, length: 'medium', title: 'Bo và bìa truyện', characters: [{ characterId: bo.id, isMain: true }] },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const storyId = res.body.data.story.id;
  const scenes = await prisma.storyScene.findMany({ where: { storyId }, orderBy: { sceneOrder: 'asc' } });
  const first = scenes.find((s) => s.sceneOrder === 1);
  await prisma.storyScene.update({
    where: { id: first.id },
    data: firstReady ? { imageKey: IMG(1), imageStatus: 'ready' } : { imageKey: null, imageStatus: 'none' },
  });
  const maxOrder = Math.max(...scenes.map((s) => s.sceneOrder));
  const second = await prisma.storyScene.create({
    data: {
      storyId,
      sceneOrder: maxOrder + 1,
      description: 'A second scene.',
      ...(secondReady ? { imageKey: IMG(2), imageStatus: 'ready' } : { imageStatus: 'generating' }),
    },
  });
  return { storyId, first, second };
}

const putCover = (token, storyId, sceneId) => api.request('PUT', `/stories/${storyId}/cover`, { token, body: { sceneId } });

test('anh bia: mac dinh canh 1, chon canh khac, null ve mac dinh; competency theo chu de', { skip }, async () => {
  const parent = await createParent();
  const { storyId, second } = await storyWithScenes(parent);
  const competency = (await prisma.topic.findUnique({ where: { id: topic.id }, include: { skill: true } })).skill.caselCode;

  const detail = await api.request('GET', `/stories/${storyId}`, { token: parent.token });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.data.story.cover, { imageUrl: IMG(1), competency });
  assert.equal(detail.body.data.story.coverSceneId, null);

  const set = await putCover(parent.token, storyId, second.id);
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.data.story.coverSceneId, second.id);
  assert.equal(set.body.data.story.cover.imageUrl, IMG(2));
  assert.ok(Array.isArray(set.body.data.story.pages), 'tra chi tiet truyen');

  const list = await api.request('GET', '/stories', { token: parent.token });
  assert.equal(list.status, 200);
  const row = list.body.data.find((s) => s.id === storyId);
  assert.deepEqual(row.cover, { imageUrl: IMG(2), competency });

  const reset = await putCover(parent.token, storyId, null);
  assert.equal(reset.status, 200);
  assert.equal(reset.body.data.story.coverSceneId, null);
  assert.equal(reset.body.data.story.cover.imageUrl, IMG(1));
});

test('anh bia: canh chua co anh / canh truyen khac -> 422; khong co anh nao -> imageUrl null', { skip }, async () => {
  const parent = await createParent();
  const { storyId, second } = await storyWithScenes(parent, { firstReady: false, secondReady: false });
  const other = await storyWithScenes(parent);

  const notReady = await putCover(parent.token, storyId, second.id);
  assert.equal(notReady.status, 422);
  assert.equal(notReady.body.message, 'Cảnh này chưa có ảnh');

  const foreign = await putCover(parent.token, storyId, other.second.id);
  assert.equal(foreign.status, 422);

  const detail = await api.request('GET', `/stories/${storyId}`, { token: parent.token });
  assert.equal(detail.body.data.story.cover.imageUrl, null);
  assert.ok(detail.body.data.story.cover.competency, 'van co nang luc de Web ve bia du phong');

  // Nguoi khac khong doi duoc bia.
  const stranger = await createParent();
  const res = await putCover(stranger.token, other.storyId, other.second.id);
  assert.equal(res.status, 404);
});
