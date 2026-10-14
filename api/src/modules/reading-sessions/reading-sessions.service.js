import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import eqService from '../reports/eq.service.js';

const EMOTION_TYPES = ['emotion_self', 'emotion_other'];
const OPTION_TYPES = ['perspective', 'problem_solving'];

const SKILL_SELECT = { id: true, caselCode: true, nameVi: true, nameEn: true };

/**
 * Verify child access permission for current user
 * @param {Object} user - Authenticated user
 * @param {string} childId - Child profile ID
 * @returns {Promise<Object>} Child profile
 */
const verifyChildAccess = async (user, childId) => {
  if (!childId) {
    throw ApiError.badRequest('Child ID is required');
  }

  const isElevated = ['admin', 'moderator'].includes(user.role);

  const child = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      ...(isElevated ? {} : { parentId: user.id }),
      deletedAt: null,
    },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found or access denied');
  }

  return child;
};

// =============================================================================
// STORY CONTENT
// =============================================================================

const STORY_CONTENT_INCLUDE = {
  topic: {
    select: { id: true, title: true, skillId: true, skill: { select: SKILL_SELECT } },
  },
  storyCharacters: {
    include: { character: { select: { name: true } } },
  },
  pages: {
    orderBy: { pageOrder: 'asc' },
    include: {
      scene: { include: { background: { select: { id: true, imageKey: true } } } },
      checkpoint: {
        include: { options: { orderBy: { optionOrder: 'asc' } } },
      },
    },
  },
};

/**
 * Token {NVx} -> ten hien thi (nhan vat gia dinh hoac ten chung cua truyen published)
 * @param {Array} storyCharacters
 * @returns {Object}
 */
const buildTokenNames = (storyCharacters = []) =>
  Object.fromEntries(storyCharacters.map((sc) => [sc.token, sc.character?.name || sc.aliasName || sc.token]));

const renderText = (text, names) => {
  if (!text) return text;
  return Object.entries(names).reduce((out, [token, name]) => out.split(token).join(name), text);
};

const formatCheckpoint = (checkpoint, names) => {
  if (!checkpoint) return null;
  return {
    id: checkpoint.id,
    type: checkpoint.type,
    targetToken: checkpoint.targetToken,
    targetName: checkpoint.targetToken ? names[checkpoint.targetToken] || null : null,
    question: renderText(checkpoint.question, names),
    questionAudioKey: checkpoint.questionAudioKey,
    hint: renderText(checkpoint.hint, names),
    hintAudioKey: checkpoint.hintAudioKey,
    // Frontend can de quyet dinh co doc goi y hay khong; diem van cham o server
    answerEmotion: checkpoint.answerEmotion,
    options: checkpoint.options.map((o) => ({
      id: o.id,
      optionOrder: o.optionOrder,
      text: renderText(o.text, names),
      textAudioKey: o.textAudioKey,
      isCorrect: o.isCorrect,
      feedback: renderText(o.feedback, names),
      feedbackAudioKey: o.feedbackAudioKey,
    })),
  };
};

const formatStoryContent = (story) => {
  const names = buildTokenNames(story.storyCharacters);
  return {
    id: story.id,
    title: renderText(story.title, names),
    length: story.length,
    useTts: story.useTts,
    useAiImage: story.useAiImage,
    topic: story.topic ? { id: story.topic.id, title: story.topic.title, skill: story.topic.skill } : null,
    totalPages: story.pages.length,
    pages: story.pages.map((p) => ({
      id: p.id,
      pageOrder: p.pageOrder,
      contentText: renderText(p.contentText, names),
      audioKey: p.audioKey,
      scene: {
        id: p.scene.id,
        sceneOrder: p.scene.sceneOrder,
        imageKey: p.scene.imageKey,
        background: p.scene.background,
      },
      checkpoint: formatCheckpoint(p.checkpoint, names),
    })),
  };
};

// =============================================================================
// SESSION FORMATTING
// =============================================================================

const formatAnswer = (a) => ({
  id: a.id.toString(),
  checkpointId: a.checkpointId,
  firstEmotion: a.firstEmotion,
  firstOptionId: a.firstOptionId,
  finalEmotion: a.finalEmotion,
  finalOptionId: a.finalOptionId,
  attempts: a.attempts,
  skipped: a.skipped,
  timeToFirstMs: a.timeToFirstMs,
  questionReplays: a.questionReplays,
  skill: a.skill || null,
  score: a.score === null ? null : Number(a.score),
  answeredAt: a.answeredAt,
});

/**
 * Tom tat diem cua rieng lan choi nay, theo nang luc
 * @param {Array} answers - checkpoint_answers kem skill
 * @returns {Array}
 */
