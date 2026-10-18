import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let topic;
let editor;
let narration;
let store;

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await getSeededTopic();
  editor = (await import('../../src/modules/stories/stories.editor.service.js')).default;
  narration = await import('../../src/modules/stories/stories.narration.service.js');
  store = await import('../../src/modules/stories/stories.narration.store.js');
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

/** Truyen tu viet 4 trang da co chu, nhan vat Bin (gan con Bin) + Mít. */
async function setup({ useTts = true } = {}) {
  const { user, token } = await createParent();
  const childBin = await createChild(user.id, 'Bin');
  const bin = await createCharacter(user.id, 'Bin', { childId: childBin.id });
  const mit = await createCharacter(user.id, 'Mít');
  const res = await api.request('POST', '/stories', {
    token,
    body: {
      topicId: topic.id,
      length: 'custom',
      title: 'Bin và Mít',
      useTts,
      characters: [
        { characterId: bin.id, isMain: true },
        { characterId: mit.id, isMain: false },
      ],
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const story = res.body.data.story;
  for (const p of story.pages) {
    await prisma.storyPage.update({
      where: { id: p.id },
      data: { contentText: `{NV1} chơi với {NV2} ở trang ${p.pageOrder}.` },
    });
  }
  return { user, token, story };
}

/** enqueue gia: ghi lai job, khong cham Redis. */
const recorder = () => {
  const batches = [];
  return { batches, enqueue: async (jobs) => batches.push(jobs) };
};

/** Gia lap worker doc xong mot clip (dung ham store that). */
async function finishClip({ clipId, round }) {
  assert.ok(await store.markClipGenerating(prisma, { clipId, round, attempt: 1 }));
  const input = await store.loadClipInput(prisma, clipId);
  assert.ok(input, 'clip phai con khop chu');
  assert.ok(!input.text.includes('{NV'), 'chu gui TTS da thay ten that');
  return store.persistClip(prisma, {
    clipId,
    round,
    fingerprint: input.clip.fingerprint,
    kind: input.kind,
    targetId: input.targetId,
    audioKey: `stories/${input.storyId}/audio/${clipId}-r${round}-1.mp3`,
    durationSeconds: 3.2,
  });
}

test('hoan tat: dua 4 trang di doc, tien do pending, chua san sang; hoan tat lai khong sinh trung', { skip }, async () => {
  const { user, story } = await setup();
  const q = recorder();
  const detail = await editor.reviewStory(user, story.id, { enqueue: q.enqueue });

  assert.equal(q.batches.length, 1);
  assert.equal(q.batches[0].length, 4);
  assert.deepEqual(detail.narration, {
    enabled: true, total: 4, ready: 0, pending: 4, failed: 0, missing: 0, complete: false,
  });
  assert.deepEqual(detail.readiness, { ready: false, reason: 'narration_incomplete' });

  const again = await editor.reviewStory(user, story.id, { enqueue: q.enqueue });
  assert.equal(q.batches.length, 1, 'clip dang cho khop van tay -> khong day job moi');
  assert.equal(again.narration.pending, 4);
});

test('doc xong moi doan -> du audio, key ghi vao cot audio_key cua trang, san sang cho tre', { skip }, async () => {
  const { user, token, story } = await setup();
  const q = recorder();
  await editor.reviewStory(user, story.id, { enqueue: q.enqueue });
  for (const job of q.batches[0]) assert.equal(await finishClip(job), true);

  const res = await api.request('GET', `/stories/${story.id}`, { token });
  const d = res.body.data.story;
  assert.equal(d.narration.ready, 4);
  assert.deepEqual(d.readiness, { ready: true, reason: null });
  assert.ok(d.pages.every((p) => p.audioKey?.endsWith('.mp3') && p.audioStatus === 'ready'));
});

test('sua chu sau khi hoan tat: mat san sang; hoan tat lai chi doc lai DUNG doan do (luot 2)', { skip }, async () => {
  const { user, token, story } = await setup();
  const q = recorder();
  await editor.reviewStory(user, story.id, { enqueue: q.enqueue });
  for (const job of q.batches[0]) await finishClip(job);

  const page = [...story.pages].sort((a, b) => a.pageOrder - b.pageOrder)[1];
  const put = await api.request('PUT', `/stories/${story.id}/pages/${page.id}`, {
    token,
    body: { contentText: 'Bin hết giận rồi.' },
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const edited = put.body.data.story;
  assert.equal(edited.readiness.ready, false);
  assert.equal(edited.narration.missing, 1);

  // Job cu cua doan nay (neu con trong queue) khong duoc doc ban cu.
  const clip = await prisma.narrationClip.findFirst({ where: { storyId: story.id, segment: `page:${page.id}` } });
  assert.equal(await store.loadClipInput(prisma, clip.id), null);

  await editor.reviewStory(user, story.id, { enqueue: q.enqueue });
  assert.equal(q.batches.length, 2);
  assert.deepEqual(q.batches[1], [{ clipId: clip.id, round: 2 }]);
  await finishClip(q.batches[1][0]);
  const done = await api.request('GET', `/stories/${story.id}`, { token });
  assert.equal(done.body.data.story.readiness.ready, true);
});

test('Redis loi luc hoan tat: van hoan tat, clip failed; thu lai chi dua doan loi (luot 2)', { skip }, async () => {
  const { user, token, story } = await setup();
  const detail = await editor.reviewStory(user, story.id, {
    enqueue: async () => {
      throw new Error('redis down');
    },
  });
  assert.ok(detail.reviewedAt);
  assert.equal(detail.narration.failed, 4);
  const rows = await prisma.narrationClip.findMany({ where: { storyId: story.id } });
  assert.ok(rows.every((r) => r.status === 'failed' && r.errorCode === 'ENQUEUE_FAILED'));

  const q = recorder();
  const retried = await narration.retryNarration(user, story.id, { enqueue: q.enqueue });
  assert.equal(q.batches[0].length, 4);
  assert.ok(q.batches[0].every((j) => j.round === 2));
  assert.equal(retried.narration.pending, 4);

  // Khong con doan loi / thieu -> khong day job nao (khong cham Redis), van 202.
  const http = await api.request('POST', `/stories/${story.id}/narration/retry`, { token });
  assert.equal(http.status, 202, JSON.stringify(http.body));
});

test('thu lai giong doc khi chua hoan tat -> 422', { skip }, async () => {
  const { token, story } = await setup();
  const res = await api.request('POST', `/stories/${story.id}/narration/retry`, { token });
  assert.equal(res.status, 422);
});

test('tat giong doc: hoan tat khong tao clip, san sang ngay', { skip }, async () => {
  const { user, story } = await setup({ useTts: false });
  const q = recorder();
  const detail = await editor.reviewStory(user, story.id, { enqueue: q.enqueue });
  assert.equal(q.batches.length, 0);
  assert.equal(await prisma.narrationClip.count({ where: { storyId: story.id } }), 0);
  assert.deepEqual(detail.readiness, { ready: true, reason: null });
});
