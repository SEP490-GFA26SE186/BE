// Ho so be (child_profiles) + nhan vat dai dien cua be (characters, child_id unique) — schema rev8.
// Rev8 bo bedtime; bao cao EQ theo muc do ky nang con tinh truc tiep tu checkpoint_answers (spec su pham
// CASEL §7); usage_date / duration_seconds la cot DB tu sinh. Hinh dang tra ve: lib/childFormat.js, lib/eq*.js.
import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';
import bookshelfService from '../bookshelf/bookshelf.service.js';
import { ageOf, formatChild, summarizeReading, vnDate } from './lib/childFormat.js';
import { buildEqLevels } from './lib/eqLevels.js';
import { buildConversation, buildEvidence, buildTrend } from './lib/eqJourney.js';
import { recommendTopics } from './lib/recommend.js';
import { loadReportSettings } from '../pedagogy-settings/pedagogy-settings.service.js';

// Supabase o xa: moi truy van vai tram ms, mac dinh 5 s cua Prisma khong du cho 4-5 truy van
// (giong TX_OPTIONS cua module stories).
const TX_OPTIONS = { timeout: 20000 };

// Khong co goi dang hoat dong -> han muc cua goi Mien phi (plans.max_children).
const DEFAULT_FREE_MAX_CHILDREN = 2;

const CHILD_INCLUDE = {
  character: true,
  _count: {
    select: {
      bookshelfItems: true,
      playSessions: { where: { status: 'completed' } },
    },
  },
};

const findOwnChild = async (db, parentId, childId) => {
  const child = await db.childProfile.findFirst({ where: { id: childId, parentId, deletedAt: null } });
  if (!child) throw ApiError.notFound('Child profile not found');
  return child;
};

const loadFormatted = async (db, childId) =>
  formatChild(await db.childProfile.findUnique({ where: { id: childId }, include: CHILD_INCLUDE }));

const getMaxChildrenQuota = async (parentId) => {
  const active = await prisma.subscription.findFirst({
    where: { parentId, status: 'active', periodEnd: { gt: new Date() } },
    include: { plan: { select: { maxChildren: true } } },
  });
  return active?.plan?.maxChildren ?? DEFAULT_FREE_MAX_CHILDREN;
};

/**
 * Dat nhan vat dai dien cua be theo `appearance`:
 * - undefined: khong dong toi (chi dong bo ten neu co nhan vat);
 * - chuoi rong / null: go nhan vat khoi be (xoa mem + bo child_id de sau nay tao lai duoc, vi child_id unique);
 * - chuoi: tao moi neu chua co, nguoc lai cap nhat mo ta.
 */
async function applyCharacter(tx, { parentId, childId, name, appearance, portraitImageKey }) {
  const current = await tx.character.findFirst({ where: { childId, deletedAt: null } });
  const text = typeof appearance === 'string' ? appearance.trim() : appearance;

  if (appearance !== undefined && !text) {
    if (current) {
      await tx.character.update({ where: { id: current.id }, data: { deletedAt: new Date(), childId: null } });
    }
    return;
  }
  const portrait =
    portraitImageKey === undefined
      ? {}
      : { portraitImageKey: portraitImageKey || null, portraitStatus: portraitImageKey ? 'ready' : 'none' };

  if (current) {
    await tx.character.update({
      where: { id: current.id },
      data: { ...(name && { name }), ...(text && { appearance: text }), ...portrait },
    });
  } else if (text) {
    await tx.character.create({ data: { parentId, childId, name, appearance: text, ...portrait } });
  }
}

