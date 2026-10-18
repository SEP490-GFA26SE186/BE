import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let topic;
let store;
let earnings;
let setPayosClient;
let tiers;

function fakePayos() {
  const state = { created: [], status: new Map() };
  return {
    state,
    paymentRequests: {
      create: async (req) => {
        state.created.push(req);
        state.status.set(req.orderCode, { status: 'PENDING', amountPaid: 0 });
        return { paymentLinkId: `pl_${req.orderCode}`, checkoutUrl: `https://pay.payos.vn/web/pl_${req.orderCode}` };
      },
      get: async (orderCode) => ({ orderCode, ...state.status.get(orderCode), transactions: [{ reference: `FT${orderCode}` }] }),
    },
    webhooks: { verify: async () => { throw new Error('not used'); } },
  };
}

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await getSeededTopic();
  store = await import('../../src/modules/billing/billing.store.js');
  earnings = await import('../../src/modules/wallets/earningLedger.js');
  ({ setPayosClient } = await import('../../src/clients/payos.js'));
  await (await import('../../prisma/seed_plans.js')).seedPlans(prisma);
  await (await import('../../prisma/seed_market.js')).seedMarket(prisma);
  const { platformSettingsData } = await import('../../prisma/seed_platform_settings.js');
  const mod = await prisma.user.findFirst({ where: { role: 'moderator' } });
  for (const { key, value } of platformSettingsData.filter((s) => s.key.startsWith('market.'))) {
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

/** Nguoi ban da duyet + mot truyen dang ban (published) gia `price`. */
async function publishedListing(price) {
  const s = await withPlan('FAMILY_MONTH');
  await prisma.sellerProfile.create({ data: { userId: s.user.id, displayName: `Người bán ${Date.now()}`, status: 'approved' } });
  const child = await createChild(s.user.id, 'Bin');
  const bin = await createCharacter(s.user.id, 'Bin', { childId: child.id });
  const res = await call(s.token, 'POST', '/stories', {
    topicId: topic.id, length: 'custom', title: 'Truyện của Bin', useTts: false,
    characters: [{ characterId: bin.id, isMain: true }],
  });
  const story = res.body.data.story;
  for (const p of story.pages) await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `{NV1} ở trang ${p.pageOrder}.` } });
  await call(s.token, 'POST', `/stories/${story.id}/review`);
  const created = await call(s.token, 'POST', '/listings', {
    storyId: story.id, title: 'Bé đi chơi', priceTierId: tiers[price].id, aliases: [{ token: '{NV1}', aliasName: 'Bống' }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { listing } = created.body.data;
  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'published', publishedAt: new Date() } });
  return { seller: s, listing };
}

const wallet = (userId) => prisma.wallet.findUnique({ where: { userId } });

test('cho: chi truyen published; truyen mien phi -> nhan ngay -> len gia sach -> be doc bang ten chung', { skip }, async () => {
  const { listing } = await publishedListing(0);
  const buyer = await withPlan('FREE');
  const list = await call(buyer.token, 'GET', '/market/listings?search=Bé đi chơi&sort=newest&limit=50');
  const card = list.body.data.items.find((i) => i.id === listing.id);
  assert.ok(card);
  assert.equal(card.owned, false);
  assert.equal(card.priceTier.priceVnd, 0);

  const claim = await call(buyer.token, 'POST', '/market/checkout', { listingId: listing.id });
  assert.equal(claim.status, 201, JSON.stringify(claim.body));
  assert.equal(claim.body.data.checkoutUrl, null);
  assert.equal(claim.body.data.order.status, 'paid');
  assert.equal((await call(buyer.token, 'POST', '/market/checkout', { listingId: listing.id })).status, 409);
  assert.equal((await call(buyer.token, 'GET', `/market/listings/${listing.id}`)).body.data.listing.owned, true);
  assert.equal((await call(buyer.token, 'GET', '/market/owned')).body.data.items[0].id, listing.id);

  const kid = await createChild(buyer.user.id, 'Na');
  const shelf = await call(buyer.token, 'POST', '/bookshelf', { childId: kid.id, storyId: listing.publishedStoryId });
  assert.equal(shelf.status, 201, JSON.stringify(shelf.body));
  await call(buyer.token, 'POST', '/auth/kid-pin/set', { pin: '1234' });
  const enter = await call(buyer.token, 'POST', '/auth/kid-mode/enter', { childId: kid.id });
  const kidToken = enter.body.data.session.kidSessionToken;
  const read = await call(kidToken, 'POST', '/kid/sessions', { storyId: listing.publishedStoryId });
  assert.equal(read.status, 201, JSON.stringify(read.body));
  assert.equal(read.body.data.story.pages[0].text, 'Bống ở trang 1.');
});

