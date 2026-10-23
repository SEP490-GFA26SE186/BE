import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let topic;
let store;

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await getSeededTopic();
  store = await import('../../src/modules/billing/billing.store.js');
  await (await import('../../prisma/seed_plans.js')).seedPlans(prisma);
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });

/** Phu huynh goi Gia dinh (thang), be Bin + Bà, truyen tu viet 4 trang da hoan tat (co ten trong situation). */
async function seller({ plan = 'FAMILY_MONTH' } = {}) {
  const f = await createParent();
  await prisma.wallet.create({ data: { userId: f.user.id } });
  const p = await prisma.plan.findUnique({ where: { code: plan } });
  await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: { buyerId: f.user.id, subtotalVnd: p.priceVnd, totalVnd: p.priceVnd, payosOrderCode: BigInt(Date.now() * 10 + Math.floor(Math.random() * 10)), items: { create: { itemType: 'plan', planId: p.id, unitPriceVnd: p.priceVnd } } },
    });
    await store.fulfillOrder(tx, o.id);
  });
  const child = await createChild(f.user.id, 'Bin');
  const bin = await createCharacter(f.user.id, 'Bin', { childId: child.id });
  const ba = await createCharacter(f.user.id, 'Bà');
  const res = await call(f.token, 'POST', '/stories', {
    topicId: topic.id, length: 'custom', title: 'Bin và chậu hoa', situation: 'Bin làm đổ chậu hoa của Bà.', useTts: false,
    characters: [{ characterId: bin.id, isMain: true }, { characterId: ba.id, isMain: false }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const story = res.body.data.story;
  for (const pg of story.pages) {
    await prisma.storyPage.update({ where: { id: pg.id }, data: { contentText: `{NV1} và {NV2} ở trang ${pg.pageOrder}.`, audioKey: 'stories/x/audio/a.mp3', audioStatus: 'ready' } });
  }
  assert.equal((await call(f.token, 'POST', `/stories/${story.id}/review`)).status, 200);
  return { ...f, story };
}

async function approvedSeller(opts) {
  const s = await seller(opts);
  const mod = await createUser({ role: 'specialist' });
  assert.equal((await call(s.token, 'POST', '/sellers/apply', { displayName: 'Mẹ Lan' })).status, 201);
  const ok = await call(mod.token, 'POST', `/moderation/sellers/${s.user.id}/decision`, { approve: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return { ...s, mod };
}

const listingBody = (s, over = {}) => ({
  storyId: s.story.id,
  title: 'Bé và chậu hoa',
  priceVnd: 19000,
  aliases: [{ token: '{NV1}', aliasName: 'Bống' }, { token: '{NV2}', aliasName: 'Bà nội' }],
  ...over,
});

test('nguoi ban: goi Mien phi khong nop duoc; goi Gia dinh nop -> cho duyet -> duyet', { skip }, async () => {
  const free = await createParent();
  await prisma.wallet.create({ data: { userId: free.user.id } });
  await prisma.$transaction((tx) => store.ensureFreeSubscription(tx, free.user.id));
  assert.equal((await call(free.token, 'POST', '/sellers/apply', { displayName: 'Ba An' })).status, 422);

  const s = await seller();
  assert.equal((await call(s.token, 'POST', '/sellers/apply', { displayName: 'Mẹ Lan' })).status, 201);
  assert.equal((await call(s.token, 'POST', '/sellers/apply', { displayName: 'Mẹ Lan' })).status, 409);
  assert.equal((await call(s.token, 'POST', '/listings', listingBody(s))).status, 403, 'chua duyet thi chua dang ban');
  const mod = await createUser({ role: 'specialist' });
  const pending = await call(mod.token, 'GET', '/moderation/sellers');
  assert.ok(pending.body.data.sellers.some((x) => x.userId === s.user.id));
  await call(mod.token, 'POST', `/moderation/sellers/${s.user.id}/decision`, { approve: true });
  assert.equal((await call(s.token, 'GET', '/sellers/me')).body.data.seller.status, 'approved');
});

test('dang ban: thieu / trung bi danh hoac dung ten that -> 422; ban sao go ca nhan hoa', { skip }, async () => {
  const s = await approvedSeller();
  const bad = await call(s.token, 'POST', '/listings', listingBody(s, { aliases: [{ token: '{NV1}', aliasName: 'Bin' }] }));
  assert.equal(bad.status, 422);
  const paths = bad.body.errors.map((e) => e.path);
  assert.ok(paths.includes('aliases.{NV1}') && paths.includes('aliases.{NV2}'));
  const titleName = await call(s.token, 'POST', '/listings', listingBody(s, { title: 'Bin và chậu hoa' }));
  assert.equal(titleName.status, 422);
  assert.ok(titleName.body.errors.some((e) => e.path === 'listing.title'));

  const ok = await call(s.token, 'POST', '/listings', listingBody(s));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const { listing } = ok.body.data;
  assert.equal(listing.status, 'submitted');
  assert.equal(listing.priceVnd, 19000);
  const copy = await prisma.story.findUnique({ where: { id: listing.publishedStoryId }, include: { storyCharacters: true, pages: true } });
  assert.equal(copy.kind, 'published');
  assert.equal(copy.sourceStoryId, s.story.id);
  assert.equal(copy.situation, null);
  assert.equal(copy.useTts, false);
  assert.deepEqual(copy.storyCharacters.map((c) => [c.token, c.characterId, c.aliasName]).sort(), [['{NV1}', null, 'Bống'], ['{NV2}', null, 'Bà nội']]);
  assert.ok(copy.pages.every((p) => p.audioKey === null && p.contentText.includes('{NV1}')));
  assert.equal((await call(s.token, 'GET', '/listings/mine')).body.data.listings[0].id, listing.id);
});

test('dang ban: ban sao giu subSkillId, templateVersionId, scored, excluded cua diem dung nguon (khong chep reviewedOk)', { skip }, async () => {
  const s = await approvedSeller();
  const version = await prisma.questionTemplateVersion.findFirstOrThrow({ include: { template: true } });
  const spec = await createUser({ role: 'specialist' });
  const src = await prisma.storyCheckpoint.create({
    data: {
      storyId: s.story.id, afterPageId: s.story.pages[1].id, type: 'reflection', question: 'Con học được gì?', origin: 'human',
      subSkillId: version.template.subSkillId, templateVersionId: version.id, scored: true,
      excluded: true, excludedReason: 'cau hoi mo ho', excludedBy: spec.user.id, excludedAt: new Date(),
      reviewedOkAt: new Date(), reviewedOkBy: spec.user.id,
    },
  });
  const ok = await call(s.token, 'POST', '/listings', listingBody(s));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const copy = await prisma.storyCheckpoint.findFirstOrThrow({ where: { storyId: ok.body.data.listing.publishedStoryId } });
  assert.equal(copy.subSkillId, src.subSkillId);
  assert.equal(copy.templateVersionId, src.templateVersionId);
  assert.equal(copy.scored, true);
  assert.equal(copy.excluded, true);
  assert.equal(copy.excludedReason, 'cau hoi mo ho');
  assert.equal(copy.excludedBy, spec.user.id);
  assert.ok(copy.excludedAt);
  assert.equal(copy.reviewedOkAt, null);
  assert.equal(copy.reviewedOkBy, null);
});

test('duyet: nhan bai, nguoi khac khong nhan duoc; chua xem du -> 422; gui checklist -> 400; xem du -> published', { skip }, async () => {
  const s = await approvedSeller();
  const { listing } = (await call(s.token, 'POST', '/listings', listingBody(s))).body.data;
  const mod = s.mod;
  const other = await createUser({ role: 'specialist' });

  const queue = await call(mod.token, 'GET', '/moderation/submissions');
  const item = queue.body.data.queue.find((q) => q.listingId === listing.id);
  assert.ok(item);
  const claimed = await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/claim`);
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  const detail = claimed.body.data;
  assert.equal(detail.review.claimedByMe, true);
  assert.deepEqual(detail.story.characters.map((c) => c.name).sort(), ['Bà nội', 'Bống']);
  assert.equal(detail.checklist, undefined, 'checklist su pham chi tren web');
  assert.equal(detail.listing.priceVnd, 19000, 'Specialist thay gia ban');
  assert.equal(item.priceVnd, 19000);
  assert.equal((await call(other.token, 'POST', `/moderation/submissions/${item.reviewId}/claim`)).status, 409);
  assert.equal((await prisma.listing.findUnique({ where: { id: listing.id } })).status, 'in_review');

  const early = await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/decision`, { decision: 'approved' });
  assert.equal(early.status, 422);

  for (const pg of detail.story.pages) {
    await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/pages/${pg.id}/view`, pg.pageOrder === 2 ? { comment: 'Ổn' } : {});
  }
  const withChecklist = await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/decision`, { decision: 'approved', checklist: [] });
  assert.equal(withChecklist.status, 400, 'body khong con truong checklist');

  const done = await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/decision`, { decision: 'approved' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.data.progress.canApprove, true);
  const row = await prisma.listing.findUnique({ where: { id: listing.id } });
  assert.equal(row.status, 'published');
  assert.ok(row.publishedAt);
  assert.equal((await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/decision`, { decision: 'rejected', comment: 'x' })).status, 409);
});

