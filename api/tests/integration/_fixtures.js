// Du lieu mau cho integration test. Import SAU `./_db.js`.
//
// KHONG DON DU LIEU sau khi chay: `wallet_ledger` append-only (trigger chan UPDATE/DELETE) va
// `users` bi FK Restrict tu nhieu bang, nen xoa sach khong kha thi. DB test vi vay tich luy du lieu
// qua moi lan chay -> dung mot project Supabase RIENG cho test, khong dung DB chung cua nhom.
// Moi lan tao phu huynh dung email/username ngau nhien nen cac lan chay khong dung nhau.

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env, prisma } from '../../src/config/index.js';

export { prisma };

const rand = () => crypto.randomBytes(5).toString('hex');

/** Tao user (mac dinh phu huynh). Tra ve { user, token }. */
export async function createUser({ role = 'parent' } = {}) {
  const tag = rand();
  const user = await prisma.user.create({
    data: {
      role,
      username: `it_${role}_${tag}`,
      email: `it_${role}_${tag}@test.storyweaver.local`,
      passwordHash: 'integration-test-not-a-real-hash',
      fullName: `Integration ${role} ${tag}`,
      emailVerifiedAt: new Date(),
    },
  });
  return { user, token: tokenFor(user) };
}

export const createParent = () => createUser({ role: 'parent' });

export function tokenFor(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, { expiresIn: '1h' });
}

/** Vi voi so du tuy chon (ghi thang vao wallets, khong qua ledger). */
export function createWallet(userId, creditBalance = 0) {
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId, creditBalance },
    update: { creditBalance },
  });
}

export function createChild(parentId, name) {
  return prisma.childProfile.create({ data: { parentId, name } });
}

/** Nhan vat; truyen `childId` de gan voi mot con. */
export function createCharacter(parentId, name, { childId = null, appearance = 'bé 6 tuổi, tóc ngắn' } = {}) {
  return prisma.character.create({ data: { parentId, name, childId, appearance } });
}

/** Lay mot topic dang hoat dong da seed (prisma/seed_topics.js). */
export async function getSeededTopic() {
  const topic = await prisma.topic.findFirst({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } });
  if (!topic) throw new Error('DB test chưa có topic đang hoạt động — chạy `npm run db:seed` trên DB test.');
  return topic;
}

/**
 * Chay app tren cong ngau nhien. Tra ve { request(method, path, { token, body }), close() }.
 * `request` tra ve { status, body } (body da parse JSON neu co).
 */
export async function startServer() {
  const { default: app } = await import('../../src/app.js');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  const request = async (method, path, { token, body } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  const close = () => new Promise((resolve) => server.close(() => resolve()));
  return { request, close };
}