const summarizeAnswers = (answers) => {
  const bySkill = {};
  for (const a of answers) {
    if (a.skipped || a.score === null || !a.skill) continue;
    const entry = (bySkill[a.skill.id] ||= { skill: a.skill, items: 0, scoreSum: 0 });
    entry.items += 1;
    entry.scoreSum += Number(a.score);
  }
  return Object.values(bySkill).map((e) => ({
    skill: e.skill,
    items: e.items,
    score: Math.round((e.scoreSum / e.items) * 100),
  }));
};

const formatSession = (session) => ({
  id: session.id,
  childId: session.childId,
  storyId: session.storyId,
  status: session.status,
  isFirstPlay: session.isFirstPlay,
  currentPageId: session.currentPageId,
  startedAt: session.startedAt,
  lastActivityAt: session.lastActivityAt,
  completedAt: session.completedAt,
});

/**
 * Load session + kiem tra quyen truy cap qua ho so tre
 * @param {Object} user
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
const getAccessibleSession = async (user, sessionId) => {
  const session = await prisma.playSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw ApiError.notFound('Play session not found');
  }
  await verifyChildAccess(user, session.childId);
  return session;
};

const getSessionAnswers = (sessionId) =>
  prisma.checkpointAnswer.findMany({
    where: { sessionId },
    orderBy: { answeredAt: 'asc' },
    include: { skill: { select: SKILL_SELECT } },
  });

// =============================================================================
// SERVICES
// =============================================================================

/**
 * Start or resume a reading session for a child
 * @param {Object} user - Authenticated user
 * @param {Object} payload - { childId, storyId, isReplay }
 * @returns {Promise<Object>} Session info, full story content and answers so far
 */
const startSession = async (user, { childId, storyId, isReplay = false }) => {
  const child = await verifyChildAccess(user, childId);

  const story = await prisma.story.findFirst({
    where: { id: storyId, deletedAt: null },
    include: STORY_CONTENT_INCLUDE,
  });

  if (!story) {
    throw ApiError.notFound('Story not found');
  }

  if (story.status !== 'ready' || !story.reviewedAt) {
    throw ApiError.badRequest('Story is not ready for reading yet');
  }

  if (story.pages.length === 0) {
    throw ApiError.badRequest('Story has no content pages to read');
  }

  // Tre chi doc truyen tren gia sach cua minh; truyen rieng cua phu huynh duoc tu dong dua len gia
  const onBookshelf = await prisma.bookshelfItem.findUnique({
    where: { childId_storyId: { childId: child.id, storyId: story.id } },
  });
  if (!onBookshelf) {
    if (story.ownerId !== child.parentId || story.kind !== 'private') {
      throw ApiError.forbidden('Story is not on this child bookshelf');
    }
    await prisma.bookshelfItem.create({ data: { childId: child.id, storyId: story.id } });
  }

  // 1. Resume in-progress session unless replay requested
  const existingSession = await prisma.playSession.findFirst({
    where: { childId: child.id, storyId: story.id, status: 'in_progress' },
    orderBy: { startedAt: 'desc' },
  });

  if (existingSession && !isReplay) {
    const session = await prisma.playSession.update({
      where: { id: existingSession.id },
      data: { lastActivityAt: new Date() },
    });
    const answers = await getSessionAnswers(session.id);
    return {
      session: { ...formatSession(session), isResumed: true },
      story: formatStoryContent(story),
      answers: answers.map(formatAnswer),
    };
  }

  if (existingSession) {
    await prisma.playSession.updateMany({
      where: { childId: child.id, storyId: story.id, status: 'in_progress' },
      data: { status: 'abandoned' },
    });
  }

  // 2. New session. Chi lan choi dau tien (ke ca da bo do) duoc tinh diem EQ
  const createSession = (isFirstPlay) =>
    prisma.playSession.create({
      data: {
        childId: child.id,
        storyId: story.id,
        isFirstPlay,
        status: 'in_progress',
        currentPageId: story.pages[0].id,
      },
    });

  const hasFirstPlay = await prisma.playSession.count({
    where: { childId: child.id, storyId: story.id, isFirstPlay: true },
  });

  let session;
  try {
    session = await createSession(hasFirstPlay === 0);
  } catch (err) {
    // Partial unique (child_id, story_id) WHERE is_first_play: request song song da tao truoc
    if (err.code !== 'P2002') throw err;
    session = await createSession(false);
  }

  return {
    session: { ...formatSession(session), isResumed: false },
    story: formatStoryContent(story),
    answers: [],
  };
};

/**
 * Get current state of a reading session
 * @param {Object} user - Authenticated user
 * @param {string} sessionId
 * @returns {Promise<Object>} Session, story content, answers and per-skill summary
 */
