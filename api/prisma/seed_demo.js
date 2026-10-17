// =============================================================================
// Du lieu DEMO cho moi truong dev / buoi demo — KHONG chay tren production.
//   npm run db:seed:demo        (chay sau `npm run db:seed`)
//
// Khop Web/docs/DEMO_ACCOUNTS.md: 3 tai khoan, mat khau chung 123456, PIN Kid Mode 1234.
// Chay lai nhieu lan van ra cung ket qua: user upsert theo email (dat lai mat khau / PIN de
// demo luon dang nhap duoc), credit chi cap mot lan (idempotency_key co dinh), be + nhan vat
// chi tao neu chua co.
// =============================================================================

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

export const DEMO_PASSWORD = '123456';
export const DEMO_KID_PIN = '1234';
export const DEMO_CREDITS = 50;

export const DEMO_USERS = [
  { role: 'parent', email: 'me.lanhuong@storyweaver.vn', username: 'me_lanhuong', fullName: 'Mẹ Lan Hương', phone: '0901234567' },
  { role: 'moderator', email: 'kdv@storyweaver.vn', username: 'kdv_demo', fullName: 'Kiểm duyệt viên', phone: '0907654321' },
  { role: 'admin', email: 'admin@storyweaver.vn', username: 'admin_demo', fullName: 'Quản trị viên', phone: '0909999999' },
];

export const DEMO_CHILD = { name: 'Bin', birthDate: '2020-05-01', appearance: 'Bé trai 6 tuổi, tóc ngắn đen, áo thun xanh' };
export const DEMO_CHARACTERS = [{ name: 'Bà', appearance: 'Bà nội tóc bạc búi gọn, đeo kính, áo bà ba nâu' }];

/** Khoa idempotency cua lan cap credit demo — doi `v1` neu muon cap them mot lan nua. */
export const demoGrantKey = (userId) => `demo:grant:v1:${userId}`;

async function upsertUser(prisma, u, passwordHash, kidExitPinHash) {
  const data = {
    role: u.role, username: u.username, fullName: u.fullName, phone: u.phone,
    passwordHash, emailVerifiedAt: new Date(), isActive: true, deletedAt: null,
    ...(u.role === 'parent' ? { kidExitPinHash } : {}),
  };
  const user = await prisma.user.upsert({ where: { email: u.email }, update: data, create: { email: u.email, ...data } });
  await prisma.wallet.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  return user;
}

async function grantDemoCredits(prisma, userId) {
  await prisma.$transaction(async (tx) => {
    const key = demoGrantKey(userId);
    if (await tx.walletLedger.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) return;
    const [row] = await tx.$queryRaw`SELECT credit_balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
    const balanceAfter = Number(row.credit_balance) + DEMO_CREDITS;
    await tx.wallet.update({ where: { userId }, data: { creditBalance: balanceAfter } });
    // Giu bat bien wallets.credit_balance = tong amount cua ledger `credit` (creditLedger.js).
    await tx.walletLedger.create({
      data: {
        userId, walletType: 'credit', entryType: 'credit_grant',
        amount: BigInt(DEMO_CREDITS), balanceAfter: BigInt(balanceAfter), idempotencyKey: key,
      },
    });
  });
}

async function ensureChildAndCharacters(prisma, parentId) {
  let child = await prisma.childProfile.findFirst({ where: { parentId, name: DEMO_CHILD.name, deletedAt: null } });
  if (!child) {
    child = await prisma.childProfile.create({
      data: { parentId, name: DEMO_CHILD.name, birthDate: new Date(DEMO_CHILD.birthDate) },
    });
  }
  const own = await prisma.character.findFirst({ where: { childId: child.id } });
  if (!own) {
    await prisma.character.create({
      data: { parentId, childId: child.id, name: DEMO_CHILD.name, appearance: DEMO_CHILD.appearance },
    });
  }
  for (const c of DEMO_CHARACTERS) {
    const exists = await prisma.character.findFirst({ where: { parentId, name: c.name, deletedAt: null } });
    if (!exists) await prisma.character.create({ data: { parentId, name: c.name, appearance: c.appearance } });
  }
}

export async function seedDemo(prisma) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const kidExitPinHash = await bcrypt.hash(DEMO_KID_PIN, 10);
  for (const u of DEMO_USERS) {
    const user = await upsertUser(prisma, u, passwordHash, kidExitPinHash);
    if (u.role === 'parent') {
      await grantDemoCredits(prisma, user.id);
      await ensureChildAndCharacters(prisma, user.id);
    }
    console.log(`✓ ${u.role.padEnd(9)} ${u.email}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ seed_demo khong chay khi NODE_ENV=production');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  seedDemo(prisma)
    .catch((e) => {
      console.error('❌ Error while seeding demo data:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