test('gia tu dat: priceVnd 0 hoac 5.000-500.000 boi 1.000; sai -> 400; listing tra priceVnd', { skip }, async () => {
  const s = await approvedSeller();
  for (const priceVnd of [4000, 5500, 501000, -1000, 19000.5, '19000', undefined]) {
    const res = await call(s.token, 'POST', '/listings', listingBody(s, { priceVnd }));
    assert.equal(res.status, 400, `priceVnd=${priceVnd} -> ${JSON.stringify(res.body)}`);
  }
  assert.equal((await call(s.token, 'POST', '/listings', { ...listingBody(s), priceTierId: '00000000-0000-4000-8000-000000000000', priceVnd: undefined })).status, 400, 'priceTierId khong con dung');
  const res = await call(s.token, 'POST', '/listings', listingBody(s, { priceVnd: 500000 }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.listing.priceVnd, 500000);
  assert.equal(res.body.data.listing.priceTierId, undefined);
  assert.equal((await prisma.listing.findUnique({ where: { id: res.body.data.listing.id } })).priceVnd, 500000n);
  const mine = (await call(s.token, 'GET', '/listings/mine')).body.data.listings;
  assert.equal(mine.find((l) => l.id === res.body.data.listing.id).priceVnd, 500000);
});

test('yeu cau sua: bat buoc nhan xet; nguoi ban thay quyet dinh + nhan xet', { skip }, async () => {
  const s = await approvedSeller();
  const { listing } = (await call(s.token, 'POST', '/listings', listingBody(s))).body.data;
  const { queue } = (await call(s.mod.token, 'GET', '/moderation/submissions')).body.data;
  const reviewId = queue.find((q) => q.listingId === listing.id).reviewId;
  await call(s.mod.token, 'POST', `/moderation/submissions/${reviewId}/claim`);
  assert.equal((await call(s.mod.token, 'POST', `/moderation/submissions/${reviewId}/decision`, { decision: 'changes_requested' })).status, 422);
  await call(s.mod.token, 'POST', `/moderation/submissions/${reviewId}/decision`, { decision: 'changes_requested', comment: 'Trang 3 đang giảng đạo lý.' });
  const mine = (await call(s.token, 'GET', '/listings/mine')).body.data.listings[0];
  assert.equal(mine.status, 'changes_requested');
  assert.equal(mine.lastDecision.comment, 'Trang 3 đang giảng đạo lý.');
});

test('ban dang ban co giong doc: sinh lai bang ten chung; Specialist chi nhan duyet khi doc xong; Cho hien badge', { skip }, async () => {
  const s = await approvedSeller();
  await prisma.story.update({ where: { id: s.story.id }, data: { useTts: true } }); // tac gia bat giong doc
  const publishing = await import('../../src/modules/publishing/publishing.service.js');
  const narrationStore = await import('../../src/modules/stories/stories.narration.store.js');
  const batches = [];
  const { listing } = await publishing.createListing(s.user, listingBody(s), { enqueue: async (jobs) => batches.push(jobs) });
  assert.equal(listing.hasNarration, true);
  assert.equal(listing.narration.complete, false);
  const jobs = batches.flat();
  assert.equal(jobs.length, listing.narration.total, 'moi doan mot job');

  const review = await prisma.moderationReview.findFirst({ where: { listingId: listing.id } });
  const early = await call(s.mod.token, 'POST', `/moderation/submissions/${review.id}/claim`);
  assert.equal(early.status, 409);
  assert.match(early.body.message, /đang được tạo/);
  const queue = (await call(s.mod.token, 'GET', '/moderation/submissions')).body.data.queue.find((q) => q.reviewId === review.id);
  assert.deepEqual([queue.hasNarration, queue.narration.complete], [true, false]);

  // Gia lap worker doc xong: chu gui TTS dung ten chung, khong lo ten that
  for (const job of jobs) {
    assert.ok(await narrationStore.markClipGenerating(prisma, { ...job, attempt: 1 }));
    const input = await narrationStore.loadClipInput(prisma, job.clipId);
    assert.ok(!/Bin|Bà(?! nội)/.test(input.text) && input.text.includes('Bống'), input.text);
    await narrationStore.persistClip(prisma, {
      ...job, fingerprint: input.clip.fingerprint, kind: input.kind, targetId: input.targetId,
      audioKey: `stories/${input.storyId}/audio/${job.clipId}.mp3`, durationSeconds: 2,
    });
  }
  const claim = await call(s.mod.token, 'POST', `/moderation/submissions/${review.id}/claim`);
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  assert.ok(claim.body.data.story.pages.every((p) => p.audioKey), 'Specialist nghe duoc tung trang (URL ky Cloudinary — test khong co cau hinh)');

  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'published', publishedAt: new Date() } });
  const buyer = await createParent();
  const withAudio = (await call(buyer.token, 'GET', '/market/listings?narration=with&sort=newest&limit=50')).body.data.items;
  assert.ok(withAudio.some((i) => i.id === listing.id && i.hasNarration === true));
  const textOnly = (await call(buyer.token, 'GET', '/market/listings?narration=without&sort=newest&limit=50')).body.data.items;
  assert.ok(!textOnly.some((i) => i.id === listing.id));
});