const getSession = async (user, sessionId) => {
  const session = await getAccessibleSession(user, sessionId);

  const [story, answers] = await Promise.all([
    prisma.story.findUnique({ where: { id: session.storyId }, include: STORY_CONTENT_INCLUDE }),
    getSessionAnswers(session.id),
  ]);

  return {
    session: formatSession(session),
    story: formatStoryContent(story),
    answers: answers.map(formatAnswer),
    eqSummary: summarizeAnswers(answers),
  };
};

/**
 * Save reading position (trang dang doc) de mo lai dung cho
 * @param {Object} user
 * @param {string} sessionId
 * @param {Object} payload - { pageId }
 * @returns {Promise<Object>}
 */
const updateProgress = async (user, sessionId, { pageId }) => {
  const session = await getAccessibleSession(user, sessionId);

  if (session.status !== 'in_progress') {
    throw ApiError.badRequest('This reading session is not in progress');
  }

  const page = await prisma.storyPage.findFirst({
    where: { id: pageId, storyId: session.storyId },
    select: { id: true, pageOrder: true },
  });
  if (!page) {
    throw ApiError.notFound('Page not found in this story');
  }

  const updated = await prisma.playSession.update({
    where: { id: session.id },
    data: { currentPageId: page.id, lastActivityAt: new Date() },
  });

  return { session: formatSession(updated), currentPageOrder: page.pageOrder };
};

/**
 * Validate answer payload against checkpoint type
 * @returns {Object} { firstOption }
 */
const validateAnswerPayload = (checkpoint, payload) => {
  const { skipped, attempts, firstEmotion, finalEmotion, firstOptionId, finalOptionId } = payload;
  const optionIds = new Set(checkpoint.options.map((o) => o.id));

  if (EMOTION_TYPES.includes(checkpoint.type)) {
    if (firstOptionId || finalOptionId) {
      throw ApiError.badRequest('Emotion checkpoints are answered with an emotion, not an option');
    }
    if (!skipped && !firstEmotion) {
      throw ApiError.badRequest('firstEmotion is required');
    }
    if (attempts === 2 && !finalEmotion) {
      throw ApiError.badRequest('finalEmotion is required when attempts = 2');
    }
  } else if (OPTION_TYPES.includes(checkpoint.type)) {
    if (firstEmotion || finalEmotion) {
      throw ApiError.badRequest('This checkpoint is answered with an option, not an emotion');
    }
    if (!skipped && !firstOptionId) {
      throw ApiError.badRequest('firstOptionId is required');
    }
    for (const id of [firstOptionId, finalOptionId]) {
      if (id && !optionIds.has(id)) {
        throw ApiError.badRequest('Option does not belong to this checkpoint');
      }
    }
    // problem_solving khong co goi y nen chi chon mot lan
    if (checkpoint.type === 'problem_solving' && attempts > 1) {
      throw ApiError.badRequest('Problem solving checkpoints allow only one attempt');
    }
    if (attempts === 2 && !finalOptionId) {
      throw ApiError.badRequest('finalOptionId is required when attempts = 2');
    }
  } else if (attempts > 1) {
    throw ApiError.badRequest('Reflection checkpoints allow only one attempt');
  }

  return { firstOption: checkpoint.options.find((o) => o.id === firstOptionId) || null };
};

/**
 * Record the child's answer at a checkpoint.
 * Diem va nang luc duoc snapshot luc tra loi; chi lan choi dau, khong bo qua moi cong vao eq_competency_stats.
 * @param {Object} user - Authenticated user
 * @param {string} sessionId
 * @param {Object} payload - answer fields
 * @returns {Promise<Object>} Saved answer
 */
