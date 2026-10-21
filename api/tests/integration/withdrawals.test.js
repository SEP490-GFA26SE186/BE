import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let earnings;
let setPayosPayoutClient;

/** Chi ho gia: tao lenh -> id; trang thai do test dat. */
function fakePayout() {
  const state = { created: [], result: new Map() };
  return {
    state,
    payouts: {
      create: async (req, idem) => {
        state.created.push({ req, idem });
        const id = `po_${req.referenceId}`;
        state.result.set(id, { approvalState: 'PROCESSING', transactions: [{ state: 'PROCESSING' }] });
        return { id, referenceId: req.referenceId, approvalState: 'PROCESSING' };
      },
      get: async (id) => ({ id, ...state.result.get(id) }),
    },
  };
}

before(async () => {
  if (skip) return;
  api = await startServer();
  earnings = await import('../../src/modules/wallets/earningLedger.js');
  ({ setPayosPayoutClient } = await import('../../src/clients/payos.js'));
  const { platformSettingsData } = await import('../../prisma/seed_platform_settings.js');
  const mod = await prisma.user.findFirst({ where: { role: 'specialist' } });
  for (const { key, value } of platformSettingsData.filter((s) => s.key.startsWith('market.'))) {
    await prisma.platformSetting.upsert({ where: { key }, update: {}, create: { key, value, updatedBy: mod.id } });
  }
});

after(async () => {
  if (api) await api.close();
  await prisma.$disconnect();
});

const call = (token, method, path, body) => api.request(method, path, { token, body });

/** Nguoi ban da duyet co `available` dong rut duoc (ghi qua so cai that). */
async function sellerWith(available) {
  const s = await createParent();
  await prisma.sellerProfile.create({ data: { userId: s.user.id, displayName: `NB ${Date.now()}`, status: 'approved' } });
  await prisma.$transaction(async (tx) => {
    const fakeItem = crypto.randomUUID();
    await earnings.recordEarning(tx, { sellerId: s.user.id, amount: BigInt(available), orderItemId: fakeItem, availableAt: new Date(Date.now() - 1000) });
  });
  await earnings.releaseDueEarnings(prisma);
  return s;
}

const wallet = (userId) => prisma.wallet.findUnique({ where: { userId } });
const bank = { bankBin: '970416', bankName: 'ACB', accountNumber: '0123456789', accountHolder: 'Nguyen Van A' };

test('tai khoan ngan hang: ma hoa khi luu, hien so che; vua doi -> chua rut duoc 24 gio', { skip }, async () => {
  const s = await sellerWith(100000);
  const res = await call(s.token, 'PUT', '/sellers/me/bank', bank);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.bank.accountNumber, '******6789');
  assert.equal(res.body.data.bank.accountHolder, 'NGUYEN VAN A');
  const row = await prisma.sellerProfile.findUnique({ where: { userId: s.user.id } });
  assert.ok(row.bankAccountNumber.startsWith('v1:') && !row.bankAccountNumber.includes('0123456789'));
  const early = await call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 60000 });
  assert.equal(early.status, 422);
  assert.match(early.body.message, /24 giờ/);
});

async function readySeller(available) {
  const s = await sellerWith(available);
  await call(s.token, 'PUT', '/sellers/me/bank', bank);
  await prisma.sellerProfile.update({ where: { userId: s.user.id }, data: { bankUpdatedAt: new Date(Date.now() - 25 * 3_600_000) } });
  return s;
}

test('rut tien: toi thieu / vuot so du -> 422; giu tien; chi mot yeu cau mo; huy -> tra tien', { skip }, async () => {
  const s = await readySeller(100000);
  assert.equal((await call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 10000 })).status, 422);
  assert.equal((await call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 200000 })).status, 422);
  const ok = await call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 80000 });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  let w = await wallet(s.user.id);
  assert.deepEqual([w.earningAvailableVnd, w.earningLockedVnd], [20000n, 80000n]);
  assert.equal((await call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 50000 })).status, 409);
  const cancel = await call(s.token, 'DELETE', `/sellers/me/withdrawals/${ok.body.data.withdrawal.id}`);
  assert.equal(cancel.body.data.withdrawal.status, 'cancelled');
  w = await wallet(s.user.id);
  assert.deepEqual([w.earningAvailableVnd, w.earningLockedVnd], [100000n, 0n]);
});

