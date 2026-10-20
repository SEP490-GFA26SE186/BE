// =============================================================================
// Du lieu DEMO cho moi truong dev / buoi demo — KHONG chay tren production.
//   npm run db:seed:demo        (chay sau `npm run db:seed`)
//
// Khop Web/docs/DEMO_ACCOUNTS.md: 3 tai khoan, mat khau chung 123456, PIN Kid Mode 1234.
// Chay lai nhieu lan van ra cung ket qua: user upsert theo email (dat lai mat khau / PIN de
// demo luon dang nhap duoc), credit chi cap mot lan (idempotency_key co dinh), be + nhan vat
// chi tao neu chua co.
// Truyen demo cua be Bin (tieu de bat dau bang "[Demo] "): tao neu chua co tieu de do, nen chay lai
// khong nhan doi. 3 truyen AI dung mau cau hoi da ban hanh + lich su tra loi luot dau (bao cao EQ
// co 2 nang luc co muc, 3 nang luc chua co du lieu) + 1 truyen tu viet. Khong goi service `ai`.
// =============================================================================

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ensureFreeSubscription } from '../src/modules/billing/billing.store.js';
import { checkpointTypeFor, scoreFor } from '../src/modules/question-templates/lib/templateRules.js';
import { DEMO_STORIES, DEMO_CUSTOM_STORY, DEMO_TITLE_PREFIX } from './data/demo_stories.js';

export const DEMO_PASSWORD = '123456';
export const DEMO_KID_PIN = '1234';
export const DEMO_CREDITS = 50;

export const DEMO_USERS = [
  { role: 'parent', email: 'me.lanhuong@storyweaver.vn', username: 'me_lanhuong', fullName: 'Mẹ Lan Hương', phone: '0901234567' },
  { role: 'specialist', email: 'kdv@storyweaver.vn', username: 'kdv_demo', fullName: 'Chuyên gia sư phạm', phone: '0907654321' },
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
  }, { timeout: 20000 }); // Supabase o xa: mac dinh 5 s cua Prisma khong du
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

// ---------------------------------------------------------------------------
// Truyen demo cua be Bin
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const STORY_TX = { timeout: 60000 };

/** Phien ban published moi nhat cua mau (theo ky nang con + dang tra loi + tieu de). null = chua ban hanh. */
async function findPublishedVersion(prisma, { subCode, format, templateTitle }) {
  return prisma.questionTemplateVersion.findFirst({
    where: {
      status: 'published',
      template: { title: templateTitle, answerFormat: format, isActive: true, subSkill: { code: subCode } },
    },
    orderBy: { version: 'desc' },
    include: { template: { select: { answerFormat: true, subSkillId: true, subSkill: { select: { skillId: true } } } } },
  });
}

/** Lua chon cua be -> cot cau tra loi + diem (chi lan chon dau duoc cham). */
function buildAnswer(spec, cp, version, options) {
  const base = { skillId: version.template.subSkill.skillId, subSkillId: version.template.subSkillId, templateVersionId: version.id };
  if (cp.type === 'emotion_self') {
    const correct = spec.pick === cp.answerEmotion;
    const final = correct || spec.retry ? cp.answerEmotion : spec.pick;
    return { ...base, firstEmotion: spec.pick, finalEmotion: final, attempts: correct || !spec.retry ? 1 : 2, score: scoreFor(version, { correct }) };
  }
  if (cp.type === 'perspective') {
    const first = options[spec.pick];
    const right = options.find((o) => o.isCorrect);
    const correct = first.isCorrect === true;
    const final = correct || !spec.retry ? first : right;
    return { ...base, firstOptionId: first.id, finalOptionId: final.id, attempts: correct || !spec.retry ? 1 : 2, score: scoreFor(version, { correct }) };
  }
  const picked = options.find((o) => o.role === spec.pick);
  return { ...base, firstOptionId: picked.id, finalOptionId: picked.id, attempts: 1, score: scoreFor(version, { role: spec.pick }) };
}