test('dang ban: anh bia theo canh da chon -> listings.cover_image_key + cover_scene_id cua ban sao', { skip }, async () => {
  const s = await approvedSeller();
  const first = await prisma.storyScene.findFirstOrThrow({ where: { storyId: s.story.id }, orderBy: { sceneOrder: 'asc' } });
  await prisma.storyScene.update({ where: { id: first.id }, data: { imageKey: 'https://img.test/c1.png', imageStatus: 'ready' } });
  const picked = await prisma.storyScene.create({
    data: { storyId: s.story.id, sceneOrder: 50, description: 'Cover scene.', imageKey: 'https://img.test/c2.png', imageStatus: 'ready' },
  });
  assert.equal((await call(s.token, 'PUT', `/stories/${s.story.id}/cover`, { sceneId: picked.id })).status, 200);

  const ok = await call(s.token, 'POST', '/listings', listingBody(s));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const { listing } = ok.body.data;
  assert.equal(listing.cover.imageUrl, 'https://img.test/c2.png');
  const row = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id }, include: { publishedStory: { include: { coverScene: true } } } });
  assert.equal(row.coverImageKey, 'https://img.test/c2.png');
  assert.equal(row.publishedStory.coverScene.sceneOrder, 50);
  assert.notEqual(row.publishedStory.coverSceneId, picked.id);

  const mine = await call(s.token, 'GET', '/listings/mine');
  assert.equal(mine.body.data.listings.find((l) => l.id === listing.id).cover.imageUrl, 'https://img.test/c2.png');
});