test('mua truyen co gia qua payOS: nguoi ban nhan 80% vao ngan cho, mo khoa sau 3 ngay', { skip }, async () => {
  const payos = fakePayos();
  setPayosClient(payos);
  const { seller, listing } = await publishedListing(19000);
  const buyer = await withPlan('FREE');
  const res = await call(buyer.token, 'POST', '/market/checkout', { listingId: listing.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const req = payos.state.created.at(-1);
  assert.equal(req.amount, 19000);
  assert.match(req.returnUrl, /\/parent\/marketplace\/result\?orderId=/);
  const item = await prisma.orderItem.findFirst({ where: { orderId: res.body.data.order.id } });
  assert.equal(Number(item.sellerShareRate), 0.8);
  assert.equal(item.sellerAmountVnd, 15200n);

  payos.state.status.set(req.orderCode, { status: 'PAID', amountPaid: 19000 });
  const got = await call(buyer.token, 'GET', `/payments/orders/${res.body.data.order.id}`);
  assert.equal(got.body.data.order.status, 'paid');
  let w = await wallet(seller.user.id);
  assert.deepEqual([w.earningPendingVnd, w.earningAvailableVnd], [15200n, 0n]);
  assert.equal((await prisma.listing.findUnique({ where: { id: listing.id } })).purchaseCount, 1);

  await earnings.releaseDueEarnings(prisma, new Date(Date.now() + 2 * 86_400_000));
  w = await wallet(seller.user.id);
  assert.equal(w.earningAvailableVnd, 0n, 'chua du 3 ngay');
  await earnings.releaseDueEarnings(prisma, new Date(Date.now() + 3 * 86_400_000 + 60_000));
  await earnings.releaseDueEarnings(prisma, new Date(Date.now() + 4 * 86_400_000)); // chay lai khong mo khoa trung
  w = await wallet(seller.user.id);
  assert.deepEqual([w.earningPendingVnd, w.earningAvailableVnd], [0n, 15200n]);
  const rows = await prisma.walletLedger.findMany({ where: { userId: seller.user.id, walletType: 'earning' }, orderBy: { id: 'asc' } });
  assert.deepEqual(rows.map((r) => [r.entryType, r.amount]), [['earning_pending', 15200n], ['earning_release', 15200n]]);
});

test('khong mua truyen cua chinh minh; truyen chua duyet khong tim thay; chua mua thi khong len gia sach', { skip }, async () => {
  const { seller, listing } = await publishedListing(29000);
  assert.equal((await call(seller.token, 'POST', '/market/checkout', { listingId: listing.id })).status, 422);
  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'suspended' } });
  const buyer = await withPlan('FREE');
  assert.equal((await call(buyer.token, 'POST', '/market/checkout', { listingId: listing.id })).status, 404);
  const kid = await createChild(buyer.user.id, 'Mi');
  assert.equal((await call(buyer.token, 'POST', '/bookshelf', { childId: kid.id, storyId: listing.publishedStoryId })).status, 404);
  const mod = await createUser({ role: 'moderator' });
  assert.ok(mod);
});