/** Truyen + nhan vat + canh + trang + ke gian sach (chung cho truyen AI va truyen tu viet). */
async function createStoryBody(tx, { storyData, spec, ownerId, child, own, second, backgroundId, createdAt }) {
  const story = await tx.story.create({
    data: { ...storyData, ownerId, useAiImage: false, useTts: false, status: 'ready', createdAt, updatedAt: createdAt, reviewedAt: createdAt },
  });
  await tx.storyCharacter.create({ data: { storyId: story.id, token: 'NV1', characterId: own.id, isMain: true } });
  if (second) await tx.storyCharacter.create({ data: { storyId: story.id, token: 'NV2', ...second } });

  const scenes = [];
  for (const [i, description] of spec.scenes.entries()) {
    scenes.push(await tx.storyScene.create({ data: { storyId: story.id, sceneOrder: i + 1, description, backgroundId } }));
  }
  const origin = storyData.length === 'custom' ? 'human' : 'ai';
  const pages = [];
  for (const [i, p] of spec.pages.entries()) {
    pages.push(await tx.storyPage.create({
      data: {
        storyId: story.id, pageOrder: i + 1, sceneId: scenes[p.scene - 1].id, contentText: p.text,
        aiOriginalText: origin === 'ai' ? p.text : null, origin, createdAt, updatedAt: createdAt,
      },
    }));
  }
  await tx.bookshelfItem.create({ data: { childId: child.id, storyId: story.id, addedAt: createdAt } });
  return { story, pages };
}

/** Tao mot truyen AI + diem dung tu mau + luot doc dau. Tra ve ly do bo qua (chuoi) hoac null neu da tao. */
async function createAiStory(prisma, { spec, parent, child, own, bookCharacter, topic, backgroundId }) {
  const versions = [];
  for (const cp of spec.checkpoints) {
    const version = await findPublishedVersion(prisma, cp);
    if (!version) return `thieu mau da ban hanh "${cp.templateTitle}" (${cp.subCode})`;
    versions.push(version);
  }
  const startedAt = new Date(Date.now() - spec.session.daysAgo * DAY_MS);
  const createdAt = new Date(startedAt.getTime() - DAY_MS);

  await prisma.$transaction(async (tx) => {
    const { story, pages } = await createStoryBody(tx, {
      storyData: { kind: 'private', topicId: topic.id, length: spec.length, title: spec.title, situation: spec.situation },
      spec, ownerId: parent.id, child, own, backgroundId, createdAt,
      second: spec.second.aliasName ? { aliasName: spec.second.aliasName } : { characterId: bookCharacter.id },
    });

    const made = [];
    for (const [i, cp] of spec.checkpoints.entries()) {
      const version = versions[i];
      const type = checkpointTypeFor(cp.format, version.needsTarget);
      const row = await tx.storyCheckpoint.create({
        data: {
          storyId: story.id, afterPageId: pages[cp.after - 1].id, type,
          question: version.questionFrame, hint: cp.hint ?? null,
          answerEmotion: cp.answerEmotion ?? (type === 'emotion_self' || type === 'emotion_other' ? 'neutral' : null),
          origin: 'ai', subSkillId: version.template.subSkillId, templateVersionId: version.id, scored: true,
        },
      });
      const options = [];
      for (const [k, o] of (cp.options ?? []).entries()) {
        options.push(await tx.checkpointOption.create({
          data: {
            checkpointId: row.id, optionOrder: k + 1, text: o.text,
            role: o.role ?? null, isCorrect: type === 'perspective' ? o.isCorrect : null, feedback: o.feedback ?? null,
          },
        }));
      }
      made.push({ cp: { ...cp, type }, row, options, version });
    }
    // Cau phan chieu cuoi truyen: khong cham diem, khong ky nang con.
    await tx.storyCheckpoint.create({
      data: {
        storyId: story.id, afterPageId: pages[spec.reflection.after - 1].id, type: 'reflection',
        question: spec.reflection.question, origin: 'ai', scored: false,
      },
    });

    // Luot doc dau da hoan thanh, tung cau cach nhau vai phut.
    const endedAt = new Date(startedAt.getTime() + 12 * 60000);
    const session = await tx.playSession.create({
      data: { childId: child.id, storyId: story.id, isFirstPlay: true, status: 'completed', startedAt, lastActivityAt: endedAt, completedAt: endedAt },
    });
    for (const [i, m] of made.entries()) {
      await tx.checkpointAnswer.create({
        data: {
          sessionId: session.id, checkpointId: m.row.id, skipped: false,
          timeToFirstMs: 4000 + i * 1500, questionReplays: i === 1 ? 1 : 0,
          answeredAt: new Date(startedAt.getTime() + (i + 1) * 3 * 60000),
          ...buildAnswer(spec.session.answers[i], m.cp, m.version, m.options),
        },
      });
    }
  }, STORY_TX);
  return null;
}

