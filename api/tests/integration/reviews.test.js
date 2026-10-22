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
  const { platformSettingsData } = await import('../../prisma/seed_platform_settings.js');
  const mod = await prisma.user.findFirst({ where: { role: 'specialist' } });
  for (const { key, value } of platformSettingsData.filter((s) => /^(market|moderation)\./.test(s.key))) {
    await prisma.platformSetting.upsert({ where: { key }, update: {}, create: { key, value, updatedBy: mod.id } });
  }
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });

async function withPlan(code) {
  const f = await createParent();
  await prisma.wallet.create({ data: { userId: f.user.id } });
  const plan = await prisma.plan.findUnique({ where: { code } });
  await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({ data: { buyerId: f.user.id, subtotalVnd: 0n, totalVnd: 0n, items: { create: { itemType: 'plan', planId: plan.id, unitPriceVnd: 0n } } } });
    await store.fulfillOrder(tx, o.id);
  });
  return f;
}

/** Nguoi ban da duyet + truyen mien phi dang ban. Truyen ban them cung nguoi ban: truyen `seller`. */
async function publishedListing(existingSeller) {
  const s = existingSeller ?? (await withPlan('FAMILY_MONTH'));
  if (!existingSeller) await prisma.sellerProfile.create({ data: { userId: s.user.id, displayName: `Người bán ${Date.now()}`, status: 'approved' } });
  const child = await createChild(s.user.id, 'Bin');
  const bin = await createCharacter(s.user.id, 'Bin', { childId: child.id });
  const story = (await call(s.token, 'POST', '/stories', {
    topicId: topic.id, length: 'custom', title: 'Truyện của Bin', useTts: false, characters: [{ characterId: bin.id, isMain: true }],
  })).body.data.story;
  for (const p of story.pages) await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `{NV1} ở trang ${p.pageOrder}.` } });
  await call(s.token, 'POST', `/stories/${story.id}/review`);
  const created = await call(s.token, 'POST', '/listings', {
    storyId: story.id, title: `Truyện thử đánh giá ${Date.now()}`, priceVnd: 0, aliases: [{ token: '{NV1}', aliasName: 'Bống' }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { listing } = created.body.data;
  await prisma.moderationReview.updateMany({ where: { listingId: listing.id }, data: { decision: 'approved', decidedAt: new Date() } });
  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'published', publishedAt: new Date() } });
  return { seller: s, listing };
}


