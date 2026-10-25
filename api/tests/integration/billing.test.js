import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let store;
let setPayosClient;
let plans;

/** payOS gia: ghi lai link da tao, tra trang thai do test dat; verify webhook theo chu ky "ok". */
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
    webhooks: {
      verify: async (body) => {
        if (body.signature !== 'ok') throw new Error('Data not integrity');
        return body.data;
      },
    },
  };
}

before(async () => {
  if (skip) return;
  api = await startServer();
  ({ setPayosClient } = await import('../../src/clients/payos.js'));
  store = await import('../../src/modules/billing/billing.store.js');
  const { seedPlans } = await import('../../prisma/seed_plans.js');
  await seedPlans(prisma);
  plans = Object.fromEntries((await prisma.plan.findMany()).map((p) => [p.code, p]));
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

async function parentWithFree() {
  const f = await createParent();
  await prisma.wallet.create({ data: { userId: f.user.id } });
  await prisma.$transaction((tx) => store.ensureFreeSubscription(tx, f.user.id));
  return f;
}
const balance = async (userId) => (await prisma.wallet.findUnique({ where: { userId } })).creditBalance;
const activeSub = (userId) => prisma.subscription.findFirst({ where: { parentId: userId, status: 'active' }, include: { plan: true } });

test('goi Mien phi: co ngay mot dong subscriptions + 3 credit thang dau', { skip }, async () => {
  const f = await parentWithFree();
  assert.equal((await activeSub(f.user.id)).plan.code, 'FREE');
  assert.equal(await balance(f.user.id), 3);
  await prisma.$transaction((tx) => store.ensureFreeSubscription(tx, f.user.id));
  assert.equal(await balance(f.user.id), 3, 'goi lai khong cap them');
});

test('mua goi: link payOS dung so tien / noi dung 9 ky tu; tra tien -> goi moi + credit, credit cu giu', { skip }, async () => {
  const payos = fakePayos();
  setPayosClient(payos);
  const f = await parentWithFree();
  const res = await api.request('POST', '/payments/plans/checkout', { token: f.token, body: { planId: plans.FAMILY_MONTH.id } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { order, checkoutUrl } = res.body.data;
  assert.equal(order.status, 'pending');
  assert.match(checkoutUrl, /^https:\/\/pay\.payos\.vn/);
  const req = payos.state.created[0];
  assert.equal(req.amount, 49000);
  assert.ok(req.description.length <= 9);
  assert.match(req.returnUrl, new RegExp(`orderId=${order.id}$`));

  // Chua tra: van pending, chua doi goi
  let got = await api.request('GET', `/payments/orders/${order.id}`, { token: f.token });
  assert.equal(got.body.data.order.status, 'pending');
  assert.equal((await activeSub(f.user.id)).plan.code, 'FREE');

  payos.state.status.set(req.orderCode, { status: 'PAID', amountPaid: 49000 });
  got = await api.request('GET', `/payments/orders/${order.id}`, { token: f.token });
  assert.equal(got.body.data.order.status, 'paid');
  const sub = await activeSub(f.user.id);
  assert.equal(sub.plan.code, 'FAMILY_MONTH');
  assert.equal(await balance(f.user.id), 3 + 20, 'credit Mien phi con lai duoc giu mot lan');
  assert.equal(await prisma.subscription.count({ where: { parentId: f.user.id, status: 'active' } }), 1);

  // Hoi lai / webhook trung: khong cap them
  await api.request('GET', `/payments/orders/${order.id}`, { token: f.token });
  const hook = await api.request('POST', '/payments/payos/webhook', {
    body: { code: '00', desc: 'success', success: true, data: { orderCode: req.orderCode, amount: 49000, code: '00', reference: `FT${req.orderCode}` }, signature: 'ok' },
  });
  assert.equal(hook.status, 200);
  assert.equal(hook.body.data.processed, false);
  assert.equal(await balance(f.user.id), 23);
});

test('webhook: sai chu ky -> khong giao hang (van 200, co log); dung chu ky -> giao hang', { skip }, async () => {
  const payos = fakePayos();
  setPayosClient(payos);
  const f = await parentWithFree();
  const { order } = (await api.request('POST', '/payments/plans/checkout', { token: f.token, body: { planId: plans.FAMILY_YEAR.id } })).body.data;
  const orderCode = payos.state.created[0].orderCode;
  const body = (signature, amount = 490000) => ({ code: '00', desc: 'success', success: true, data: { orderCode, amount, code: '00', reference: `FT${orderCode}` }, signature });

  const forged = await api.request('POST', '/payments/payos/webhook', { body: body('forged') });
  assert.equal(forged.status, 200);
  assert.equal(forged.body.data.ok, false);
  assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).status, 'pending');
  const log = await prisma.webhookLog.findFirst({ where: { payosOrderCode: BigInt(orderCode) }, orderBy: { id: 'desc' } });
  assert.equal(log.signatureValid, false);

  const short = await api.request('POST', '/payments/payos/webhook', { body: body('ok', 1000) });
  assert.equal(short.body.data.reason, 'amount_mismatch');

  const good = await api.request('POST', '/payments/payos/webhook', { body: body('ok') });
  assert.equal(good.body.data.processed, true);
  assert.equal((await activeSub(f.user.id)).plan.code, 'FAMILY_YEAR');

  // Request thu cua payOS luc dang ky URL: orderCode khong co -> 200, khong loi
  const probe = await api.request('POST', '/payments/payos/webhook', { body: { ...body('ok'), data: { orderCode: 123, amount: 3000, code: '00' } } });
  assert.equal(probe.status, 200);
  assert.equal(probe.body.data.reason, 'unknown_order');
});

test('huy tren payOS -> don cancelled, goi khong doi', { skip }, async () => {
  const payos = fakePayos();
  setPayosClient(payos);
  const f = await parentWithFree();
  const { order } = (await api.request('POST', '/payments/plans/checkout', { token: f.token, body: { planId: plans.FAMILY_MONTH.id } })).body.data;
  payos.state.status.set(payos.state.created[0].orderCode, { status: 'CANCELLED', amountPaid: 0 });
  const got = await api.request('GET', `/payments/orders/${order.id}`, { token: f.token });
  assert.equal(got.body.data.order.status, 'cancelled');
  assert.equal((await activeSub(f.user.id)).plan.code, 'FREE');
});

test('chu ky goi: goi thang het ky -> credit het han, ve Mien phi; goi nam giua ky -> cap thang moi', { skip }, async () => {
  const f = await parentWithFree();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: { buyerId: f.user.id, subtotalVnd: 49000n, totalVnd: 49000n, payosOrderCode: BigInt(Date.now()), items: { create: { itemType: 'plan', planId: plans.FAMILY_MONTH.id, unitPriceVnd: 49000n } } },
    });
    await store.fulfillOrder(tx, o.id, { now: new Date(now.getTime() - 40 * 864e5) });
  });
  assert.equal(await balance(f.user.id), 23);
  const r = await store.runBillingCycle(prisma, now);
  assert.ok(r.expired >= 1);
  assert.equal((await activeSub(f.user.id)).plan.code, 'FREE');
  assert.equal(await balance(f.user.id), 3, 'credit cu het han, cap 3 credit Mien phi');
  await store.runBillingCycle(prisma, now);
  assert.equal(await balance(f.user.id), 3, 'chay lai khong cap trung');

  const y = await parentWithFree();
  await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: { buyerId: y.user.id, subtotalVnd: 490000n, totalVnd: 490000n, payosOrderCode: BigInt(Date.now() + 7), items: { create: { itemType: 'plan', planId: plans.FAMILY_YEAR.id, unitPriceVnd: 490000n } } },
    });
    await store.fulfillOrder(tx, o.id, { now: new Date(now.getTime() - 35 * 864e5) });
  });
  await prisma.wallet.update({ where: { userId: y.user.id }, data: { creditBalance: 23 } }); // chi de de doc
  await store.runBillingCycle(prisma, now);
  assert.equal((await activeSub(y.user.id)).plan.code, 'FAMILY_YEAR');
  assert.equal(await balance(y.user.id), 20, 'thang moi: credit du het han, cap 20');
});

