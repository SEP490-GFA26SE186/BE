import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  prisma,
  createParent,
  createWallet,
  createChild,
  createCharacter,
  getSeededTopic,
  startServer,
} from './_fixtures.js';
import generationService, {
  startGeneration,
  getGeneration,
} from '../../src/modules/stories/stories.generation.service.js';
import { finalizeFailure } from '../../src/modules/stories/stories.generation.store.js';
import { loadStorySettings } from '../../src/modules/stories/lib/storySettings.js';

const skip = !hasTestDb;
let api;
let topic;
let cost;

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await getSeededTopic();
  cost = (await loadStorySettings(prisma)).storyTextCost.medium; // truyen trong test mac dinh 'medium'
  assert.ok(cost > 0, 'ai_cost.story_text.medium tren DB test phai > 0 de kiem giu credit');
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

/** Phu huynh + vi `balance` credit (kem dong credit_grant cho bat bien so du = tong ledger) + nhan vat Bin. */
async function family(balance) {
  const { user, token } = await createParent();
  await createWallet(user.id, balance);
  if (balance > 0) {
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
  }
  const child = await createChild(user.id, 'Bin');
  const bin = await createCharacter(user.id, 'Bin', { childId: child.id });
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

/** Stub enqueue ghi lai cac lan goi. */
function recorder() {
  const calls = [];
  const enqueue = async (...args) => {
    calls.push(args);
  };
  return { calls, enqueue };
}

const failingEnqueue = async () => {
  throw new Error('Redis sập');
};

const storyRow = (id) => prisma.story.findUnique({ where: { id } });
const requestsOf = (storyId) => prisma.aiRequest.findMany({ where: { storyId }, orderBy: { createdAt: 'asc' } });
const ledgerFor = (aiRequestId) =>
  prisma.walletLedger.findMany({ where: { refId: aiRequestId }, orderBy: { id: 'asc' } });
const balanceOf = async (userId) => Number((await prisma.wallet.findUnique({ where: { userId } })).creditBalance);

async function fillAllPages(story) {
  for (const p of story.pages) {
    await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `Trang ${p.pageOrder}.` } });
  }
}

const rejectsWith = (promise, statusCode) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, statusCode, err.message);
    return true;
  });

// ---------------------------------------------------------------------------
// Xep mau cau hoi vao o cham (spec casel-pedagogy §6.1)
// ---------------------------------------------------------------------------

/**
 * Topic moi cung nang luc voi topic seed, gan cac ky nang con moi. `subs`: moi phan tu
 * { isActive, templates: [{ isActive, answerFormat, needsTarget, versions: ['published'|'draft', ...] }] }
 * (version danh so 1..n theo thu tu). Tra ve { topic, subSkills: [{ id, templates: [{ id, versionIds }] }] }.
 */
async function topicWithSubSkills(owner, subs) {
  const seeded = await prisma.topicSubSkill.findFirst({
    where: { topicId: topic.id },
    select: { subSkill: { select: { skillId: true } } },
  });
  const { skillId } = seeded.subSkill;
  const tag = crypto.randomUUID().slice(0, 8);
  const t = await prisma.topic.create({
    // displayOrder lon: khong thanh topic dau tien ma getSeededTopic chon o lan chay sau.
    data: { title: `Topic thử ${tag}`, skillId, guidance: 'x', displayOrder: 1_000_000, createdBy: owner.id },
  });
  const out = [];
  for (const [i, sub] of subs.entries()) {
    const ss = await prisma.eqSubSkill.create({
      data: {
        skillId, code: `it_${tag}_${i}`, nameVi: `Kỹ năng thử ${tag} ${i}`,
        descriptionVi: 'x', isActive: sub.isActive ?? true, displayOrder: i, createdBy: owner.id,
      },
    });
    await prisma.topicSubSkill.create({ data: { topicId: t.id, subSkillId: ss.id } });
    const templates = [];
    for (const tpl of sub.templates) {
      const qt = await prisma.questionTemplate.create({
        data: { subSkillId: ss.id, title: 'Mẫu thử', answerFormat: tpl.answerFormat ?? 'emotion_pick', isActive: tpl.isActive ?? true, createdBy: owner.id },
      });
      const versionIds = [];
      for (const [n, status] of tpl.versions.entries()) {
        const ver = await prisma.questionTemplateVersion.create({
          data: { templateId: qt.id, version: n + 1, status, questionFrame: 'Bé cảm thấy thế nào?', needsTarget: tpl.needsTarget ?? false, createdBy: owner.id },
        });
        versionIds.push(ver.id);
      }
      templates.push({ id: qt.id, versionIds });
    }
    out.push({ id: ss.id, templates });
  }
  return { topic: t, subSkills: out };
}

