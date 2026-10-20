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
 * Topic moi (cung nang luc voi topic seed) co khung o cham co dinh: 3 ky nang con, moi cai dung mot
 * mau mot ban published -> o cham lan luot emotion_self, perspective (can target), problem_solving
 * (truyen `medium` giong layout cu). Cho test can biet truoc kieu diem dung. displayOrder lon de
 * getSeededTopic khong chon; goi `retireTopic` trong `after` de no khong o lai trong danh sach.
 */
export async function createFixedSlotTopic() {
  const seeded = await getSeededTopic();
  const link = await prisma.topicSubSkill.findFirst({
    where: { topicId: seeded.id },
    select: { subSkill: { select: { skillId: true, caselReferenceId: true } } },
  });
  const { skillId, caselReferenceId } = link.subSkill;
  const { user } = await createUser({ role: 'specialist' });
  const tag = rand();
  const topic = await prisma.topic.create({
    data: { title: `IT khung cố định ${tag}`, skillId, guidance: 'x', displayOrder: 1_000_000, createdBy: user.id },
  });
  const formats = [
    ['emotion_pick', false],
    ['single_correct', true],
    ['role_choice', false],
  ];
  for (const [i, [answerFormat, needsTarget]] of formats.entries()) {
    const sub = await prisma.eqSubSkill.create({
      data: {
        skillId, caselReferenceId, code: `it_fixed_${tag}_${i}`, nameVi: `Kỹ năng cố định ${tag} ${i}`,
        descriptionVi: 'x', displayOrder: i, createdBy: user.id,
      },
    });
    await prisma.topicSubSkill.create({ data: { topicId: topic.id, subSkillId: sub.id } });
    const tpl = await prisma.questionTemplate.create({
      data: { subSkillId: sub.id, title: `Mẫu ${answerFormat}`, answerFormat, createdBy: user.id },
    });
    await prisma.questionTemplateVersion.create({
      data: {
        templateId: tpl.id, version: 1, status: 'published', questionFrame: 'Khung câu hỏi', needsTarget,
        constructiveScore: answerFormat === 'role_choice' ? 1 : null,
        avoidantScore: answerFormat === 'role_choice' ? 0.3 : null,
        impulsiveScore: answerFormat === 'role_choice' ? 0 : null,
        createdBy: user.id,
      },
    });
  }
  return topic;
}

export const retireTopic = (topic) =>
  topic ? prisma.topic.update({ where: { id: topic.id }, data: { isActive: false } }) : undefined;

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

  const close = async () => {
    await new Promise((resolve) => server.close(() => resolve()));
    // POST /review day job giong doc -> mo ket noi Redis dung chung; ioredis tu ket noi lai mai mai
    // nen khong dong thi tien trinh test khong thoat.
    const { default: connection } = await import('../../src/queues/connection.js');
    connection.disconnect();
  };
  return { request, close };
}
