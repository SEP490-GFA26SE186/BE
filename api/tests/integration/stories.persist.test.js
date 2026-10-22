import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  prisma,
  createParent,
  createWallet,
  createChild,
  createCharacter,
  createFixedSlotTopic,
  retireTopic,
  startServer,
} from './_fixtures.js';
import { startGeneration } from '../../src/modules/stories/stories.generation.service.js';
import {
  finalizeFailure,
  markProcessing,
  loadGenerationInput,
  persistAiResult,
} from '../../src/modules/stories/stories.generation.store.js';
import { buildAiRequest } from '../../src/modules/stories/lib/aiRequest.js';
import { loadStorySettings } from '../../src/modules/stories/lib/storySettings.js';

const skip = !hasTestDb;
let api;
let topic;
let cost;

const sampleResponse = () =>
  JSON.parse(readFileSync(new URL('../../../ai/docs/samples/story_response.json', import.meta.url), 'utf8'));

before(async () => {
  if (skip) return;
  api = await startServer();
  // Kieu diem dung co dinh (emotion_self, perspective, problem_solving) thay vi chon mau ngau nhien.
  topic = await createFixedSlotTopic();
  cost = (await loadStorySettings(prisma)).storyTextCost.medium; // truyen trong test mac dinh 'medium'
  assert.ok(cost > 0, 'ai_cost.story_text.medium tren DB test phai > 0 de kiem giu credit');
});

after(async () => {
  if (topic) await retireTopic(topic);
  if (api) await api.close();
  await prisma.$disconnect();
});

async function family(balance) {
  const { user, token } = await createParent();
  await createWallet(user.id, balance);
  await prisma.walletLedger.create({
    data: {
      userId: user.id,
      walletType: 'credit',
      entryType: 'credit_grant',
      amount: BigInt(balance),
      balanceAfter: BigInt(balance),
      idempotencyKey: `test:grant:${crypto.randomUUID()}`,
    },
  });
  const child = await createChild(user.id, 'Bin');
  const bin = await createCharacter(user.id, 'Bin', { childId: child.id, appearance: 'Bin 6 tuổi, tóc ngắn' });
  const mit = await createCharacter(user.id, 'Mít');
  return { user, token, bin, mit };
}

async function createStory(f) {
  const res = await api.request('POST', '/stories', {
    token: f.token,
    body: {
      topicId: topic.id,
      length: 'medium',
      title: 'Bin và Mít',
      characters: [
        { characterId: f.bin.id, isMain: true },
        { characterId: f.mit.id, isMain: false },
      ],
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  // Truyen chuyen mau cu (truoc spec family-story) con `situation`: van gui AI nhu boi canh bo sung.
  await prisma.story.update({ where: { id: res.body.data.story.id }, data: { situation: '{NV1} giận vì {NV2} lấy xe.' } });
  return res.body.data.story;
}

const noEnqueue = async () => {};

/** Truyen medium -> startGeneration (enqueue stub) -> markProcessing. Tra { f, story, aiRequestId, response }. */
async function generatingStory({ prepare } = {}) {
  const f = await family(cost + 3);
  const story = await createStory(f);
  if (prepare) await prepare(story);
  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: noEnqueue });
  assert.equal(await markProcessing(prisma, aiRequestId, 1), true);
  const response = { ...sampleResponse(), request_id: aiRequestId };
  return { f, story, aiRequestId, response };
}

const content = (storyId) =>
  prisma.story.findUnique({
    where: { id: storyId },
    include: {
      scenes: { orderBy: { sceneOrder: 'asc' } },
      pages: { orderBy: { pageOrder: 'asc' } },
      checkpoints: {
        include: { afterPage: { select: { pageOrder: true } }, options: { orderBy: { optionOrder: 'asc' } } },
      },
    },
  });

const ledgerTypes = async (aiRequestId) =>
  (await prisma.walletLedger.findMany({ where: { refId: aiRequestId }, orderBy: { id: 'asc' } })).map(
    (r) => r.entryType,
  );

const byAfter = (story) =>
  new Map(story.checkpoints.map((c) => [c.afterPage.pageOrder, c]));

// ---------------------------------------------------------------------------

test('markProcessing: queued -> processing, attempts = min(attempt, 3); ket thuc -> false', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: noEnqueue });

  assert.equal(await markProcessing(prisma, aiRequestId, 5), true);
  let req = await prisma.aiRequest.findUnique({ where: { id: aiRequestId } });
  assert.equal(req.status, 'processing');
  assert.equal(req.attempts, 3);

  assert.equal(await markProcessing(prisma, aiRequestId, 2), true);
  req = await prisma.aiRequest.findUnique({ where: { id: aiRequestId } });
  assert.equal(req.attempts, 2);

  await finalizeFailure(prisma, { aiRequestId, status: 'failed', code: 'X', message: 'y' });
  assert.equal(await markProcessing(prisma, aiRequestId, 3), false);
  assert.equal((await prisma.aiRequest.findUnique({ where: { id: aiRequestId } })).status, 'failed');
});

