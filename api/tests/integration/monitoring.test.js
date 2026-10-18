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
  const { platformSettingsData } = await import('../../prisma/seed_platform_settings.js');
  const mod = await prisma.user.findFirst({ where: { role: 'moderator' } });
  for (const { key, value } of platformSettingsData.filter((s) => /^(market|moderation)\./.test(s.key))) {
    await prisma.platformSetting.upsert({ where: { key }, update: {}, create: { key, value, updatedBy: mod.id } });
  }
  tiers = Object.fromEntries((await prisma.priceTier.findMany()).map((t) => [Number(t.priceVnd), t]));
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
    storyId: story.id, title: `Bé đi chơi ${Date.now()}`, priceTierId: tiers[0].id, aliases: [{ token: '{NV1}', aliasName: 'Bống' }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { listing } = created.body.data;
  await prisma.moderationReview.updateMany({ where: { listingId: listing.id }, data: { decision: 'approved', decidedAt: new Date() } });
  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'published', publishedAt: new Date() } });
  return { seller: s, listing };
}

/** Moderator nhan luot duyet, xem het trang, tick du checklist, quyet dinh. */
async function decideReview(mod, reviewId, body) {
  const claim = await call(mod.token, 'POST', `/moderation/submissions/${reviewId}/claim`);
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  for (const p of claim.body.data.story.pages) await call(mod.token, 'POST', `/moderation/submissions/${reviewId}/pages/${p.id}/view`, {});
  const checklist = claim.body.data.checklist.map((i) => ({ itemId: i.id, passed: true }));
  return call(mod.token, 'POST', `/moderation/submissions/${reviewId}/decision`, { checklist, ...body });
}

const report = (token, listingId, body = { category: 'scary' }) => call(token, 'POST', `/market/listings/${listingId}/reports`, body);

test('bao cao: trung -> 409, tu bao cao truyen minh -> 422; du 3 nguoi khac nhau -> tu tam go, an khoi cho, be khong doc duoc', { skip }, async () => {
  const { seller, listing } = await publishedListing();
  const reader = await withPlan('FREE');
  assert.equal((await call(reader.token, 'POST', '/market/checkout', { listingId: listing.id })).status, 201);
  const kid = await createChild(reader.user.id, 'Na');
  assert.equal((await call(reader.token, 'POST', '/bookshelf', { childId: kid.id, storyId: listing.publishedStoryId })).status, 201);

  assert.equal((await report(seller.token, listing.id)).status, 422);
  const page = await prisma.storyPage.findFirst({ where: { storyId: listing.publishedStoryId }, orderBy: { pageOrder: 'asc' } });
  const first = await report(reader.token, listing.id, { category: 'scary', pageId: page.id, description: 'Trang 1 làm bé sợ.' });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.data.suspended, false);
  assert.equal((await report(reader.token, listing.id)).status, 409);

  const others = [await createParent(), await createParent()];
  assert.equal((await report(others[0].token, listing.id, { category: 'violent' })).body.data.suspended, false);
  const third = await report(others[1].token, listing.id, { category: 'other' });
  assert.equal(third.body.data.suspended, true);
  assert.equal((await prisma.listing.findUnique({ where: { id: listing.id } })).status, 'suspended');

  assert.equal((await call(reader.token, 'GET', `/market/listings/${listing.id}`)).status, 404);
  const kid2 = await createChild(reader.user.id, 'Bông');
  const blocked = await call(reader.token, 'POST', '/bookshelf', { childId: kid2.id, storyId: listing.publishedStoryId });
  assert.equal(blocked.status, 422);
  assert.match(blocked.body.message, /tạm gỡ/);

  const mod = await createUser({ role: 'moderator' });
  const groups = (await call(mod.token, 'GET', '/moderation/reports')).body.data.groups;
  const g = groups.find((x) => x.listing.id === listing.id);
  assert.equal(g.reports.length, 3);
  assert.equal(g.openReview.reviewType, 'report_followup');
  assert.equal(g.reports.find((r) => r.category === 'scary').pageOrder, 1);
  const queue = (await call(mod.token, 'GET', '/moderation/submissions')).body.data.queue;
  assert.equal(queue.find((q) => q.listingId === listing.id).openReports, 3);
});

