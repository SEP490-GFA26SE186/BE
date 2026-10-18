// Ho so be (child_profiles) + nhan vat dai dien cua be (characters, child_id unique) — schema rev8.
// Rev8 bo bedtime; diem EQ lay tu eq_competency_stats (cong don toan bo lich su, docs/01);
// usage_date / duration_seconds la cot DB tu sinh. Hinh dang tra ve: lib/childFormat.js.
import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';
import bookshelfService from '../bookshelf/bookshelf.service.js';
import { EQ_MIN_ITEMS, eqSkillsFromStats, formatChild, summarizeReading, vnDate } from './lib/childFormat.js';
import { buildEqJourney, strengths } from './lib/eqJourney.js';
import { detokenize } from '../stories/lib/narration.js';

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

/**
 * Bao cao EQ chi tiet (trang "Bao cao EQ"): diem cong don 5 nang luc + xu huong theo tuan + theo loai cau hoi
 * + cau tra loi gan day. Chi luot doc dau (luot doc lai khong tinh diem — giong eq_competency_stats).
 */
const getChildEqJourney = async (parentId, childId, { weeks = 8 } = {}) => {
  const { childName, skills } = await getChildEqReport(parentId, childId);
  const [answers, sessions] = await Promise.all([
    prisma.checkpointAnswer.findMany({
      where: { session: { childId, isFirstPlay: true } },
      orderBy: { answeredAt: 'desc' },
      take: 1000,
      select: {
        answeredAt: true, score: true, skipped: true, attempts: true, firstEmotion: true,
        skill: { select: { caselCode: true } },
        checkpoint: {
          select: {
            type: true, question: true, answerEmotion: true,
            story: { select: { title: true, storyCharacters: { select: { token: true, aliasName: true, character: { select: { name: true } } } } } },
          },
        },
      },
    }),
    prisma.playSession.groupBy({ by: ['status'], where: { childId }, _count: { _all: true } }),
  ]);
  const rows = answers.map((a) => ({
    answeredAt: a.answeredAt, score: a.score == null ? null : Number(a.score), skipped: a.skipped, attempts: a.attempts,
    caselCode: a.skill?.caselCode ?? null, type: a.checkpoint.type,
    answerEmotion: a.checkpoint.answerEmotion ?? null, firstEmotion: a.firstEmotion ?? null,
  }));
  const { trend, byType, emotions } = buildEqJourney(rows, { weeks });
  const count = (status) => sessions.find((s) => s.status === status)?._count._all ?? 0;
  return {
    childId,
    childName,
    minItems: EQ_MIN_ITEMS,
    skills,
    ...strengths(skills),
    totals: { answers: rows.filter((r) => !r.skipped).length, sessions: sessions.reduce((n, s) => n + s._count._all, 0), completed: count('completed') },
    trend,
    byType,
    emotions,
    recent: answers.slice(0, 10).map((a) => ({
      answeredAt: a.answeredAt,
      storyTitle: a.checkpoint.story.title,
      type: a.checkpoint.type,
      question: detokenize(a.checkpoint.question, a.checkpoint.story.storyCharacters),
      caselCode: a.skill?.caselCode ?? null,
      score: a.score == null ? null : Math.round(Number(a.score) * 100),
      attempts: a.attempts,
      skipped: a.skipped,
    })),
  };
};

const getChildEqReport = async (parentId, childId) => {
  const child = await findOwnChild(prisma, parentId, childId);
  const [skills, stats] = await Promise.all([
    prisma.eqSkill.findMany({ orderBy: { displayOrder: 'asc' } }),
    prisma.eqCompetencyStat.findMany({ where: { childId } }),
  ]);
  return { childId: child.id, childName: child.name, skills: eqSkillsFromStats(skills, stats) };
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