test('loadGenerationInput: du lieu cho buildAiRequest, ten da token hoa', { skip }, async () => {
  const { aiRequestId } = await generatingStory();
  const input = await loadGenerationInput(prisma, aiRequestId);
  const payload = buildAiRequest(input);

  assert.equal(payload.request_id, aiRequestId);
  assert.equal(payload.topic.title, topic.title);
  assert.ok(payload.topic.competency);
  assert.equal(payload.situation, '{NV1} giận vì {NV2} lấy xe.');
  assert.deepEqual(payload.pages, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  assert.deepEqual(
    payload.checkpoints.map((c) => [c.id, c.type, c.after]),
    [
      ['k1', 'emotion_self', 'p2'],
      ['k2', 'perspective', 'p4'],
      ['k3', 'problem_solving', 'p5'],
      ['k4', 'reflection', 'p8'],
    ],
  );
  assert.ok(payload.checkpoints[1].target);
  const nv1 = payload.characters.find((c) => c.token === '{NV1}');
  assert.equal(nv1.is_main, true);
  assert.equal(nv1.description, '{NV1} 6 tuổi, tóc ngắn');
  assert.deepEqual([...payload.forbidden_terms].sort(), ['Bin', 'Mít']);
  assert.equal(typeof payload.limits.page_max_words, 'number');
  assert.ok(Array.isArray(payload.blocked_keywords));
});

test('persistAiResult: ghi canh/trang/diem dung, truyen ready, ai_request succeeded, hold + consume', { skip }, async () => {
  const { f, story, aiRequestId, response } = await generatingStory();
  const oldSceneIds = (await content(story.id)).scenes.map((s) => s.id);

  assert.equal(await persistAiResult(prisma, { aiRequestId, response }), true);

  const s = await content(story.id);
  assert.equal(s.scenes.length, 3);
  assert.deepEqual(s.scenes.map((x) => x.sceneOrder), [1, 2, 3]);
  assert.deepEqual(s.scenes.map((x) => x.description), [response.scenes.s1, response.scenes.s2, response.scenes.s3]);
  assert.equal(s.scenes.some((x) => oldSceneIds.includes(x.id)), false);

  const sceneIdByKey = { s1: s.scenes[0].id, s2: s.scenes[1].id, s3: s.scenes[2].id };
  assert.equal(s.pages.length, 8);
  for (const p of s.pages) {
    const expected = response.pages[`p${p.pageOrder}`];
    assert.equal(p.contentText, expected.text);
    assert.equal(p.aiOriginalText, expected.text);
    assert.equal(p.origin, 'ai');
    assert.equal(p.sceneId, sceneIdByKey[expected.scene]);
    assert.equal(p.audioKey, null);
    assert.equal(p.audioStatus, 'none');
  }

  const cks = byAfter(s);
  const k1 = cks.get(2);
  assert.equal(k1.question, response.checkpoints.k1.question);
  assert.equal(k1.hint, response.checkpoints.k1.hint);
  assert.equal(k1.answerEmotion, 'angry');
  assert.equal(k1.origin, 'ai');
  assert.equal(k1.options.length, 0);

  const k2 = cks.get(4);
  assert.equal(k2.answerEmotion, null);
  assert.deepEqual(
    k2.options.map((o) => [o.optionOrder, o.text, o.isCorrect]),
    [
      [1, response.checkpoints.k2.options.o1, true],
      [2, response.checkpoints.k2.options.o2, false],
      [3, response.checkpoints.k2.options.o3, false],
    ],
  );

  const k3 = cks.get(5);
  assert.deepEqual(
    k3.options.map((o) => [o.role, o.text, o.feedback]),
    ['constructive', 'avoidant', 'impulsive'].map((r) => [
      r,
      response.checkpoints.k3.options[r].text,
      response.checkpoints.k3.options[r].feedback,
    ]),
  );

  const k4 = cks.get(8);
  assert.equal(k4.question, response.checkpoints.k4.question);
  assert.equal(k4.hint, null);
  assert.equal(k4.origin, 'ai');

  assert.equal(s.status, 'ready');
  assert.equal(s.reviewedAt, null);

  const req = await prisma.aiRequest.findUnique({ where: { id: aiRequestId } });
  assert.equal(req.status, 'succeeded');
  assert.equal(req.provider, 'gemini');
  assert.equal(req.modelName, response.usage.model);
  assert.equal(req.inputTokens, 1650);
  assert.equal(req.outputTokens, 1320);
  assert.equal(req.providerCostMicros, 0n);
  assert.ok(req.finishedAt);

  assert.deepEqual(await ledgerTypes(aiRequestId), ['credit_hold', 'credit_consume']);
  assert.equal(Number((await prisma.wallet.findUnique({ where: { userId: f.user.id } })).creditBalance), 3);

  // Lan hai: false, khong ghi gi them.
  const before2 = await content(story.id);
  assert.equal(await persistAiResult(prisma, { aiRequestId, response: { ...response, scenes: { s1: 'x', s2: 'y', s3: 'z' } } }), false);
  assert.deepEqual(await ledgerTypes(aiRequestId), ['credit_hold', 'credit_consume']);
  assert.deepEqual(await content(story.id), before2);
});

test('persistAiResult vs finalizeFailure song song: dung mot ben thang, khong vua release vua consume (Review Focus 3)', { skip }, async () => {
  for (let i = 0; i < 3; i += 1) {
    const { story, aiRequestId, response } = await generatingStory();
    const [persisted, finalized] = await Promise.all([
      persistAiResult(prisma, { aiRequestId, response }),
      finalizeFailure(prisma, { aiRequestId, status: 'failed', code: 'STALE_JOB', message: 'kẹt' }),
    ]);
    assert.equal(persisted !== finalized, true, `persist=${persisted} finalize=${finalized}`);

    const types = await ledgerTypes(aiRequestId);
    const s = await content(story.id);
    const req = await prisma.aiRequest.findUnique({ where: { id: aiRequestId } });
    if (persisted) {
      assert.deepEqual(types, ['credit_hold', 'credit_consume']);
      assert.equal(req.status, 'succeeded');
      assert.ok(s.pages.every((p) => p.origin === 'ai' && p.contentText));
    } else {
      assert.deepEqual(types, ['credit_hold', 'credit_release']);
      assert.equal(req.status, 'failed');
      assert.ok(s.pages.every((p) => p.origin !== 'ai' && !p.aiOriginalText));
      assert.equal(s.status, 'draft');
    }
  }
});

test('persistAiResult: truyen bi xoa mem truoc khi ghi -> true, khong doi noi dung, succeeded, hold + consume (Review Focus 4)', { skip }, async () => {
  const { story, aiRequestId, response } = await generatingStory();
  await prisma.story.update({ where: { id: story.id }, data: { deletedAt: new Date() } });
  const before = await content(story.id);

  assert.equal(await persistAiResult(prisma, { aiRequestId, response }), true);

  assert.deepEqual(await content(story.id), before);
  assert.equal((await prisma.aiRequest.findUnique({ where: { id: aiRequestId } })).status, 'succeeded');
  assert.deepEqual(await ledgerTypes(aiRequestId), ['credit_hold', 'credit_consume']);
});

test('persistAiResult: truyen da co chu nguoi viet, da duyet -> sinh lai thay chu, reviewedAt ve null', { skip }, async () => {
  const { story, aiRequestId, response } = await generatingStory({
    prepare: async (st) => {
      for (const p of st.pages) {
        await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `Chữ người viết ${p.pageOrder}.` } });
      }
      await prisma.story.update({ where: { id: st.id }, data: { status: 'ready', reviewedAt: new Date() } });
    },
  });

  assert.equal(await persistAiResult(prisma, { aiRequestId, response }), true);

  const s = await content(story.id);
  assert.ok(s.pages.every((p) => p.contentText === response.pages[`p${p.pageOrder}`].text && p.origin === 'ai'));
  assert.equal(s.reviewedAt, null);
  assert.equal(s.status, 'ready');
});