test('danh gia: chua mua / chua doc het -> 422; doc het -> danh gia, diem truyen + nguoi ban; sua; nguoi ban tra loi 1 lan', { skip }, async () => {
  const { seller, listing } = await publishedListing();
  const buyer = await withPlan('FREE');
  const path = `/market/listings/${listing.id}/review`;
  assert.equal((await call(buyer.token, 'PUT', path, { rating: 5 })).status, 422, 'chua mua');
  assert.equal((await call(buyer.token, 'POST', '/market/checkout', { listingId: listing.id })).status, 201);
  const info = (await call(buyer.token, 'GET', `/market/listings/${listing.id}/reviews`)).body.data;
  assert.deepEqual([info.canReview, info.reason], [false, 'not_finished']);
  assert.equal((await call(buyer.token, 'PUT', path, { rating: 5 })).status, 422, 'be chua doc het');

  const kid = await createChild(buyer.user.id, 'Na');
  await prisma.playSession.create({ data: { childId: kid.id, storyId: listing.publishedStoryId, isFirstPlay: true, status: 'completed', completedAt: new Date() } });
  const r = await call(buyer.token, 'PUT', path, { rating: 4, comment: 'Bé rất thích đoạn xếp lâu đài.', tags: ['child_liked', 'clear_lesson', 'child_liked'] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.data.review.tags.sort(), ['child_liked', 'clear_lesson']);
  assert.equal(r.body.data.created, true);
  assert.equal(Number((await prisma.listing.findUnique({ where: { id: listing.id } })).ratingAvg), 4);

  assert.deepEqual((await prisma.productReview.findUnique({ where: { id: r.body.data.review.id } })).tags, ['child_liked', 'clear_lesson'], 'cot mang, khong trung');
  const again = await call(buyer.token, 'PUT', path, { rating: 2, tags: [] });
  assert.equal(again.body.data.created, false);
  assert.deepEqual(again.body.data.review.tags, []);
  const l = await prisma.listing.findUnique({ where: { id: listing.id } });
  assert.deepEqual([Number(l.ratingAvg), l.ratingCount], [2, 1]);
  assert.equal(Number((await prisma.sellerProfile.findUnique({ where: { userId: seller.user.id } })).ratingAvg), 2);
  assert.equal((await call(seller.token, 'PUT', path, { rating: 5 })).status, 422, 'khong tu danh gia');

  const reviewId = r.body.data.review.id;
  assert.equal((await call(buyer.token, 'POST', `/market/reviews/${reviewId}/reply`, { reply: 'Cảm ơn' })).status, 403);
  assert.equal((await call(seller.token, 'POST', `/market/reviews/${reviewId}/reply`, { reply: 'Cảm ơn ba mẹ!' })).status, 200);
  assert.equal((await call(seller.token, 'POST', `/market/reviews/${reviewId}/reply`, { reply: 'Lần hai' })).status, 409);
  const list = (await call(seller.token, 'GET', `/market/listings/${listing.id}/reviews`)).body.data;
  assert.equal(list.reviews[0].sellerReply, 'Cảm ơn ba mẹ!');
  assert.match(list.reviews[0].author, /^Ba mẹ |^Phụ huynh$/);
  assert.equal(list.distribution[2], 1);
  assert.ok(list.reviews.every((x) => Array.isArray(x.tags)));
});

test('bao cao danh gia -> Specialist thay trong hang bao cao, an danh gia -> bao cao resolved, diem tinh lai', { skip }, async () => {
  const { listing } = await publishedListing();
  const buyer = await withPlan('FREE');
  await call(buyer.token, 'POST', '/market/checkout', { listingId: listing.id });
  const kid = await createChild(buyer.user.id, 'Na');
  await prisma.playSession.create({ data: { childId: kid.id, storyId: listing.publishedStoryId, isFirstPlay: true, status: 'completed', completedAt: new Date() } });
  const reviewId = (await call(buyer.token, 'PUT', `/market/listings/${listing.id}/review`, { rating: 1, comment: 'Nội dung quảng cáo spam' })).body.data.review.id;

  const other = await createParent();
  assert.equal((await call(buyer.token, 'POST', `/market/reviews/${reviewId}/reports`, { category: 'other' })).status, 422, 'khong bao cao danh gia cua minh');
  assert.equal((await call(other.token, 'POST', `/market/reviews/${reviewId}/reports`, { category: 'other', description: 'Spam' })).status, 201);
  assert.equal((await call(other.token, 'POST', `/market/reviews/${reviewId}/reports`, { category: 'other' })).status, 409);

  const mod = await createUser({ role: 'specialist' });
  const group = (await call(mod.token, 'GET', '/moderation/reports')).body.data.groups.find((g) => g.listing.id === listing.id);
  assert.ok(group, 'bao cao danh gia gom theo truyen');
  assert.equal(group.reports[0].review.id, reviewId);
  const hide = await call(mod.token, 'POST', `/moderation/product-reviews/${reviewId}/hide`);
  assert.equal(hide.status, 200, JSON.stringify(hide.body));
  assert.equal(hide.body.data.reportsResolved, 1);
  const l = await prisma.listing.findUnique({ where: { id: listing.id } });
  assert.deepEqual([l.ratingAvg, l.ratingCount], [null, 0]);
  const pub = (await call(other.token, 'GET', `/market/listings/${listing.id}/reviews`)).body.data;
  assert.equal(pub.reviews.length, 0, 'danh gia an khong hien');
  const mine = (await call(buyer.token, 'GET', `/market/listings/${listing.id}/reviews`)).body.data;
  assert.equal(mine.myReview.hidden, true);
  assert.equal((await call(buyer.token, 'PUT', `/market/listings/${listing.id}/review`, { rating: 5 })).status, 403, 'bi an thi khong sua');
});
