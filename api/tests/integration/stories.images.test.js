import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma, createParent, createWallet, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';
import { drawStoryImages, queueStoryImages, redrawScene, resumeAfterPortrait, startPortrait } from '../../src/modules/stories/stories.images.service.js';
import {
  finalizeImageFailure,
  loadImageCosts,
  loadPortraitInput,
  loadSceneInput,
  persistImageResult,
  scrubNames,
} from '../../src/modules/stories/stories.images.store.js';
import { markProcessing } from '../../src/modules/stories/stories.generation.store.js';

const skip = !hasTestDb;
let api;
let topic;
let costs;

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await getSeededTopic();
  costs = await loadImageCosts(prisma);
  assert.ok(costs.character_portrait > 0 && costs.scene_image > 0, 'DB test can ai_cost.character_portrait / scene_image > 0');
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

async function family(balance) {
  const { user, token } = await createParent();
  await createWallet(user.id, balance);
  if (balance > 0) {
    await prisma.walletLedger.create({
      data: { userId: user.id, walletType: 'credit', entryType: 'credit_grant', amount: BigInt(balance), balanceAfter: BigInt(balance), idempotencyKey: `test:grant:${crypto.randomUUID()}` },
    });
  }
  const child = await createChild(user.id, 'Bin');
  const bin = await createCharacter(user.id, 'Bin', { childId: child.id });
  await prisma.character.update({ where: { id: bin.id }, data: { appearance: 'Bin là bé trai 6 tuổi, tóc ngắn đen, áo thun xanh' } });
  const ba = await createCharacter(user.id, 'Bà');
  await prisma.character.update({ where: { id: ba.id }, data: { appearance: 'Bà nội tóc bạc búi gọn, áo bà ba nâu' } });
  return { user, token, bin, ba };
}