const postStory = (f, topicId, length = 'medium') =>
  api.request('POST', '/stories', {
    token: f.token,
    body: {
      topicId,
      length,
      title: 'Bin và Mít',
      characters: [
        { characterId: f.bin.id, isMain: true },
        { characterId: f.mit.id, isMain: false },
      ],
    },
  });

const checkpointRows = (storyId) =>
  prisma.storyCheckpoint.findMany({
    where: { storyId },
    orderBy: { afterPage: { pageOrder: 'asc' } },
    include: { afterPage: { select: { pageOrder: true } }, templateVersion: { include: { template: true } } },
  });

test('tao truyen AI: topic co ky nang con ma mau da tat het -> 422, khong tao truyen, so du credit khong doi (Review Focus 1-2)', { skip }, async () => {
  const f = await family(cost + 5);
  const { topic: t } = await topicWithSubSkills(f.user, [
    { templates: [{ isActive: false, versions: ['published'] }] },
  ]);
  const before = await balanceOf(f.user.id);

  const res = await postStory(f, t.id);
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.match(res.body.message, /mẫu câu hỏi/);
  assert.equal(await balanceOf(f.user.id), before);
  assert.equal(await prisma.story.count({ where: { ownerId: f.user.id } }), 0);
  assert.equal(await prisma.walletLedger.count({ where: { userId: f.user.id, entryType: 'credit_hold' } }), 0);
  await prisma.topic.update({ where: { id: t.id }, data: { isActive: false } });
});

test('tao truyen AI: o cham lay ban published moi nhat cua mau dang bat, bo ky nang con da tat; luu sub_skill/template_version/scored', { skip }, async () => {
  const f = await family(cost + 5);
  const { topic: t, subSkills } = await topicWithSubSkills(f.user, [
    { templates: [{ versions: ['published', 'published', 'draft'] }] },
    { isActive: false, templates: [{ answerFormat: 'role_choice', versions: ['published'] }] },
  ]);
  const res = await postStory(f, t.id);
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const rows = await checkpointRows(res.body.data.story.id);
  assert.deepEqual(rows.map((r) => r.afterPage.pageOrder), [2, 4, 5, 8]);
  const scored = rows.slice(0, 3);
  assert.ok(scored.every((r) => r.scored && r.subSkillId === subSkills[0].id));
  assert.ok(scored.every((r) => r.templateVersionId === subSkills[0].templates[0].versionIds[1]));
  assert.ok(scored.every((r) => r.type === 'emotion_self' && r.answerEmotion === 'neutral' && r.targetToken === null));
  assert.equal(rows[3].type, 'reflection');
  assert.equal(rows[3].scored, false);
  assert.equal(rows[3].subSkillId, null);
  assert.equal(rows[3].templateVersionId, null);
  await prisma.topic.update({ where: { id: t.id }, data: { isActive: false } });
});

test('tao truyen AI (topic seed): moi o cham thuoc ky nang con cua topic, mau dang bat, ban published', { skip }, async () => {
  const f = await family(0);
  const story = await createStory(f, 'long');
  const links = await prisma.topicSubSkill.findMany({ where: { topicId: topic.id }, select: { subSkillId: true } });
  const allowed = new Set(links.map((l) => l.subSkillId));
  const rows = await checkpointRows(story.id);
  const scored = rows.filter((r) => r.type !== 'reflection');
  assert.equal(scored.length, 4);
  for (const r of scored) {
    assert.ok(r.scored && allowed.has(r.subSkillId), `o sau trang ${r.afterPage.pageOrder}`);
    assert.equal(r.templateVersion.status, 'published');
    assert.ok(r.templateVersion.template.isActive);
    assert.equal(r.templateVersion.template.subSkillId, r.subSkillId);
  }
});

// ---------------------------------------------------------------------------
// startGeneration
// ---------------------------------------------------------------------------