const submitAnswer = async (user, sessionId, payload) => {
  const session = await getAccessibleSession(user, sessionId);

  if (session.status !== 'in_progress') {
    throw ApiError.badRequest('This reading session is not in progress');
  }

  const checkpoint = await prisma.storyCheckpoint.findFirst({
    where: { id: payload.checkpointId, storyId: session.storyId },
    include: {
      options: true,
      story: { select: { topic: { select: { skillId: true } } } },
    },
  });
  if (!checkpoint) {
    throw ApiError.notFound('Checkpoint not found in this story');
  }

  const findExisting = () =>
    prisma.checkpointAnswer.findUnique({
      where: { sessionId_checkpointId: { sessionId, checkpointId: checkpoint.id } },
      include: { skill: { select: SKILL_SELECT } },
    });

  // Cau tra loi da dong bang: gui lai (retry) tra ve ban da luu
  const existing = await findExisting();
  if (existing) {
    return { answer: formatAnswer(existing), alreadyAnswered: true };
  }

  const skipped = Boolean(payload.skipped);
  const attempts = skipped ? 1 : payload.attempts ?? 1;
  const { firstOption } = validateAnswerPayload(checkpoint, { ...payload, skipped, attempts });

  const skillIdByCode = await eqService.getSkillIdByCode();
  const skillId = eqService.resolveSkillId(checkpoint, checkpoint.story.topic.skillId, skillIdByCode);
  const score = skipped ? null : eqService.scoreFirstChoice(checkpoint, { firstEmotion: payload.firstEmotion, firstOption });
  const countsTowardStats = session.isFirstPlay && !skipped && skillId && score !== null;

  // Lan chon cuoi mac dinh bang lan chon dau khi chi chon mot lan
  const finalEmotion = payload.finalEmotion ?? payload.firstEmotion ?? null;
  const finalOptionId = payload.finalOptionId ?? payload.firstOptionId ?? null;

  let answer;
  try {
    answer = await prisma.$transaction(async (tx) => {
      const created = await tx.checkpointAnswer.create({
        data: {
          sessionId,
          checkpointId: checkpoint.id,
          firstEmotion: skipped ? null : payload.firstEmotion ?? null,
          firstOptionId: skipped ? null : payload.firstOptionId ?? null,
          finalEmotion: skipped ? null : finalEmotion,
          finalOptionId: skipped ? null : finalOptionId,
          attempts,
          skipped,
          timeToFirstMs: payload.timeToFirstMs ?? null,
          questionReplays: payload.questionReplays ?? 0,
          skillId,
          score,
        },
        include: { skill: { select: SKILL_SELECT } },
      });

      if (countsTowardStats) {
        await tx.eqCompetencyStat.upsert({
          where: { childId_skillId: { childId: session.childId, skillId } },
          create: { childId: session.childId, skillId, items: 1, scoreSum: score },
          update: { items: { increment: 1 }, scoreSum: { increment: score }, updatedAt: new Date() },
        });
      }

      await tx.playSession.update({
        where: { id: sessionId },
        data: { currentPageId: checkpoint.afterPageId, lastActivityAt: new Date() },
      });

      return created;
    });
  } catch (err) {
    // Request trung lap chay song song: ban kia da ghi truoc
    if (err.code !== 'P2002') throw err;
    return { answer: formatAnswer(await findExisting()), alreadyAnswered: true };
  }

  return { answer: formatAnswer(answer), alreadyAnswered: false };
};

/**
 * Complete a reading session after the last page
 * @param {Object} user - Authenticated user
 * @param {string} sessionId
 * @returns {Promise<Object>} Completed session with per-skill summary of this play
 */
const completeSession = async (user, sessionId) => {
  const session = await getAccessibleSession(user, sessionId);

  if (session.status === 'abandoned') {
    throw ApiError.badRequest('This reading session was abandoned');
  }

  const completed =
    session.status === 'completed'
      ? session
      : await prisma.playSession.update({
          where: { id: sessionId },
          data: { status: 'completed', completedAt: new Date(), lastActivityAt: new Date() },
        });

  const answers = await getSessionAnswers(sessionId);

  return {
    session: formatSession(completed),
    answers: answers.map(formatAnswer),
    eqSummary: summarizeAnswers(answers),
  };
};

/**
 * Get reading history of a child
 * @param {Object} user - Authenticated user
 * @param {string} childId - Child profile ID
 * @param {Object} query - Query parameters (page, limit, status)
 * @returns {Promise<Object>} Reading history and pagination
 */
const getChildHistory = async (user, childId, query) => {
  const child = await verifyChildAccess(user, childId);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const where = {
    childId: child.id,
    ...(query.status && { status: query.status }),
  };

  const [total, sessions] = await Promise.all([
    prisma.playSession.count({ where }),
    prisma.playSession.findMany({
      where,
      take: limit,
      skip,
      orderBy: { startedAt: 'desc' },
      include: {
        story: {
          select: {
            id: true,
            title: true,
            topic: { select: { id: true, title: true, skill: { select: SKILL_SELECT } } },
          },
        },
        answers: { include: { skill: { select: SKILL_SELECT } } },
      },
    }),
  ]);

  const formattedSessions = sessions.map((s) => ({
    ...formatSession(s),
    story: s.story,
    answersCount: s.answers.length,
    eqSummary: summarizeAnswers(s.answers),
  }));

  return {
    child: {
      id: child.id,
      name: child.name,
    },
    sessions: formattedSessions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export default {
  startSession,
  getSession,
  updateProgress,
  submitAnswer,
  completeSession,
  getChildHistory,
};
