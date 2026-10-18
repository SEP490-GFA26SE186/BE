import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let topic;
let store;
let tiers;

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await getSeededTopic();
  store = await import('../../src/modules/billing/billing.store.js');
  await (await import('../../prisma/seed_plans.js')).seedPlans(prisma);
  await (await import('../../prisma/seed_market.js')).seedMarket(prisma);
  tiers = await prisma.priceTier.findMany({ orderBy: { priceVnd: 'asc' } });
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
  const mod = await createUser({ role: 'moderator' });
  assert.equal((await call(s.token, 'POST', '/sellers/apply', { displayName: 'Mẹ Lan' })).status, 201);
  const ok = await call(mod.token, 'POST', `/moderation/sellers/${s.user.id}/decision`, { approve: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return { ...s, mod };
}

const listingBody = (s, over = {}) => ({
  storyId: s.story.id,
  title: 'Bé và chậu hoa',
  priceTierId: tiers[1].id,
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
  const mod = await createUser({ role: 'moderator' });
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

test('duyet: nhan bai, nguoi khac khong nhan duoc; chua xem du -> 422; xem du + checklist -> published', { skip }, async () => {
  const s = await approvedSeller();
  const { listing } = (await call(s.token, 'POST', '/listings', listingBody(s))).body.data;
  const mod = s.mod;
  const other = await createUser({ role: 'moderator' });

  const queue = await call(mod.token, 'GET', '/moderation/submissions');
  const item = queue.body.data.queue.find((q) => q.listingId === listing.id);
  assert.ok(item);
  const claimed = await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/claim`);
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  const detail = claimed.body.data;
  assert.equal(detail.review.claimedByMe, true);
  assert.deepEqual(detail.story.characters.map((c) => c.name).sort(), ['Bà nội', 'Bống']);
  assert.equal(detail.checklist.length, 7);
  assert.equal((await call(other.token, 'POST', `/moderation/submissions/${item.reviewId}/claim`)).status, 409);
  assert.equal((await prisma.listing.findUnique({ where: { id: listing.id } })).status, 'in_review');

  const allPassed = detail.checklist.map((c) => ({ itemId: c.id, passed: true }));
  const early = await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/decision`, { decision: 'approved', checklist: allPassed });
  assert.equal(early.status, 422);

  for (const pg of detail.story.pages) {
    await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/pages/${pg.id}/view`, pg.pageOrder === 2 ? { comment: 'Ổn' } : {});
  }
  const oneFail = allPassed.map((c, i) => (i === 0 ? { ...c, passed: false } : c));
  assert.equal((await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/decision`, { decision: 'approved', checklist: oneFail })).status, 422);

  const done = await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/decision`, { decision: 'approved', checklist: allPassed });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.data.progress.canApprove, true);
  const row = await prisma.listing.findUnique({ where: { id: listing.id } });
  assert.equal(row.status, 'published');
  assert.ok(row.publishedAt);
  assert.equal((await call(mod.token, 'POST', `/moderation/submissions/${item.reviewId}/decision`, { decision: 'rejected', comment: 'x' })).status, 409);
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