test('startGeneration: thanh cong -> generating, ai_request queued, mot credit_hold, enqueue dung tham so', { skip }, async () => {
  const f = await family(cost + 5);
  const story = await createStory(f);
  const { calls, enqueue } = recorder();

  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue });

  assert.equal((await storyRow(story.id)).status, 'generating');
  const req = await prisma.aiRequest.findUnique({ where: { id: aiRequestId } });
  assert.equal(req.status, 'queued');
  assert.equal(req.requestType, 'story_text');
  assert.equal(req.storyId, story.id);
  assert.equal(req.userId, f.user.id);
  assert.equal(req.creditsCharged, cost);
  assert.equal(req.idempotencyKey, `story_text:${aiRequestId}`);

  const ledger = await ledgerFor(aiRequestId);
  assert.deepEqual(ledger.map((r) => r.entryType), ['credit_hold']);
  assert.equal(ledger[0].amount, BigInt(-cost));
  assert.equal(await balanceOf(f.user.id), 5);

  assert.deepEqual(calls, [['story_text', { ai_request_id: aiRequestId }, { jobId: aiRequestId }]]);
});

test('startGeneration: credit theo do dai truyen (ngan / dai tru dung gia cua do dai do)', { skip }, async () => {
  const { storyTextCost } = await loadStorySettings(prisma);
  for (const length of ['short', 'long']) {
    const price = storyTextCost[length];
    const f = await family(price + 1);
    const story = await createStory(f, length);
    const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: recorder().enqueue });
    assert.equal((await prisma.aiRequest.findUnique({ where: { id: aiRequestId } })).creditsCharged, price, length);
    assert.equal(await balanceOf(f.user.id), 1, length);
  }
});

test('POST /:id/generate -> 202 { aiRequestId }', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { calls, enqueue } = recorder();
  const original = generationService.startGeneration;
  generationService.startGeneration = (user, id) => original(user, id, { enqueue });
  try {
    const res = await api.request('POST', `/stories/${story.id}/generate`, { token: f.token });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.ok(res.body.data.aiRequestId);
    assert.equal(calls.length, 1);
  } finally {
    generationService.startGeneration = original;
  }
});

test('startGeneration: hai loi goi song song -> mot thanh cong, mot 409; dung mot ai_request, mot hold (Review Focus 2)', { skip }, async () => {
  const f = await family(cost * 3);
  const story = await createStory(f);
  const { calls, enqueue } = recorder();

  const results = await Promise.allSettled([
    startGeneration(f.user, story.id, { enqueue }),
    startGeneration(f.user, story.id, { enqueue }),
  ]);

  const ok = results.filter((r) => r.status === 'fulfilled');
  const bad = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].reason.statusCode, 409);

  const reqs = await requestsOf(story.id);
  assert.equal(reqs.length, 1);
  const holds = (await ledgerFor(reqs[0].id)).filter((r) => r.entryType === 'credit_hold');
  assert.equal(holds.length, 1);
  assert.equal(await balanceOf(f.user.id), cost * 2);
  assert.equal(calls.length, 1);
});

test('startGeneration: truyen dang generating -> 409', { skip }, async () => {
  const f = await family(cost * 2);
  const story = await createStory(f);
  const { enqueue } = recorder();
  await startGeneration(f.user, story.id, { enqueue });
  await rejectsWith(startGeneration(f.user, story.id, { enqueue }), 409);
});

test('startGeneration: truyen da co luot be doc -> 409; khong doi trang thai, khong ai_request, khong giu credit', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  await prisma.playSession.create({ data: { childId: f.bin.childId, storyId: story.id, isFirstPlay: true } });
  const { calls, enqueue } = recorder();

  await assert.rejects(startGeneration(f.user, story.id, { enqueue }), (err) => {
    assert.equal(err.statusCode, 409);
    assert.match(err.message, /đã được bé đọc/);
    return true;
  });

  assert.equal((await storyRow(story.id)).status, 'draft');
  assert.equal((await requestsOf(story.id)).length, 0);
  assert.equal(await balanceOf(f.user.id), cost);
  assert.equal(calls.length, 0);
});

test('startGeneration: khong du credit -> 402; truyen giu trang thai; khong ai_request', { skip }, async () => {
  const f = await family(cost - 1);
  const story = await createStory(f);
  const { calls, enqueue } = recorder();

  await rejectsWith(startGeneration(f.user, story.id, { enqueue }), 402);

  assert.equal((await storyRow(story.id)).status, 'draft');
  assert.equal((await requestsOf(story.id)).length, 0);
  assert.equal(await balanceOf(f.user.id), cost - 1);
  assert.equal(calls.length, 0);
});

test('startGeneration: truyen custom -> 422', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f, 'custom');
  const { enqueue } = recorder();
  await rejectsWith(startGeneration(f.user, story.id, { enqueue }), 422);
  assert.equal((await requestsOf(story.id)).length, 0);
});

