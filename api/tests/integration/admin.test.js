import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, createChild, createCharacter, getSeededTopic, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let topic;
let store;
let earnings;
let tiers;
let admin;

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await getSeededTopic();
  store = await import('../../src/modules/billing/billing.store.js');
  earnings = await import('../../src/modules/wallets/earningLedger.js');
  await (await import('../../prisma/seed_plans.js')).seedPlans(prisma);
  await (await import('../../prisma/seed_market.js')).seedMarket(prisma);
  const { platformSettingsData } = await import('../../prisma/seed_platform_settings.js');
  const mod = await prisma.user.findFirst({ where: { role: 'moderator' } });
  for (const { key, value } of platformSettingsData.filter((s) => /^(market|moderation)\./.test(s.key))) {
    await prisma.platformSetting.upsert({ where: { key }, update: {}, create: { key, value, updatedBy: mod.id } });
  }
  tiers = Object.fromEntries((await prisma.priceTier.findMany()).map((t) => [Number(t.priceVnd), t]));
  admin = await createUser({ role: 'admin' });
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });

async function withPlan(code) {
  const f = await createParent();
  await prisma.wallet.create({ data: { userId: f.user.id } });
  await buy(f, { itemType: 'plan', planId: (await prisma.plan.findUnique({ where: { code } })).id, unitPriceVnd: 0n });
  return f;
}

/** Don da thanh toan (gia lap payOS xac nhan) + giao hang qua billing.store.fulfillOrder. */
async function buy(f, item, { paidAt = new Date(), payosOrderCode = null } = {}) {
  const total = item.unitPriceVnd;
  const order = await prisma.order.create({
    data: { buyerId: f.user.id, subtotalVnd: total, totalVnd: total, payosOrderCode: total > 0n ? payosOrderCode ?? BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)) : null, items: { create: item } },
    include: { items: true },
  });
  await prisma.$transaction((tx) => store.fulfillOrder(tx, order.id, { now: paidAt }));
  return order;
}

async function publishedListing(price) {
  const s = await withPlan('FAMILY_MONTH');
  await prisma.sellerProfile.create({ data: { userId: s.user.id, displayName: `Người bán ${Date.now()}`, status: 'approved' } });
  const child = await createChild(s.user.id, 'Bin');
  const bin = await createCharacter(s.user.id, 'Bin', { childId: child.id });
  const story = (await call(s.token, 'POST', '/stories', { topicId: topic.id, length: 'custom', title: 'Truyện', useTts: false, characters: [{ characterId: bin.id, isMain: true }] })).body.data.story;
  for (const p of story.pages) await prisma.storyPage.update({ where: { id: p.id }, data: { contentText: `{NV1} ở trang ${p.pageOrder}.` } });
  await call(s.token, 'POST', `/stories/${story.id}/review`);
  const { listing } = (await call(s.token, 'POST', '/listings', { storyId: story.id, title: `Truyện thử quản trị ${Date.now()}`, priceTierId: tiers[price].id, aliases: [{ token: '{NV1}', aliasName: 'Bống' }] })).body.data;
  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'published', publishedAt: new Date() } });
  return { seller: s, listing };
}

const listingItem = (listing, price) => ({ itemType: 'listing', listingId: listing.id, unitPriceVnd: BigInt(price), sellerShareRate: 0.8, sellerAmountVnd: BigInt(price * 0.8) });

