import { hasTestDb } from './_db.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma, createParent, createWallet } from './_fixtures.js';
import { holdCredit, releaseCredit, consumeCredit } from '../../src/modules/wallets/creditLedger.js';

const skip = !hasTestDb;
after(() => prisma.$disconnect());

/** Phu huynh + vi co so du `balance` (null = khong co vi). Ghi mot dong credit_grant de bat bien so du = tong ledger. */
async function setup(balance) {
  const { user } = await createParent();
  if (balance !== null) {
    await createWallet(user.id, balance);
    if (balance > 0) {
      await prisma.walletLedger.create({
        data: {
          userId: user.id,
          walletType: 'credit',
          entryType: 'credit_grant',
          amount: BigInt(balance),
          balanceAfter: BigInt(balance),
          idempotencyKey: `test:grant:${crypto.randomUUID()}`,
        },
      });
    }
  }
  return { userId: user.id, aiRequestId: crypto.randomUUID() };
}

const run = (fn) => prisma.$transaction(fn);
const balanceOf = async (userId) => (await prisma.wallet.findUnique({ where: { userId } })).creditBalance;
const ledgerOf = (userId) => prisma.walletLedger.findMany({ where: { userId }, orderBy: { id: 'asc' } });
const forRequest = async (userId, aiRequestId) => (await ledgerOf(userId)).filter((r) => r.refId === aiRequestId);

async function assertInvariant(userId) {
  const sum = (await ledgerOf(userId))
    .filter((r) => r.walletType === 'credit')
    .reduce((s, r) => s + Number(r.amount), 0);
  assert.equal(await balanceOf(userId), sum);
}

test('hold rồi release -> số dư như cũ, 2 dòng ledger', { skip }, async () => {
  const { userId, aiRequestId } = await setup(10);
  await run((tx) => holdCredit(tx, { userId, amount: 4, aiRequestId }));
  assert.equal(await balanceOf(userId), 6);
  await run((tx) => releaseCredit(tx, { userId, amount: 4, aiRequestId }));
  assert.equal(await balanceOf(userId), 10);
  const rows = await forRequest(userId, aiRequestId);
  assert.deepEqual(rows.map((r) => r.entryType), ['credit_hold', 'credit_release']);
  assert.deepEqual(rows.map((r) => r.amount), [-4n, 4n]);
  assert.equal(rows[0].idempotencyKey, `ai:${aiRequestId}:hold`);
  await assertInvariant(userId);
});

test('hold rồi consume -> số dư giảm amount, 2 dòng ledger', { skip }, async () => {
  const { userId, aiRequestId } = await setup(10);
  await run((tx) => holdCredit(tx, { userId, amount: 4, aiRequestId }));
  await run((tx) => consumeCredit(tx, { userId, aiRequestId }));
  assert.equal(await balanceOf(userId), 6);
  const rows = await forRequest(userId, aiRequestId);
  assert.deepEqual(rows.map((r) => r.entryType), ['credit_hold', 'credit_consume']);
  assert.equal(rows[1].amount, 0n);
  assert.equal(rows[1].balanceAfter, 6n);
  await assertInvariant(userId);
});

test('gọi hai lần là idempotent (hold, release, consume)', { skip }, async () => {
  const a = await setup(10);
  await run((tx) => holdCredit(tx, { ...a, amount: 3 }));
  await run((tx) => holdCredit(tx, { ...a, amount: 3 }));
  assert.equal(await balanceOf(a.userId), 7);
  await run((tx) => releaseCredit(tx, { ...a, amount: 3 }));
  await run((tx) => releaseCredit(tx, { ...a, amount: 3 }));
  assert.equal(await balanceOf(a.userId), 10);
  assert.equal((await forRequest(a.userId, a.aiRequestId)).length, 2);
  await assertInvariant(a.userId);

  const b = await setup(10);
  await run((tx) => holdCredit(tx, { ...b, amount: 3 }));
  await run((tx) => consumeCredit(tx, b));
  await run((tx) => consumeCredit(tx, b));
  assert.equal((await ledgerOf(b.userId)).filter((r) => r.entryType === 'credit_consume').length, 1);
  await assertInvariant(b.userId);
});

test('hold khi thiếu tiền -> 402, không dòng nào, số dư giữ nguyên', { skip }, async () => {
  const { userId, aiRequestId } = await setup(2);
  const before = (await ledgerOf(userId)).length;
  await assert.rejects(
    run((tx) => holdCredit(tx, { userId, amount: 3, aiRequestId })),
    (e) => e.statusCode === 402,
  );
  assert.equal(await balanceOf(userId), 2);
  assert.equal((await ledgerOf(userId)).length, before);
  await assertInvariant(userId);
});

test('ví chưa tồn tại -> 402, không tự tạo ví', { skip }, async () => {
  const { userId, aiRequestId } = await setup(null);
  await assert.rejects(
    run((tx) => holdCredit(tx, { userId, amount: 1, aiRequestId })),
    (e) => e.statusCode === 402,
  );
  assert.equal(await prisma.wallet.findUnique({ where: { userId } }), null);
  assert.equal((await ledgerOf(userId)).length, 0);
});

test('hai hold đồng thời cùng key -> một dòng, trừ một lần', { skip }, async () => {
  const a = await setup(10);
  await Promise.all([
    run((tx) => holdCredit(tx, { ...a, amount: 3 })),
    run((tx) => holdCredit(tx, { ...a, amount: 3 })),
  ]);
  assert.equal(await balanceOf(a.userId), 7);
  assert.equal((await forRequest(a.userId, a.aiRequestId)).length, 1);
  await assertInvariant(a.userId);
});