test('Admin duyet -> chi ho payOS dung tai khoan / so tien -> SUCCEEDED -> paid, tru tien da giu', { skip }, async () => {
  const payout = fakePayout();
  setPayosPayoutClient(payout);
  const s = await readySeller(150000);
  const admin = await createUser({ role: 'admin' });
  const { withdrawal } = (await call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 150000 })).body.data;
  const list = await call(admin.token, 'GET', '/admin/withdrawals');
  assert.ok(list.body.data.withdrawals.some((x) => x.id === withdrawal.id));

  const approve = await call(admin.token, 'POST', `/admin/withdrawals/${withdrawal.id}/approve`);
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  assert.equal(approve.body.data.withdrawal.status, 'processing');
  const { req, idem } = payout.state.created[0];
  assert.deepEqual([req.amount, req.toBin, req.toAccountNumber, req.referenceId], [150000, '970416', '0123456789', withdrawal.id]);
  assert.equal(idem, `withdrawal-${withdrawal.id}`);
  assert.equal((await call(admin.token, 'POST', `/admin/withdrawals/${withdrawal.id}/approve`)).status, 409, 'khong chi trung');

  payout.state.result.set(`po_${withdrawal.id}`, { approvalState: 'COMPLETED', transactions: [{ state: 'SUCCEEDED' }] });
  const synced = await call(admin.token, 'POST', `/admin/withdrawals/${withdrawal.id}/sync`);
  assert.equal(synced.body.data.withdrawal.status, 'paid');
  const w = await wallet(s.user.id);
  assert.deepEqual([w.earningAvailableVnd, w.earningLockedVnd], [0n, 0n]);
  const types = (await prisma.walletLedger.findMany({ where: { userId: s.user.id, walletType: 'earning' }, orderBy: { id: 'asc' } })).map((r) => r.entryType);
  assert.deepEqual(types, ['earning_pending', 'earning_release', 'withdrawal_hold', 'withdrawal_paid']);
});

test('chi ho that bai -> rejected, tra tien; Admin tu choi bat buoc ly do', { skip }, async () => {
  const payout = fakePayout();
  setPayosPayoutClient(payout);
  const admin = await createUser({ role: 'admin' });
  const a = await readySeller(90000);
  const wa = (await call(a.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 90000 })).body.data.withdrawal;
  await call(admin.token, 'POST', `/admin/withdrawals/${wa.id}/approve`);
  payout.state.result.set(`po_${wa.id}`, { approvalState: 'FAILED', transactions: [{ state: 'FAILED' }] });
  const failed = await call(admin.token, 'POST', `/admin/withdrawals/${wa.id}/sync`);
  assert.equal(failed.body.data.withdrawal.status, 'rejected');
  assert.equal((await wallet(a.user.id)).earningAvailableVnd, 90000n);

  const b = await readySeller(70000);
  const wb = (await call(b.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 70000 })).body.data.withdrawal;
  assert.equal((await call(admin.token, 'POST', `/admin/withdrawals/${wb.id}/reject`, {})).status, 400);
  const rejected = await call(admin.token, 'POST', `/admin/withdrawals/${wb.id}/reject`, { reason: 'Sai tên chủ tài khoản' });
  assert.equal(rejected.body.data.withdrawal.status, 'rejected');
  assert.equal(rejected.body.data.withdrawal.rejectReason, 'Sai tên chủ tài khoản');
  assert.equal((await wallet(b.user.id)).earningAvailableVnd, 70000n);
});

test('rut tien song song: hai yeu cau cung luc -> chi mot cai duoc tao (khoa ho so ban)', { skip }, async () => {
  const s = await readySeller(200000);
  const [a, b] = await Promise.all([
    call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 60000 }),
    call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 70000 }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(await prisma.withdrawalRequest.count({ where: { sellerId: s.user.id } }), 1);
});

test('mo khoa doanh thu: dong da mo khoa khong chiem cho trong lo (lo 1 dong van toi khoan moi)', { skip }, async () => {
  const s = await sellerWith(10000); // khoan 1 da mo khoa trong sellerWith
  const later = new Date(Date.now() + 1000);
  await prisma.$transaction((tx) =>
    earnings.recordEarning(tx, { sellerId: s.user.id, amount: 5000n, orderItemId: crypto.randomUUID(), availableAt: new Date(Date.now() - 500) }),
  );
  // Lo 1 dong: ban cu lay lai dong cu nhat (da mo khoa) va khong bao gio toi khoan moi.
  for (let i = 0; i < 50 && (await wallet(s.user.id)).earningPendingVnd > 0n; i++) {
    await earnings.releaseDueEarnings(prisma, later, { batch: 1 });
  }
  const w = await wallet(s.user.id);
  assert.deepEqual([w.earningPendingVnd, w.earningAvailableVnd], [0n, 15000n]);
});