test('tai khoan: chi Admin; tim kiem; khoa -> chan request + khong tu khoa minh; tao Moderator', { skip }, async () => {
  const parent = await createParent();
  assert.equal((await call(parent.token, 'GET', '/admin/accounts')).status, 403);
  const list = await call(admin.token, 'GET', `/admin/accounts?search=${encodeURIComponent(parent.user.email)}`);
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.data.accounts[0].id, parent.user.id);

  assert.equal((await call(admin.token, 'PATCH', `/admin/accounts/${admin.user.id}`, { isActive: false })).status, 422);
  assert.equal((await call(admin.token, 'PATCH', `/admin/accounts/${parent.user.id}`, { isActive: false })).status, 200);
  assert.equal((await call(parent.token, 'GET', '/children')).status, 401, 'tai khoan bi khoa');
  await call(admin.token, 'PATCH', `/admin/accounts/${parent.user.id}`, { isActive: true });
  assert.equal((await call(parent.token, 'GET', '/children')).status, 200);

  const tag = Date.now();
  const body = { email: `kdv${tag}@test.vn`, username: `kdv_${tag}`, fullName: 'Kiểm duyệt viên mới', password: 'matkhau123' };
  const m = await call(admin.token, 'POST', '/admin/accounts/moderators', body);
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal(m.body.data.account.role, 'moderator');
  assert.equal((await call(admin.token, 'POST', '/admin/accounts/moderators', body)).status, 409);
  const login = await api.request('POST', '/auth/login', { body: { emailOrUsername: body.email, password: body.password } });
  assert.ok([200, 201].includes(login.status), JSON.stringify(login.body));
});

test('goi + bac gia: sua goi ghi nhat ky, goi Mien phi giu 0d; bac gia dang dung khong doi so tien', { skip }, async () => {
  const plans = (await call(admin.token, 'GET', '/admin/plans')).body.data.plans;
  const free = plans.find((p) => p.code === 'FREE');
  assert.equal((await call(admin.token, 'PUT', `/admin/plans/${free.id}`, { priceVnd: 1000 })).status, 422);
  assert.equal((await call(admin.token, 'PUT', `/admin/plans/${free.id}`, { isActive: false })).status, 422);
  // Goi rieng cho test (khong sua goi seed: test chu ky goi chay song song doc credit cua chung)
  const code = `TEST_${Date.now()}`;
  const body = { code, name: 'Gói thử', durationMonths: 1, priceVnd: 1000, creditsPerMonth: 1, maxChildren: 1, maxCharacters: 1, isActive: false };
  const newPlan = await call(admin.token, 'POST', '/admin/plans', body);
  assert.equal(newPlan.status, 201, JSON.stringify(newPlan.body));
  assert.equal((await call(admin.token, 'POST', '/admin/plans', body)).status, 409);
  const planId = newPlan.body.data.plan.id;
  const upd = await call(admin.token, 'PUT', `/admin/plans/${planId}`, { creditsPerMonth: 2, priceVnd: 2000 });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.deepEqual([upd.body.data.plan.creditsPerMonth, upd.body.data.plan.priceVnd], [2, 2000]);
  assert.ok(await prisma.adminAuditLog.count({ where: { action: 'plan.update', targetId: planId } }));
  await prisma.adminAuditLog.deleteMany({ where: { targetId: planId } });
  await prisma.plan.delete({ where: { code } });

  await publishedListing(19000);
  const used = (await call(admin.token, 'GET', '/admin/price-tiers')).body.data.tiers.find((t) => t.priceVnd === 19000);
  assert.ok(used.listingsCount >= 1);
  const lock = await call(admin.token, 'PUT', `/admin/price-tiers/${used.id}`, { priceVnd: 21000 });
  assert.equal(lock.status, 422);
  assert.equal((await call(admin.token, 'PUT', `/admin/price-tiers/${used.id}`, { label: used.label })).status, 200);
  const price = 10_000 + (Date.now() % 1000) * 7;
  const created = await call(admin.token, 'POST', '/admin/price-tiers', { label: 'Thử', priceVnd: price });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal((await call(admin.token, 'POST', '/admin/price-tiers', { label: 'Trùng', priceVnd: price })).status, 409);
  assert.equal((await call(admin.token, 'PUT', `/admin/price-tiers/${created.body.data.tier.id}`, { priceVnd: price + 1 })).status, 200, 'chua dung -> doi duoc');
  await prisma.priceTier.delete({ where: { id: created.body.data.tier.id } });
});