async function createCustomStory(prisma, { parent, child, own, backgroundId }) {
  const createdAt = new Date(Date.now() - 7 * DAY_MS);
  await prisma.$transaction(async (tx) => {
    await createStoryBody(tx, {
      storyData: { kind: 'private', topicId: null, length: 'custom', title: DEMO_CUSTOM_STORY.title, situation: DEMO_CUSTOM_STORY.situation },
      spec: DEMO_CUSTOM_STORY, ownerId: parent.id, child, own, second: null, backgroundId, createdAt,
    });
  }, STORY_TX);
}

/** Truyen demo cua Bin: chi tao truyen chua co (theo tieu de), nen chay lai khong nhan doi. */
export async function ensureDemoStories(prisma, parent) {
  const child = await prisma.childProfile.findFirst({ where: { parentId: parent.id, name: DEMO_CHILD.name, deletedAt: null } });
  const own = child && (await prisma.character.findFirst({ where: { childId: child.id } }));
  const bookCharacter = await prisma.character.findFirst({ where: { parentId: parent.id, name: DEMO_CHARACTERS[0].name, deletedAt: null } });
  if (!child || !own || !bookCharacter) return;

  const existing = new Set(
    (await prisma.story.findMany({
      where: { ownerId: parent.id, title: { startsWith: DEMO_TITLE_PREFIX }, deletedAt: null }, select: { title: true },
    })).map((s) => s.title),
  );
  const background = await prisma.background.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  const backgroundId = background?.id ?? null;

  for (const spec of DEMO_STORIES) {
    if (existing.has(spec.title)) continue;
    const topic = await prisma.topic.findFirst({ where: { title: spec.topicTitle, isActive: true } });
    const skipped = topic
      ? await createAiStory(prisma, { spec, parent, child, own, bookCharacter, topic, backgroundId })
      : `khong co topic "${spec.topicTitle}"`;
    console.log(skipped ? `  ! Bo qua "${spec.title}": ${skipped}` : `  + ${spec.title}`);
  }
  if (!existing.has(DEMO_CUSTOM_STORY.title)) {
    await createCustomStory(prisma, { parent, child, own, backgroundId });
    console.log(`  + ${DEMO_CUSTOM_STORY.title}`);
  }
}

export async function seedDemo(prisma) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const kidExitPinHash = await bcrypt.hash(DEMO_KID_PIN, 10);
  for (const u of DEMO_USERS) {
    const user = await upsertUser(prisma, u, passwordHash, kidExitPinHash);
    if (u.role === 'parent') {
      await grantDemoCredits(prisma, user.id);
      // Goi Mien phi (rev8: moi phu huynh co mot dong subscriptions). Can seed plans truoc (db:seed).
      await prisma.$transaction((tx) => ensureFreeSubscription(tx, user.id), { timeout: 20000 });
      await ensureChildAndCharacters(prisma, user.id);
      await ensureDemoStories(prisma, user);
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