test('hau kiem: go han -> archived + bao cao resolved + tu canh cao; giu -> ban lai + bao cao dismissed', { skip }, async () => {
  const mod = await createUser({ role: 'moderator' });
  const { seller, listing } = await publishedListing();
  for (let i = 0; i < 3; i++) await report((await createParent()).token, listing.id);
  const review = await prisma.moderationReview.findFirst({ where: { listingId: listing.id, decidedAt: null } });

  const wrong = await decideReview(mod, review.id, { decision: 'rejected', comment: 'x' });
  assert.equal(wrong.status, 422, 'hau kiem khong co quyet dinh tu choi');
  assert.equal((await decideReview(mod, review.id, { decision: 'taken_down' })).status, 422, 'go han phai co nhan xet');
  const down = await decideReview(mod, review.id, { decision: 'taken_down', comment: 'Cảnh đánh nhau quá đáng sợ cho bé 5 tuổi.' });
  assert.equal(down.status, 200, JSON.stringify(down.body));
  assert.equal((await prisma.listing.findUnique({ where: { id: listing.id } })).status, 'archived');
  assert.deepEqual(
    [...new Set((await prisma.contentReport.findMany({ where: { listingId: listing.id } })).map((r) => r.status))],
    ['resolved'],
  );
  const mine = (await call(seller.token, 'GET', '/sellers/me/strikes')).body.data;
  assert.equal(mine.activeStrikes, 1);
  assert.equal(mine.strikes[0].source, 'takedown');
  assert.equal(mine.strikes[0].issuer, undefined, 'nguoi ban khong thay ten kiem duyet vien');

  // Moderator chu dong tam go truyen khac, xem lai thay on -> giu
  const other = await publishedListing();
  assert.equal((await call(mod.token, 'POST', `/moderation/listings/${other.listing.id}/suspend`, { reason: 'Kiểm tra lại' })).status, 200);
  assert.equal((await call(mod.token, 'POST', `/moderation/listings/${other.listing.id}/suspend`, { reason: 'Kiểm tra lại' })).status, 409);
  const suspended = (await call(mod.token, 'GET', '/moderation/listings')).body.data.listings;
  const row = suspended.find((l) => l.id === other.listing.id);
  assert.equal(row.review.reviewType, 'report_followup');
  const keep = await decideReview(mod, row.review.id, { decision: 'approved' });
  assert.equal(keep.status, 200, JSON.stringify(keep.body));
  assert.equal((await prisma.listing.findUnique({ where: { id: other.listing.id } })).status, 'published');
  assert.equal(await prisma.creatorStrike.count({ where: { sellerId: other.seller.user.id } }), 0);
});