test('cau hinh: sua theo danh sach, rang buoc cheo, khoa ngoai danh sach -> 422', { skip }, async () => {
  const s = (await call(admin.token, 'GET', '/admin/settings')).body.data;
  assert.ok(s.settings.some((x) => x.key === 'market.seller_share_rate'));
  assert.equal((await call(admin.token, 'PUT', '/admin/settings/story_layout.short', { value: 3 })).status, 422);
  assert.equal((await call(admin.token, 'PUT', '/admin/settings/market.refund_window_days', { value: 10 })).status, 422, 'dai hon so ngay giu');
  const ok = await call(admin.token, 'PUT', '/admin/settings/moderation.audit_per_week', { value: 4 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.setting.value, 4);
  await call(admin.token, 'PUT', '/admin/settings/moderation.audit_per_week', { value: 3 });
});

test('hoan tien truyen: phu huynh yeu cau trong han -> giu doanh thu (cron bo qua) -> Admin duyet: thu hoi quyen doc, go gia sach, tru doanh thu', { skip }, async () => {
  const { seller, listing } = await publishedListing(19000);
  const buyer = await withPlan('FREE');
  // Tra hom nay: doanh thu giu toi +3 ngay (cron cua test khac chay song song khong mo khoa duoc).
  const order = await buy(buyer, listingItem(listing, 19000));
  const item = order.items[0];
  const kid = await createChild(buyer.user.id, 'Na');
  assert.equal((await call(buyer.token, 'POST', '/bookshelf', { childId: kid.id, storyId: listing.publishedStoryId })).status, 201);

  await prisma.order.update({ where: { id: order.id }, data: { paidAt: new Date(Date.now() - 4 * 86_400_000) } });
  const mine = (await call(buyer.token, 'GET', '/payments/orders')).body.data;
  const row = mine.orders.find((o) => o.id === order.id).items[0];
  assert.equal(row.refundable, false, 'qua 3 ngay -> het han');
  assert.equal((await call(buyer.token, 'POST', `/payments/order-items/${item.id}/refund`, { reason: 'Truyện không như mô tả.' })).status, 422);

  await prisma.order.update({ where: { id: order.id }, data: { paidAt: new Date() } });
  const req = await call(buyer.token, 'POST', `/payments/order-items/${item.id}/refund`, { reason: 'Truyện không như mô tả, bé không thích.' });
  assert.equal(req.status, 201, JSON.stringify(req.body));
  assert.equal((await call(buyer.token, 'POST', `/payments/order-items/${item.id}/refund`, { reason: 'Gửi lại lần nữa cho chắc.' })).status, 409);

  // Doanh thu toi han (cron chay sau 4 ngay) nhung dang co yeu cau hoan -> khong mo khoa
  const later = new Date(Date.now() + 4 * 86_400_000);
  await earnings.releaseDueEarnings(prisma, later, { userId: seller.user.id });
  assert.equal(Number((await prisma.wallet.findUnique({ where: { userId: seller.user.id } })).earningPendingVnd), 15200);

  const pending = (await call(admin.token, 'GET', '/admin/refunds')).body.data.refunds.find((r) => r.id === req.body.data.refund.id);
  assert.deepEqual([pending.item.unitPriceVnd, pending.impact.earningState], [19000, 'pending']);
  assert.equal((await call(admin.token, 'POST', `/admin/refunds/${pending.id}/decision`, { approve: true })).status, 422, 'thieu ma giao dich');
  const ok = await call(admin.token, 'POST', `/admin/refunds/${pending.id}/decision`, { approve: true, bankTransactionRef: 'FT26101800001' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  assert.equal((await prisma.orderItem.findUnique({ where: { id: item.id } })).status, 'refunded');
  assert.ok((await prisma.entitlement.findFirst({ where: { parentId: buyer.user.id, listingId: listing.id } })).revokedAt);
  assert.equal(await prisma.bookshelfItem.count({ where: { childId: kid.id } }), 0);
  const w = await prisma.wallet.findUnique({ where: { userId: seller.user.id } });
  assert.deepEqual([Number(w.earningPendingVnd), Number(w.earningAvailableVnd)], [0, 0]);
  await earnings.releaseDueEarnings(prisma, later, { userId: seller.user.id }); // khoan da hoan -> khong mo khoa (khong lam am)
  assert.equal(Number((await prisma.wallet.findUnique({ where: { userId: seller.user.id } })).earningPendingVnd), 0);
  assert.equal((await call(admin.token, 'POST', `/admin/refunds/${pending.id}/decision`, { approve: true, bankTransactionRef: 'x' })).status, 409);
  const after = (await call(buyer.token, 'GET', '/payments/orders')).body.data.orders.find((o) => o.id === order.id).items[0];
  assert.deepEqual([after.status, after.refund.status], ['refunded', 'approved']);
});

test('hoan tien goi: duyet -> huy goi, het credit, ve Mien phi; tu choi phai co ly do', { skip }, async () => {
  const parent = await withPlan('FREE');
  const fam = await prisma.plan.findUnique({ where: { code: 'FAMILY_MONTH' } });
  const order = await buy(parent, { itemType: 'plan', planId: fam.id, unitPriceVnd: fam.priceVnd });
  assert.equal((await prisma.subscription.findFirst({ where: { parentId: parent.user.id, status: 'active' }, include: { plan: true } })).plan.code, 'FAMILY_MONTH');
  const r = (await call(parent.token, 'POST', `/payments/order-items/${order.items[0].id}/refund`, { reason: 'Mua nhầm gói, muốn hoàn lại.' })).body.data.refund;
  // Da dung 2 credit (giu 2 khi sinh truyen) -> Admin thay 2 credit da dung (credit_consume luon = 0, khong dem duoc)
  const ledger = await import('../../src/modules/wallets/creditLedger.js');
  await prisma.$transaction((tx) => ledger.holdCredit(tx, { userId: parent.user.id, amount: 2, aiRequestId: crypto.randomUUID() }));
  const info = (await call(admin.token, 'GET', '/admin/refunds')).body.data.refunds.find((x) => x.id === r.id);
  assert.deepEqual([info.impact.subscriptionStatus, info.impact.creditsUsed], ['active', 2]);
  assert.equal((await call(admin.token, 'POST', `/admin/refunds/${r.id}/decision`, { approve: false })).status, 422);
  const ok = await call(admin.token, 'POST', `/admin/refunds/${r.id}/decision`, { approve: true, bankTransactionRef: 'FT26101800002', note: 'Đã hoàn.' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const sub = await prisma.subscription.findFirst({ where: { parentId: parent.user.id, status: 'active' }, include: { plan: true } });
  assert.equal(sub.plan.code, 'FREE');
  assert.equal((await prisma.wallet.findUnique({ where: { userId: parent.user.id } })).creditBalance, sub.plan.creditsPerMonth);
});

test('tai chinh: tong quan co doanh thu / hoa hong / lai lo; doi soat vi khop, sua bo dem truyen', { skip }, async () => {
  const { listing } = await publishedListing(29000);
  const buyer = await withPlan('FREE');
  await buy(buyer, listingItem(listing, 29000));
  const s = await call(admin.token, 'GET', '/admin/finance/summary?range=today');
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const d = s.body.data;
  assert.ok(d.revenue.listingGross >= 29000);
  assert.equal(d.revenue.commission, d.revenue.listingGross - d.revenue.sellerPayable);
  assert.equal(d.pnl.grossProfit, d.revenue.platformRevenue - d.aiCost.totalVnd);
  assert.equal(d.series.length, 1);

  await prisma.listing.update({ where: { id: listing.id }, data: { purchaseCount: 99 } });
  const rec = (await call(admin.token, 'GET', '/admin/finance/reconciliation')).body.data;
  assert.equal(rec.walletMismatches.filter((m) => m.userId === buyer.user.id).length, 0);
  assert.ok(rec.counterDrift.some((c) => c.listingId === listing.id && c.paidActual === 1));
  const fix = await call(admin.token, 'POST', '/admin/finance/reconciliation/fix-counters');
  assert.ok(fix.body.data.fixed >= 1);
  assert.equal((await prisma.listing.findUnique({ where: { id: listing.id } })).purchaseCount, 1);

  const logs = (await call(admin.token, 'GET', '/admin/audit-logs?action=reconcile')).body.data.logs;
  assert.equal(logs[0].action, 'reconcile.fix_counters');
});