const createChild = async (parentId, data) => {
  const maxAllowed = await getMaxChildrenQuota(parentId);
  const currentCount = await prisma.childProfile.count({ where: { parentId, deletedAt: null } });
  if (currentCount >= maxAllowed) {
    throw ApiError.forbidden(
      `You have reached the maximum limit of ${maxAllowed} child profiles for your current plan. Please upgrade to add more children.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const name = data.name.trim();
    const child = await tx.childProfile.create({
      data: {
        parentId,
        name,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        preferredVoice: data.preferredVoice?.trim() || null,
      },
    });
    if (data.appearance?.trim()) {
      await applyCharacter(tx, {
        parentId, childId: child.id, name, appearance: data.appearance, portraitImageKey: data.portraitImageKey,
      });
    }
    return loadFormatted(tx, child.id);
  }, TX_OPTIONS);
};

const getChildren = async (parentId) => {
  const children = await prisma.childProfile.findMany({
    where: { parentId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: CHILD_INCLUDE,
  });
  return children.map((c) => formatChild(c));
};

const getChildById = async (parentId, childId) => {
  await findOwnChild(prisma, parentId, childId);
  return loadFormatted(prisma, childId);
};

const updateChild = async (parentId, childId, data) => {
  await findOwnChild(prisma, parentId, childId);

  const payload = {};
  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.birthDate !== undefined) payload.birthDate = data.birthDate ? new Date(data.birthDate) : null;
  if (data.preferredVoice !== undefined) payload.preferredVoice = data.preferredVoice?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const child = await tx.childProfile.update({ where: { id: childId }, data: payload });
    if (data.name !== undefined || data.appearance !== undefined || data.portraitImageKey !== undefined) {
      await applyCharacter(tx, {
        parentId, childId, name: child.name, appearance: data.appearance, portraitImageKey: data.portraitImageKey,
      });
    }
    return loadFormatted(tx, childId);
  }, TX_OPTIONS);
};

const deleteChild = async (parentId, childId) => {
  await findOwnChild(prisma, parentId, childId);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.childProfile.update({ where: { id: childId }, data: { deletedAt: now } });
    await tx.character.updateMany({ where: { childId, deletedAt: null }, data: { deletedAt: now } });
    // Huy moi phien Kid Mode con mo cua be.
    await tx.authToken.updateMany({
      where: { childId, type: 'kid_session', consumedAt: null },
      data: { consumedAt: now },
    });
  }, TX_OPTIONS);
  return { message: 'Xóa hồ sơ bé thành công' };
};

/** PUT /children/:id/avatar — giu cho tuong thich; cung luat voi `appearance` cua updateChild. */
const updateChildAvatar = async (parentId, childId, { appearance, portraitImageKey }) => {
  const child = await findOwnChild(prisma, parentId, childId);
  return prisma.$transaction(async (tx) => {
    await applyCharacter(tx, { parentId, childId, name: child.name, appearance, portraitImageKey });
    return (await loadFormatted(tx, childId)).character;
  }, TX_OPTIONS);
};

/** Thoi gian doc trong ngay (gio VN), tinh tu cac luot doc that cua be. */
const getChildUsage = async (parentId, childId, dateStr) => {
  const child = await findOwnChild(prisma, parentId, childId);
  const date = dateStr || vnDate();
  const from = new Date(`${date}T00:00:00+07:00`);
  const sessions = await prisma.playSession.findMany({
    where: { childId, startedAt: { gte: from, lt: new Date(from.getTime() + 86_400_000) } },
    select: { startedAt: true, lastActivityAt: true, completedAt: true, status: true },
  });
  return summarizeReading(child, sessions, date);
};

// ---------------------------------------------------------------------------
// Bao cao EQ theo muc do (spec su pham CASEL §7, §9b)
// ---------------------------------------------------------------------------

/** Gioi han an toan: so cau tra loi doc cho mot be (muc chi can `window` cau moi nhat moi ky nang con). */
const MAX_ANSWERS = 2000;
/** So truyen gan nhat: loai topic khoi goi y + lay goi y tro chuyen. */
const RECENT_STORIES = 3;

/**
 * Cau tra loi tinh muc: luot doc dau, co diem, checkpoint khong bi Specialist gan co, co ky nang con
 * (cau cu khong co sub_skill_id khong vao bao cao moi) — moi -> cu.
 */
const scoredAnswers = (childId, select) =>
  prisma.checkpointAnswer.findMany({
    where: {
      session: { childId, isFirstPlay: true },
      score: { not: null },
      subSkillId: { not: null },
      checkpoint: { excluded: false },
    },
    orderBy: [{ answeredAt: 'desc' }, { id: 'desc' }],
    take: MAX_ANSWERS,
    select,
  });

const LEVEL_SELECT = { subSkillId: true, score: true, answeredAt: true };
const STORY_NAMES = { select: { token: true, aliasName: true, character: { select: { name: true } } } };
const EVIDENCE_SELECT = {
  ...LEVEL_SELECT,
  attempts: true,
  firstEmotion: true,
  firstOption: { select: { text: true, role: true, isCorrect: true } },
  checkpoint: {
    select: {
      type: true, question: true, answerEmotion: true,
      story: { select: { title: true, entry: true, momentSummary: true, storyCharacters: STORY_NAMES } },
    },
  },
};

/** Luot doc gan nhat (moi -> cu), moi truyen mot lan. */
async function recentSessions(childId, { firstPlayOnly = false } = {}) {
  const sessions = await prisma.playSession.findMany({
    where: { childId, ...(firstPlayOnly && { isFirstPlay: true }) },
    orderBy: { lastActivityAt: 'desc' },
    take: 30,
    select: { id: true, storyId: true, story: { select: { topicId: true } } },
  });
  const seen = new Set();
  return sessions.filter((s) => !seen.has(s.storyId) && seen.add(s.storyId)).slice(0, RECENT_STORIES);
}

/** Muc nang luc / ky nang con + topic goi y cho mot be tu cac cau tra loi da loc. */
async function computeReport(child, rows) {
  const subIds = [...new Set(rows.map((r) => r.subSkillId))];
  const [settings, skills, subSkills, topics, recent] = await Promise.all([
    loadReportSettings(),
    prisma.eqSkill.findMany({ orderBy: { displayOrder: 'asc' } }),
    // Ky nang con dang bat + ky nang con da tat nhung be da co cau tra loi.
    prisma.eqSubSkill.findMany({
      where: { OR: [{ isActive: true }, { id: { in: subIds } }] },
      select: { id: true, skillId: true, nameVi: true, displayOrder: true, caselTextEn: true },
    }),
    prisma.topic.findMany({
      where: { isActive: true },
      select: {
        id: true, title: true, isActive: true, ageMin: true, ageMax: true, displayOrder: true,
        skill: { select: { caselCode: true, nameVi: true } },
        subSkills: { select: { subSkill: { select: { id: true, nameVi: true } } } },
      },
    }),
    recentSessions(child.id),
  ]);
  const levels = buildEqLevels(rows, skills, subSkills, settings);
  const recommendations = recommendTopics({
    levels,
    topics: topics.map((t) => ({ ...t, subSkills: t.subSkills.map((l) => l.subSkill) })),
    childAge: ageOf(child.birthDate),
    recentTopicIds: recent.map((s) => s.story.topicId).filter(Boolean),
  });
  return {
    report: { childId: child.id, childName: child.name, settings, competencies: levels.competencies, recommendations },
    skills,
    subSkills,
    settings,
  };
}

/**
 * GET /children/:id/eq-report — muc do 5 nang luc (thap nhat cua cac ky nang con co muc) + ky nang con
 * + 1-3 topic goi y. Khong tra %: chi muc + so cau. Tham so (window / nguong) do Specialist dat.
 */
const getChildEqReport = async (parentId, childId) => {
  const child = await findOwnChild(prisma, parentId, childId);
  const rows = (await scoredAnswers(child.id, LEVEL_SELECT)).map((r) => ({ ...r, score: Number(r.score) }));
  return (await computeReport(child, rows)).report;
};

/** Goi y tro chuyen: 3 truyen be doc gan nhat (luot dau, moi trang thai). */
async function loadConversation(childId) {
  const sessions = await recentSessions(childId, { firstPlayOnly: true });
  if (!sessions.length) return [];
  const [stories, reflections] = await Promise.all([
    prisma.story.findMany({
      where: { id: { in: sessions.map((s) => s.storyId) } },
      select: {
        id: true, title: true, length: true,
        storyCharacters: STORY_NAMES,
        checkpoints: {
          where: { excluded: false },
          select: {
            type: true, question: true, subSkillId: true,
            afterPage: { select: { pageOrder: true } },
            templateVersion: { select: { parentPrompts: true } },
          },
        },
      },
    }),
    prisma.checkpointAnswer.findMany({
      where: { sessionId: { in: sessions.map((s) => s.id) }, skipped: false, checkpoint: { type: 'reflection' } },
      select: { session: { select: { storyId: true } } },
    }),
  ]);
  const answered = new Set(reflections.map((r) => r.session.storyId));
  const byId = new Map(stories.map((s) => [s.id, s]));
  return buildConversation(
    sessions
      .map((s) => byId.get(s.storyId))
      .filter(Boolean)
      .map((s) => ({
        ...s,
        answeredReflection: answered.has(s.id),
        checkpoints: s.checkpoints.map((c) => ({ ...c, pageOrder: c.afterPage?.pageOrder ?? 0 })),
      })),
  );
}

/**
 * GET /children/:id/eq-journey — bao cao EQ + bang chung (toi da 5 cau / ky nang con) + goi y tro chuyen
 * + xu huong theo tuan (so cau cham, muc cuoi tuan). Ten that chi hien cho phu huynh cua be.
 */
const getChildEqJourney = async (parentId, childId, { weeks = 8 } = {}) => {
  const child = await findOwnChild(prisma, parentId, childId);
  const answers = (await scoredAnswers(child.id, EVIDENCE_SELECT)).map((a) => ({ ...a, score: Number(a.score) }));
  const [{ report, skills, subSkills, settings }, conversation] = await Promise.all([
    computeReport(child, answers),
    loadConversation(child.id),
  ]);
  return {
    ...report,
    evidence: buildEvidence(answers),
    conversation,
    trend: buildTrend(answers, skills, subSkills, settings, { weeks }),
  };
};

const getChildOverview = async (parentId, childId) => {
  const profile = await getChildById(parentId, childId);
  const [todayUsage, eqReport, lastSession] = await Promise.all([
    getChildUsage(parentId, childId),
    getChildEqReport(parentId, childId),
    prisma.playSession.findFirst({
      where: { childId },
      orderBy: { lastActivityAt: 'desc' },
      select: { lastActivityAt: true, story: { select: { id: true, title: true } } },
    }),
  ]);
  return {
    profile,
    todayUsage,
    readingStats: {
      booksInBookshelf: profile.booksCount,
      completedStories: profile.completedSessionsCount,
      lastReadStory: lastSession?.story ?? null,
      lastReadAt: lastSession?.lastActivityAt ?? null,
    },
    eqReport,
  };
};

const getChildBookshelf = async (user, childId, query) => bookshelfService.getBookshelf(user, { ...query, childId });

export default {
  createChild,
  getChildren,
  getChildById,
  updateChild,
  deleteChild,
  updateChildAvatar,
  getChildUsage,
  getChildEqReport,
  getChildEqJourney,
  getChildOverview,
  getChildBookshelf,
};