/** Truyen bat tranh voi 2 canh da co mo ta (nhu sau khi AI viet xong). */
async function storyWithScenes(f) {
  const res = await api.request('POST', '/stories', {
    token: f.token,
    body: { topicId: topic.id, length: 'medium', title: 'Bin và Bà', useAiImage: true,
      characters: [{ characterId: f.bin.id, isMain: true }, { characterId: f.ba.id, isMain: false }] },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const story = res.body.data.story;
  const first = await prisma.storyScene.findFirst({ where: { storyId: story.id } });
  await prisma.storyScene.update({ where: { id: first.id }, data: { description: 'A boy plays with a red train.' } });
  const second = await prisma.storyScene.create({ data: { storyId: story.id, sceneOrder: 99, description: 'The boy and grandmother laugh.' } });
  return { story, scenes: [first.id, second.id] };
}

function recorder() {
  const calls = [];
  return { calls, enqueue: async (...args) => calls.push(args) };
}
const balanceOf = async (userId) => Number((await prisma.wallet.findUnique({ where: { userId } })).creditBalance);
const ok = (aiRequestId, response) => markProcessing(prisma, aiRequestId, 1).then(() => persistImageResult(prisma, { aiRequestId, response }));

test('scrubNames: bo ten trong gia dinh khoi mo ta ngoai hinh', () => {
  assert.equal(scrubNames('Bin là bé trai 6 tuổi, tóc đen', ['Bin']), 'là bé trai 6 tuổi, tóc đen');
  assert.equal(scrubNames('Bé trai, giống Bin và Mít', ['Bin', 'Mít']), 'Bé trai, giống và');
});

test('chan dung: giu credit, 202, dang ve thi 409; input khong co ten that; xong -> ready + tru credit', { skip }, async () => {
  const f = await family(10);
  const { calls, enqueue } = recorder();
  const { aiRequestId } = await startPortrait(f.user, f.bin.id, { enqueue });
  assert.deepEqual(calls[0][0], 'character_portrait');
  assert.equal(await balanceOf(f.user.id), 10 - costs.character_portrait);
  assert.equal((await prisma.character.findUnique({ where: { id: f.bin.id } })).portraitStatus, 'queued');
  await assert.rejects(startPortrait(f.user, f.bin.id, { enqueue }), (e) => e.statusCode === 409);

  const input = await loadPortraitInput(prisma, aiRequestId);
  assert.ok(!input.description.includes('Bin') && input.description.includes('tóc ngắn đen'));
  assert.ok(input.forbidden_terms.includes('Bin') && input.forbidden_terms.includes('Bà'));
  assert.equal(input.storage_prefix, `characters/${f.bin.id}/portraits`);

  await ok(aiRequestId, { portrait_keys: ['characters/x/portraits/p-1.jpg'], usage: { provider: 'cloudflare', model: 'm', units: 1 } });
  const c = await prisma.character.findUnique({ where: { id: f.bin.id } });
  assert.deepEqual([c.portraitStatus, c.portraitImageKey], ['ready', 'characters/x/portraits/p-1.jpg']);
  assert.equal(await balanceOf(f.user.id), 10 - costs.character_portrait);

  const api202 = await api.request('POST', `/characters/${f.ba.id}/portrait`, { token: f.token });
  assert.ok([202, 503].includes(api202.status), JSON.stringify(api202.body)); // 503 neu khong co Redis trong test
});

test('truyen bat tranh: ve chan dung con thieu, canh CHO; chan dung xong -> canh chay voi anh tham chieu', { skip }, async () => {
  const f = await family(20);
  const { story, scenes } = await storyWithScenes(f);
  const { calls, enqueue } = recorder();
  const r = await queueStoryImages(story.id, { userId: f.user.id, enqueue });
  assert.deepEqual(r, { portraits: 2, scenes: 0, waiting: 2, insufficientCredit: false });
  assert.deepEqual(calls.map((c) => c[0]), ['character_portrait', 'character_portrait']);

  const portraitReqs = await prisma.aiRequest.findMany({ where: { userId: f.user.id, requestType: 'character_portrait' } });
  for (const pr of portraitReqs) await ok(pr.id, { portrait_keys: [`p/${pr.characterId}.jpg`], usage: {} });
  await resumeAfterPortrait(f.bin.id, { enqueue });
  const sceneCalls = calls.filter((c) => c[0] === 'scene_image');
  assert.equal(sceneCalls.length, 2);

  const sceneReq = await prisma.aiRequest.findFirst({ where: { sceneId: scenes[0], requestType: 'scene_image' } });
  const input = await loadSceneInput(prisma, sceneReq.id);
  assert.equal(input.scene_description, 'A boy plays with a red train.');
  assert.equal(input.characters[0].portrait_key, `p/${f.bin.id}.jpg`); // nhan vat chinh dung dau
  assert.ok(input.characters.every((c) => !c.description.includes('Bin')));
  assert.equal(input.storage_prefix, `stories/${story.id}/scenes`);
  assert.equal(await balanceOf(f.user.id), 20 - 2 * costs.character_portrait - 2 * costs.scene_image);

  await ok(sceneReq.id, { image_key: 'stories/s/scenes/1.jpg', usage: {} });
  const failReq = await prisma.aiRequest.findFirst({ where: { sceneId: scenes[1], requestType: 'scene_image' } });
  await finalizeImageFailure(prisma, { aiRequestId: failReq.id, status: 'failed', code: 'PROVIDER_ERROR', message: 'x' });
  const after = await prisma.storyScene.findMany({ where: { id: { in: scenes } } });
  assert.deepEqual(after.map((s) => s.imageStatus).sort(), ['failed', 'ready']);
  assert.equal(await balanceOf(f.user.id), 20 - 2 * costs.character_portrait - costs.scene_image, 'canh loi duoc hoan');

  const detail = await api.request('GET', `/stories/${story.id}`, { token: f.token });
  const s1 = detail.body.data.story.scenes.find((s) => s.id === scenes[0]);
  assert.equal(s1.imageStatus, 'ready');
  assert.ok(s1.imageUrl === null || typeof s1.imageUrl === 'string');
});

test('ve lai mot canh: tru credit lan nua; dang ve -> 409; khong du credit -> 402; tranh tat thi bat len', { skip }, async () => {
  const f = await family(2);
  const { story, scenes } = await storyWithScenes(f);
  await prisma.character.updateMany({ where: { id: { in: [f.bin.id, f.ba.id] } }, data: { portraitStatus: 'ready', portraitImageKey: 'p.jpg' } });
  await prisma.story.update({ where: { id: story.id }, data: { useAiImage: false } });
  const { enqueue } = recorder();
  const r = await redrawScene(f.user, story.id, scenes[0], { enqueue });
  assert.equal(r.scenes, 1);
  assert.equal((await prisma.story.findUnique({ where: { id: story.id } })).useAiImage, true);
  await assert.rejects(redrawScene(f.user, story.id, scenes[0], { enqueue }), (e) => e.statusCode === 409);
  await prisma.wallet.update({ where: { userId: f.user.id }, data: { creditBalance: 0 } });
  await assert.rejects(drawStoryImages(f.user, story.id, { enqueue }), (e) => e.statusCode === 402);
});

test('nhan vat khong co mo ta ngoai hinh -> 422; khong phai chu -> 404', { skip }, async () => {
  const f = await family(5);
  const other = await family(5);
  await prisma.character.update({ where: { id: f.ba.id }, data: { appearance: ' ' } });
  await assert.rejects(startPortrait(f.user, f.ba.id, { enqueue: recorder().enqueue }), (e) => e.statusCode === 422);
  await assert.rejects(startPortrait(other.user, f.bin.id, { enqueue: recorder().enqueue }), (e) => e.statusCode === 404);
});