test('startGeneration: mo ta nhan vat chua ten con khong la nhan vat -> 422 truoc khi giu credit (I1)', { skip }, async () => {
  const f = await family(cost);
  await createChild(f.user.id, 'Na');
  await prisma.character.update({ where: { id: f.mit.id }, data: { appearance: 'chú mèo của Na' } });
  const story = await createStory(f);
  const { calls, enqueue } = recorder();

  await assert.rejects(startGeneration(f.user, story.id, { enqueue }), (err) => {
    assert.equal(err.statusCode, 422);
    assert.match(err.message, /Mô tả nhân vật "Mít" chứa tên "Na" chưa có trong truyện/);
    assert.deepEqual(err.errors.map((e) => e.path), ['characters.{NV2}.appearance']);
    return true;
  });

  assert.equal((await storyRow(story.id)).status, 'draft');
  assert.equal((await requestsOf(story.id)).length, 0);
  assert.equal(await balanceOf(f.user.id), cost);
  assert.equal(calls.length, 0);
});

test('startGeneration: situation luu truoc khi co ho so con chua ten con -> 422 (I1)', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  await prisma.story.update({ where: { id: story.id }, data: { situation: '{NV1} giận Na.' } });
  await createChild(f.user.id, 'Na');
  const { enqueue } = recorder();

  await assert.rejects(startGeneration(f.user, story.id, { enqueue }), (err) => {
    assert.equal(err.statusCode, 422);
    assert.match(err.message, /Tình huống chứa tên "Na"/);
    return true;
  });
  assert.equal((await requestsOf(story.id)).length, 0);
});

test('startGeneration: mockForce -> job data co mock_force (I2)', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { calls, enqueue } = recorder();

  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue, mockForce: 'SAFETY_BLOCKED' });

  assert.deepEqual(calls, [
    ['story_text', { ai_request_id: aiRequestId, mock_force: 'SAFETY_BLOCKED' }, { jobId: aiRequestId }],
  ]);
});

test('startGeneration: truyen cua nguoi khac -> 404', { skip }, async () => {
  const owner = await family(cost);
  const other = await family(cost);
  const story = await createStory(owner);
  const { enqueue } = recorder();
  await rejectsWith(startGeneration(other.user, story.id, { enqueue }), 404);
});

test('startGeneration: enqueue loi -> 503; ai_request failed ENQUEUE_FAILED; credit_release; truyen ve theo trang', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  await fillAllPages(story);
  await prisma.story.update({ where: { id: story.id }, data: { status: 'ready' } });

  await rejectsWith(startGeneration(f.user, story.id, { enqueue: failingEnqueue }), 503);

  const [req] = await requestsOf(story.id);
  assert.equal(req.status, 'failed');
  assert.match(req.errorMessage, /^ENQUEUE_FAILED: /);
  assert.ok(req.finishedAt);
  const ledger = await ledgerFor(req.id);
  assert.deepEqual(ledger.map((r) => r.entryType), ['credit_hold', 'credit_release']);
  assert.equal(await balanceOf(f.user.id), cost);
  assert.equal((await storyRow(story.id)).status, 'ready');
});

test('startGeneration: enqueue treo (Redis sap, offline queue) -> het gio -> 503 va bu tru ENQUEUE_FAILED', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const hanging = () => new Promise(() => {});

  await rejectsWith(startGeneration(f.user, story.id, { enqueue: hanging, enqueueTimeoutMs: 50 }), 503);

  const [req] = await requestsOf(story.id);
  assert.equal(req.status, 'failed');
  assert.match(req.errorMessage, /^ENQUEUE_FAILED: .*50ms/);
  const ledger = await ledgerFor(req.id);
  assert.deepEqual(ledger.map((r) => r.entryType), ['credit_hold', 'credit_release']);
  assert.equal(await balanceOf(f.user.id), cost);
  assert.equal((await storyRow(story.id)).status, 'draft');
});

// ---------------------------------------------------------------------------
// getGeneration (+ don job ket)
// ---------------------------------------------------------------------------

test('getGeneration: chua sinh lan nao -> null', { skip }, async () => {
  const f = await family(0);
  const story = await createStory(f);
  assert.equal(await getGeneration(f.user, story.id), null);
});