test('canh cao: du 3 -> khoa tai khoan ban (an truyen khoi cho); khang nghi -> Admin khac nguoi ra canh cao xet; chap thuan -> mo lai', { skip }, async () => {
  const mod = await createUser({ role: 'moderator' });
  const admin = await createUser({ role: 'admin' });
  const { seller, listing } = await publishedListing();
  const buyer = await createParent();
  const strike = (n) => call(mod.token, 'POST', '/moderation/strikes', { sellerId: seller.user.id, source: 'report', reason: `Vi phạm lần ${n}: nội dung gây sợ.` });
  assert.equal((await strike(1)).body.data.sellerSuspended, false);
  await strike(2);
  const third = await strike(3);
  assert.equal(third.status, 201);
  assert.deepEqual([third.body.data.activeStrikes, third.body.data.sellerSuspended], [3, true]);
  assert.equal((await prisma.sellerProfile.findUnique({ where: { userId: seller.user.id } })).status, 'suspended');
  assert.equal((await call(buyer.token, 'GET', `/market/listings/${listing.id}`)).status, 404, 'nguoi ban bi khoa -> an truyen');

  const mine = (await call(seller.token, 'GET', '/sellers/me/strikes')).body.data;
  assert.equal(mine.sellerStatus, 'suspended');
  const target = mine.strikes[0];
  assert.equal((await call(seller.token, 'POST', `/sellers/me/strikes/${target.id}/appeal`, { reason: 'ngắn' })).status, 400);
  const ap = await call(seller.token, 'POST', `/sellers/me/strikes/${target.id}/appeal`, { reason: 'Truyện đã được sửa, cảnh này không có ý gây sợ cho bé.' });
  assert.equal(ap.status, 201, JSON.stringify(ap.body));
  assert.equal((await call(seller.token, 'POST', `/sellers/me/strikes/${target.id}/appeal`, { reason: 'Truyện đã được sửa, cảnh này không có ý gây sợ cho bé.' })).status, 409);
  assert.equal((await call(mod.token, 'GET', '/admin/appeals')).status, 403, 'Moderator khong xet khang nghi');

  const pending = (await call(admin.token, 'GET', '/admin/appeals')).body.data.appeals;
  assert.ok(pending.some((a) => a.id === ap.body.data.appealId && a.strike.seller.id === seller.user.id));
  assert.equal((await call(admin.token, 'POST', `/admin/appeals/${ap.body.data.appealId}/decision`, { approve: false })).status, 422, 'tu choi phai co ly do');
  const ok = await call(admin.token, 'POST', `/admin/appeals/${ap.body.data.appealId}/decision`, { approve: true, note: 'Đồng ý gỡ.' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.data.strikeRevoked, ok.body.data.sellerReinstated], [true, true]);
  assert.equal((await call(buyer.token, 'GET', `/market/listings/${listing.id}`)).status, 200);
  assert.equal((await call(admin.token, 'POST', `/admin/appeals/${ap.body.data.appealId}/decision`, { approve: true })).status, 409);

  // Admin tu ra canh cao thi khong tu xet khang nghi cua canh cao do
  const own = await call(admin.token, 'POST', '/moderation/strikes', { sellerId: seller.user.id, source: 'report', reason: 'Cảnh cáo do Admin ra.' });
  const ap2 = await call(seller.token, 'POST', `/sellers/me/strikes/${own.body.data.strikeId}/appeal`, { reason: 'Mong Admin xem lại giúp, truyện không vi phạm.' });
  assert.equal((await call(admin.token, 'POST', `/admin/appeals/${ap2.body.data.appealId}/decision`, { approve: true })).status, 403);
  assert.ok((await prisma.adminAuditLog.count({ where: { targetType: 'strike_appeal', targetId: ap.body.data.appealId } })) >= 1);
});

test('kiem tra ngau nhien: Moderator tao dot -> luot random_audit tren truyen dang ban, khong trung luot dang mo', { skip }, async () => {
  const mod = await createUser({ role: 'moderator' });
  await publishedListing();
  const run = await call(mod.token, 'POST', '/moderation/audits/run', { count: 2 });
  assert.equal(run.status, 201, JSON.stringify(run.body));
  assert.ok(run.body.data.created >= 1);
  const reviews = await prisma.moderationReview.findMany({ where: { id: { in: run.body.data.reviewIds } }, include: { listing: true } });
  assert.ok(reviews.every((r) => r.reviewType === 'random_audit' && r.listing.status === 'published'));
  for (const r of reviews) assert.equal(await prisma.moderationReview.count({ where: { listingId: r.listingId, decidedAt: null } }), 1);

  const audits = (await call(mod.token, 'GET', '/moderation/audits?open=true')).body.data.audits;
  assert.ok(run.body.data.reviewIds.every((id) => audits.some((a) => a.reviewId === id)));
  const keep = await decideReview(mod, run.body.data.reviewIds[0], { decision: 'approved' });
  assert.equal(keep.status, 200, JSON.stringify(keep.body));
  assert.equal(keep.body.data.listing.status, 'published');
});
