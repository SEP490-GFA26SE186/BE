import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, createParent, createUser, startServer } from './_fixtures.js';

const skip = !hasTestDb;
let api;
let earnings;

before(async () => {
  if (skip) return;
  api = await startServer();
  earnings = await import('../../src/modules/wallets/earningLedger.js');
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

test('Admin chuyen khoan tay: thay so tai khoan day du -> danh dau da chuyen -> paid, tru tien da giu', { skip }, async () => {
  const s = await readySeller(150000);
  const admin = await createUser({ role: 'admin' });
  const { withdrawal } = (await call(s.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 150000 })).body.data;
  assert.equal(withdrawal.bank.accountNumber, '******6789', 'nguoi ban chi thay so che');

  const list = await call(admin.token, 'GET', '/admin/withdrawals');
  const row = list.body.data.withdrawals.find((x) => x.id === withdrawal.id);
  assert.deepEqual([row.bank.bankBin, row.bank.accountNumber, row.bank.accountHolder], ['970416', '0123456789', 'NGUYEN VAN A']);

  const paid = await call(admin.token, 'POST', `/admin/withdrawals/${withdrawal.id}/mark-paid`, { bankTransactionRef: 'FT2610240001' });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.data.withdrawal.status, 'paid');
  const stored = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawal.id } });
  assert.deepEqual([stored.bankTransactionRef, stored.handledBy], ['FT2610240001', admin.user.id]);
  assert.equal((await call(admin.token, 'POST', `/admin/withdrawals/${withdrawal.id}/mark-paid`)).status, 409, 'khong tru hai lan');

  const w = await wallet(s.user.id);
  assert.deepEqual([w.earningAvailableVnd, w.earningLockedVnd], [0n, 0n]);
  const types = (await prisma.walletLedger.findMany({ where: { userId: s.user.id, walletType: 'earning' }, orderBy: { id: 'asc' } })).map((r) => r.entryType);
  assert.deepEqual(types, ['earning_pending', 'earning_release', 'withdrawal_hold', 'withdrawal_paid']);

  const done = await call(admin.token, 'GET', '/admin/withdrawals?status=paid');
  assert.equal(done.body.data.withdrawals.find((x) => x.id === withdrawal.id).bank.accountNumber, '******6789', 'da xong thi chi so che');
});

test('Admin tu choi bat buoc ly do -> tra tien; khong tu choi yeu cau da chuyen; danh dau khong can ma giao dich', { skip }, async () => {
  const admin = await createUser({ role: 'admin' });
  const b = await readySeller(70000);
  const wb = (await call(b.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 70000 })).body.data.withdrawal;
  assert.equal((await call(admin.token, 'POST', `/admin/withdrawals/${wb.id}/reject`, {})).status, 400);
  const rejected = await call(admin.token, 'POST', `/admin/withdrawals/${wb.id}/reject`, { reason: 'Sai tên chủ tài khoản' });
  assert.equal(rejected.body.data.withdrawal.status, 'rejected');
  assert.equal(rejected.body.data.withdrawal.rejectReason, 'Sai tên chủ tài khoản');
  assert.equal((await wallet(b.user.id)).earningAvailableVnd, 70000n);
  assert.equal((await call(admin.token, 'POST', `/admin/withdrawals/${wb.id}/mark-paid`)).status, 409);

  const c = await readySeller(60000);
  const wc = (await call(c.token, 'POST', '/sellers/me/withdrawals', { amountVnd: 60000 })).body.data.withdrawal;
  const paid = await call(admin.token, 'POST', `/admin/withdrawals/${wc.id}/mark-paid`);
  assert.equal(paid.body.data.withdrawal.status, 'paid');
  assert.equal((await call(admin.token, 'POST', `/admin/withdrawals/${wc.id}/reject`, { reason: 'Đổi ý' })).status, 409);
  assert.equal((await call(c.token, 'DELETE', `/sellers/me/withdrawals/${wc.id}`)).status, 409, 'nguoi ban khong huy duoc khi da chuyen');
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