test('gia han: mua lai dung goi dang dung -> cong them thoi han vao ngay het han, khong tao ky moi, khong cap credit them', { skip }, async () => {
  const payos = fakePayos();
  setPayosClient(payos);
  const f = await parentWithFree();
  const pay = async () => {
    const res = await api.request('POST', '/payments/plans/checkout', { token: f.token, body: { planId: plans.FAMILY_MONTH.id } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const req = payos.state.created.at(-1);
    payos.state.status.set(req.orderCode, { status: 'PAID', amountPaid: 49000 });
    const got = await api.request('GET', `/payments/orders/${res.body.data.order.id}`, { token: f.token });
    assert.equal(got.body.data.order.status, 'paid');
  };
  await pay();
  const first = await activeSub(f.user.id);
  const credits = await balance(f.user.id);

  await pay(); // gia han
  const renewed = await activeSub(f.user.id);
  assert.equal(renewed.id, first.id, 'cung mot ky, khong tao moi');
  assert.equal(renewed.periodStart.getTime(), first.periodStart.getTime());
  const expected = new Date(first.periodEnd);
  expected.setUTCMonth(expected.getUTCMonth() + 1);
  assert.equal(renewed.periodEnd.toISOString().slice(0, 10), expected.toISOString().slice(0, 10), 'het han + 1 thang');
  assert.equal(await balance(f.user.id), credits, 'credit thang toi cap theo lich, khong cap ngay');
  assert.equal(await prisma.subscription.count({ where: { parentId: f.user.id, status: 'active' } }), 1);
});