test('getGeneration: tra ai_request moi nhat, tach errorCode tu errorMessage', { skip }, async () => {
  const f = await family(cost * 2);
  const story = await createStory(f);
  await rejectsWith(startGeneration(f.user, story.id, { enqueue: failingEnqueue }), 503);
  await rejectsWith(startGeneration(f.user, story.id, { enqueue: failingEnqueue }), 503);
  const reqs = await requestsOf(story.id);
  assert.equal(reqs.length, 2);
  const second = reqs[1].id;

  const g = await getGeneration(f.user, story.id);
  assert.equal(g.aiRequestId, second);
  assert.equal(g.status, 'failed');
  assert.equal(g.errorCode, 'ENQUEUE_FAILED');
  assert.equal(g.errorMessage, 'Redis sập');
  assert.ok(g.createdAt instanceof Date);
  assert.ok(g.finishedAt instanceof Date);
});

test('GET /:id/generation -> 200 kem generation', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: recorder().enqueue });
  const res = await api.request('GET', `/stories/${story.id}/generation`, { token: f.token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.generation.aiRequestId, aiRequestId);
  assert.equal(res.body.data.generation.status, 'queued');
  assert.equal(res.body.data.generation.errorCode, null);
});

test('getGeneration: processing tao 11 phut truoc -> don: failed STALE_JOB, hoan credit, truyen ve theo trang', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: recorder().enqueue });
  const createdAt = new Date();
  await prisma.aiRequest.update({ where: { id: aiRequestId }, data: { status: 'processing', createdAt } });

  const g = await getGeneration(f.user, story.id, { now: new Date(createdAt.getTime() + 11 * 60000) });

  assert.equal(g.status, 'failed');
  assert.equal(g.errorCode, 'STALE_JOB');
  const ledger = await ledgerFor(aiRequestId);
  assert.deepEqual(ledger.map((r) => r.entryType), ['credit_hold', 'credit_release']);
  assert.equal(await balanceOf(f.user.id), cost);
  assert.equal((await storyRow(story.id)).status, 'draft');
});

test('getGeneration: processing tao 9 phut truoc -> khong don', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: recorder().enqueue });
  const createdAt = new Date();
  await prisma.aiRequest.update({ where: { id: aiRequestId }, data: { status: 'processing', createdAt } });

  const g = await getGeneration(f.user, story.id, { now: new Date(createdAt.getTime() + 9 * 60000) });

  assert.equal(g.status, 'processing');
  assert.equal(g.errorCode, null);
  assert.equal((await ledgerFor(aiRequestId)).length, 1);
  assert.equal((await storyRow(story.id)).status, 'generating');
});

// ---------------------------------------------------------------------------
// finalizeFailure
// ---------------------------------------------------------------------------

test('finalizeFailure goi hai lan -> lan hai false, khong hoan them', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: recorder().enqueue });

  const args = { aiRequestId, status: 'blocked', code: 'SAFETY_BLOCKED', message: 'nội dung không phù hợp' };
  assert.equal(await finalizeFailure(prisma, args), true);
  assert.equal(await finalizeFailure(prisma, { ...args, status: 'failed', code: 'STALE_JOB' }), false);

  const req = await prisma.aiRequest.findUnique({ where: { id: aiRequestId } });
  assert.equal(req.status, 'blocked');
  assert.equal(req.errorMessage, 'SAFETY_BLOCKED: nội dung không phù hợp');
  const ledger = await ledgerFor(aiRequestId);
  assert.deepEqual(ledger.map((r) => r.entryType), ['credit_hold', 'credit_release']);
  assert.equal(await balanceOf(f.user.id), cost);
  assert.equal((await storyRow(story.id)).status, 'draft');
});

test('finalizeFailure: ai_request da succeeded -> false, khong hoan, khong doi truyen', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: recorder().enqueue });
  await prisma.aiRequest.update({ where: { id: aiRequestId }, data: { status: 'succeeded' } });
  await prisma.story.update({ where: { id: story.id }, data: { status: 'ready' } });

  const res = await finalizeFailure(prisma, { aiRequestId, status: 'failed', code: 'STALE_JOB', message: 'x' });

  assert.equal(res, false);
  assert.equal((await ledgerFor(aiRequestId)).length, 1);
  assert.equal((await storyRow(story.id)).status, 'ready');
});

test('finalizeFailure: errorMessage cat 1000 ky tu', { skip }, async () => {
  const f = await family(cost);
  const story = await createStory(f);
  const { aiRequestId } = await startGeneration(f.user, story.id, { enqueue: recorder().enqueue });
  await finalizeFailure(prisma, { aiRequestId, status: 'failed', code: 'INTERNAL', message: 'x'.repeat(3000) });
  const req = await prisma.aiRequest.findUnique({ where: { id: aiRequestId } });
  assert.equal(req.errorMessage.length, 1000);
});
