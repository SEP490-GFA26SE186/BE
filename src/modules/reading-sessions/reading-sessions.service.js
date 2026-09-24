import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

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

/**
 * Format page output with choices and assets
 * @param {Object} page
 * @returns {Object} Formatted page
 */
const formatPage = (page) => {
  if (!page) return null;
  return {
    id: page.id,
    pageOrder: page.pageOrder,
    pageKind: page.pageKind,
    contentText: page.contentText,
    imageKey: page.imageKey,
    audioKey: page.audioKey,
    imageStatus: page.imageStatus,
    audioStatus: page.audioStatus,
    background: page.background
      ? {
          id: page.background.id,
          name: page.background.name,
          category: page.background.category,
          imageUrl: page.background.imageUrl,
        }
      : null,
    choices: (page.choices || []).map((c) => ({
      id: c.id,
      choiceOrder: c.choiceOrder,
      choiceText: c.choiceText,
      audioKey: c.audioKey,
      isProsocial: c.choiceType?.isProsocial ?? false,
      typeCode: c.choiceType?.typeCode ?? null,
      description: c.choiceType?.description ?? null,
    })),
  };
};

/**
 * Compute and store EQ assessment for a finished session
 * @param {string} sessionId
 * @returns {Promise<Object>} Computed EQ Assessment
 */
const computeEqAssessment = async (sessionId) => {
  const session = await prisma.playSession.findUnique({
    where: { id: sessionId },
    include: {
      story: {
        include: {
          template: {
            include: { primarySkill: true },
          },
        },
      },
      decisions: {
        include: {
          choice: {
            include: {
              choiceType: {
                include: {
                  choiceSignals: {
                    include: { skill: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw ApiError.notFound('Play session not found');
  }

  // Aggregate signals per EQ skill
  const skillMap = {};
  for (const decision of session.decisions) {
    const choiceType = decision.choice?.choiceType;
    if (!choiceType) continue;

    const isProsocial = choiceType.isProsocial;
    const signals = choiceType.choiceSignals || [];

    // If specific CASEL skill signals are defined on template choice
    if (signals.length > 0) {
      for (const sig of signals) {
        const skillId = sig.skillId;
        if (!skillMap[skillId]) {
          skillMap[skillId] = {
            skill: sig.skill,
            occurrences: 0,
            prosocialChoices: 0,
            deltaSum: 0,
          };
        }
        skillMap[skillId].occurrences += 1;
        if (isProsocial) skillMap[skillId].prosocialChoices += 1;
        skillMap[skillId].deltaSum += sig.delta || 0;
      }
    } else if (session.story?.template?.primarySkillId) {
      // Fallback: attribute to story primary EQ skill
      const primarySkillId = session.story.template.primarySkillId;
      if (!skillMap[primarySkillId]) {
        skillMap[primarySkillId] = {
          skill: session.story.template.primarySkill,
          occurrences: 0,
          prosocialChoices: 0,
          deltaSum: 0,
        };
      }
      skillMap[primarySkillId].occurrences += 1;
      if (isProsocial) skillMap[primarySkillId].prosocialChoices += 1;
    }
  }

  // Create or update assessment
  const summaryVi =
    session.decisions.length > 0
      ? `Bé đã hoàn thành câu chuyện với ${session.decisions.length} quyết định tương tác cảm xúc.`
      : 'Bé đã hoàn thành câu chuyện.';

  const assessment = await prisma.eqAssessment.upsert({
    where: { sessionId },
    update: {
      summaryVi,
      computedAt: new Date(),
    },
    create: {
      sessionId,
      summaryVi,
      computedAt: new Date(),
    },
  });

  // Calculate scores (0 to 100) and save EqScores
  const scoreEntries = [];
  for (const [skillId, stats] of Object.entries(skillMap)) {
    const score =
      stats.occurrences > 0
        ? Math.round((stats.prosocialChoices / stats.occurrences) * 100)
        : 100;

    const savedScore = await prisma.eqScore.upsert({
      where: {
        assessmentId_skillId: {
          assessmentId: assessment.id,
          skillId,
        },
      },
      update: {
        occurrences: stats.occurrences,
        prosocialChoices: stats.prosocialChoices,
        score,
      },
      create: {
        assessmentId: assessment.id,
        skillId,
        occurrences: stats.occurrences,
        prosocialChoices: stats.prosocialChoices,
        score,
      },
      include: {
        skill: {
          select: {
            id: true,
            caselCode: true,
            nameVi: true,
            nameEn: true,
          },
        },
      },
    });

    scoreEntries.push({
      id: savedScore.id.toString(),
      skill: savedScore.skill,
      occurrences: savedScore.occurrences,
      prosocialChoices: savedScore.prosocialChoices,
      score: savedScore.score,
    });
  }

  return {
    id: assessment.id,
    sessionId: assessment.sessionId,
    summaryVi: assessment.summaryVi,
    computedAt: assessment.computedAt,
    scores: scoreEntries,
  };
};

/**
 * Start or resume a reading session for a child
 * @param {Object} user - Authenticated user
 * @param {Object} payload - { childId, storyId, isReplay }
 * @returns {Promise<Object>} Session info and current page
 */
const startSession = async (user, { childId, storyId, isReplay = false }) => {
  const child = await verifyChildAccess(user, childId);

  const story = await prisma.story.findFirst({
    where: {
      id: storyId,
      deletedAt: null,
    },
    include: {
      pages: {
        orderBy: { pageOrder: 'asc' },
        include: {
          background: true,
          choices: {
            include: { choiceType: true },
            orderBy: { choiceOrder: 'asc' },
          },
        },
      },
      template: {
        include: {
          primarySkill: {
            select: { id: true, caselCode: true, nameVi: true, nameEn: true },
          },
        },
      },
    },
  });

  if (!story) {
    throw ApiError.notFound('Story not found');
  }

  if (story.pages.length === 0) {
    throw ApiError.badRequest('Story has no content pages to read');
  }

  const totalPages = story.pages.length;

  // 1. Check for active in_progress session if not replay
  if (!isReplay) {
    const existingSession = await prisma.playSession.findFirst({
      where: {
        childId: child.id,
        storyId: story.id,
        status: 'in_progress',
      },
      include: {
        currentPage: {
          include: {
            background: true,
            choices: {
              include: { choiceType: true },
              orderBy: { choiceOrder: 'asc' },
            },
          },
        },
      },
    });

    if (existingSession) {
      // Update lastActivityAt
      await prisma.playSession.update({
        where: { id: existingSession.id },
        data: { lastActivityAt: new Date() },
      });

      const currentPage = existingSession.currentPage || story.pages[0];
      return {
        session: {
          id: existingSession.id,
          childId: child.id,
          storyId: story.id,
          status: existingSession.status,
          isReplay: existingSession.isReplay,
          startedAt: existingSession.startedAt,
          lastActivityAt: new Date(),
          isResumed: true,
          totalPages,
          currentPageOrder: currentPage.pageOrder,
        },
        story: {
          id: story.id,
          title: story.title,
          coverImageKey: story.coverImageKey,
          primarySkill: story.template?.primarySkill,
        },
        currentPage: formatPage(currentPage),
      };
    }
  }

  // 2. Starting fresh or replay
  if (isReplay) {
    // Mark prior in_progress sessions as abandoned
    await prisma.playSession.updateMany({
      where: {
        childId: child.id,
        storyId: story.id,
        status: 'in_progress',
      },
      data: { status: 'abandoned' },
    });
  }

  const firstPage = story.pages[0];

  const newSession = await prisma.playSession.create({
    data: {
      childId: child.id,
      storyId: story.id,
      status: 'in_progress',
      isReplay,
      currentPageId: firstPage.id,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  // Ensure story is placed onto child's bookshelf
  await prisma.bookshelfItem.upsert({
    where: {
      childId_storyId: {
        childId: child.id,
        storyId: story.id,
      },
    },
    update: {},
    create: {
      childId: child.id,
      storyId: story.id,
    },
  });

  return {
    session: {
      id: newSession.id,
      childId: child.id,
      storyId: story.id,
      status: newSession.status,
      isReplay,
      startedAt: newSession.startedAt,
      lastActivityAt: newSession.lastActivityAt,
      isResumed: false,
      totalPages,
      currentPageOrder: firstPage.pageOrder,
    },
    story: {
      id: story.id,
      title: story.title,
      coverImageKey: story.coverImageKey,
      primarySkill: story.template?.primarySkill,
    },
    currentPage: formatPage(firstPage),
  };
};

/**
 * Get current state of a reading session
 * @param {Object} user - Authenticated user
 * @param {string} sessionId
 * @returns {Promise<Object>} Detailed session state
 */
const getSession = async (user, sessionId) => {
  const session = await prisma.playSession.findUnique({
    where: { id: sessionId },
    include: {
      child: {
        select: { id: true, parentId: true, name: true },
      },
      story: {
        select: {
          id: true,
          title: true,
          coverImageKey: true,
          _count: { select: { pages: true } },
          template: {
            select: {
              id: true,
              title: true,
              primarySkill: {
                select: { id: true, caselCode: true, nameVi: true, nameEn: true },
              },
            },
          },
        },
      },
      currentPage: {
        include: {
          background: true,
          choices: {
            include: { choiceType: true },
            orderBy: { choiceOrder: 'asc' },
          },
        },
      },
      decisions: {
        orderBy: { decidedAt: 'asc' },
        include: {
          choice: {
            include: {
              choiceType: true,
            },
          },
          page: {
            select: {
              id: true,
              pageOrder: true,
              pageKind: true,
            },
          },
        },
      },
      eqAssessment: {
        include: {
          scores: {
            include: {
              skill: {
                select: { id: true, caselCode: true, nameVi: true, nameEn: true },
              },
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw ApiError.notFound('Play session not found');
  }

  await verifyChildAccess(user, session.child.id);

  const totalPages = session.story._count.pages;
  const currentPageOrder = session.currentPage?.pageOrder || 0;

  return {
    id: session.id,
    child: {
      id: session.child.id,
      name: session.child.name,
    },
    story: {
      id: session.story.id,
      title: session.story.title,
      coverImageKey: session.story.coverImageKey,
      primarySkill: session.story.template?.primarySkill,
    },
    status: session.status,
    isReplay: session.isReplay,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
    completedAt: session.completedAt,
    totalPages,
    currentPageOrder,
    currentPage: formatPage(session.currentPage),
    decisions: session.decisions.map((d) => ({
      id: d.id.toString(),
      pageId: d.pageId,
      pageOrder: d.page.pageOrder,
      choiceId: d.choiceId,
      choiceText: d.choice.choiceText,
      isProsocial: d.choice.choiceType.isProsocial,
      timeToDecideMs: d.timeToDecideMs,
      decidedAt: d.decidedAt,
    })),
    eqAssessment: session.eqAssessment
      ? {
          id: session.eqAssessment.id,
          summaryVi: session.eqAssessment.summaryVi,
          computedAt: session.eqAssessment.computedAt,
          scores: session.eqAssessment.scores.map((s) => ({
            id: s.id.toString(),
            skill: s.skill,
            occurrences: s.occurrences,
            prosocialChoices: s.prosocialChoices,
            score: s.score,
          })),
        }
      : null,
  };
};

/**
 * Submit a child choice at a story branch
 * @param {Object} user - Authenticated user
 * @param {string} sessionId
 * @param {Object} payload - { pageId, choiceId, timeToDecideMs }
 * @returns {Promise<Object>} Next page or session completion summary
 */
const submitChoice = async (user, sessionId, { pageId, choiceId, timeToDecideMs }) => {
  const session = await prisma.playSession.findUnique({
    where: { id: sessionId },
    include: {
      child: true,
      story: {
        include: {
          pages: {
            orderBy: { pageOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!session) {
    throw ApiError.notFound('Play session not found');
  }

  await verifyChildAccess(user, session.childId);

  if (session.status !== 'in_progress') {
    throw ApiError.badRequest('This reading session is not in progress');
  }

  if (session.currentPageId !== pageId) {
    throw ApiError.badRequest('Page ID does not match current session page');
  }

  // Verify choice belongs to current page
  const choice = await prisma.storyChoice.findFirst({
    where: {
      id: choiceId,
      pageId,
    },
    include: {
      choiceType: true,
    },
  });

  if (!choice) {
    throw ApiError.notFound('Choice not found for this page');
  }

  // 1. Record the decision
  const decision = await prisma.playDecision.upsert({
    where: {
      sessionId_pageId: {
        sessionId,
        pageId,
      },
    },
    update: {
      choiceId,
      timeToDecideMs: timeToDecideMs ?? null,
      decidedAt: new Date(),
    },
    create: {
      sessionId,
      pageId,
      choiceId,
      timeToDecideMs: timeToDecideMs ?? null,
      decidedAt: new Date(),
    },
  });

  // 2. Determine consequence page or next page in storyline
  // Check if a page has fromChoiceId pointing to this choice
  let nextPage = await prisma.storyPage.findFirst({
    where: {
      storyId: session.storyId,
      fromChoiceId: choiceId,
    },
    include: {
      background: true,
      choices: {
        include: { choiceType: true },
        orderBy: { choiceOrder: 'asc' },
      },
    },
  });

  // If no direct consequence branch, navigate to next page by pageOrder
  if (!nextPage) {
    const currentPage = session.story.pages.find((p) => p.id === pageId);
    const currentPageOrder = currentPage?.pageOrder ?? 1;

    nextPage = await prisma.storyPage.findFirst({
      where: {
        storyId: session.storyId,
        pageOrder: { gt: currentPageOrder },
      },
      orderBy: { pageOrder: 'asc' },
      include: {
        background: true,
        choices: {
          include: { choiceType: true },
          orderBy: { choiceOrder: 'asc' },
        },
      },
    });
  }

  const totalPages = session.story.pages.length;

  // 3. If there is a next page, transition to it
  if (nextPage) {
    await prisma.playSession.update({
      where: { id: sessionId },
      data: {
        currentPageId: nextPage.id,
        lastActivityAt: new Date(),
      },
    });

    return {
      isCompleted: false,
      sessionId,
      decision: {
        id: decision.id.toString(),
        pageId,
        choiceId,
        choiceText: choice.choiceText,
        isProsocial: choice.choiceType.isProsocial,
        timeToDecideMs: decision.timeToDecideMs,
      },
      nextPage: formatPage(nextPage),
      progress: {
        currentPageOrder: nextPage.pageOrder,
        totalPages,
      },
    };
  }

  // 4. No more pages -> Complete session and compute EQ assessment
  await prisma.playSession.update({
    where: { id: sessionId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  const eqAssessment = await computeEqAssessment(sessionId);

  return {
    isCompleted: true,
    sessionId,
    decision: {
      id: decision.id.toString(),
      pageId,
      choiceId,
      choiceText: choice.choiceText,
      isProsocial: choice.choiceType.isProsocial,
      timeToDecideMs: decision.timeToDecideMs,
    },
    nextPage: null,
    progress: {
      currentPageOrder: totalPages,
      totalPages,
    },
    eqAssessment,
  };
};

/**
 * Complete a reading session manually or after final page
 * @param {Object} user - Authenticated user
 * @param {string} sessionId
 * @param {Object} [options] - { durationSeconds }
 * @returns {Promise<Object>} Completed session report with EQ Assessment
 */
const completeSession = async (user, sessionId, options = {}) => {
  const session = await prisma.playSession.findUnique({
    where: { id: sessionId },
    include: {
      child: true,
      story: {
        include: {
          template: {
            include: { primarySkill: true },
          },
        },
      },
    },
  });

  if (!session) {
    throw ApiError.notFound('Play session not found');
  }

  await verifyChildAccess(user, session.childId);

  const completedAt = new Date();
  await prisma.playSession.update({
    where: { id: sessionId },
    data: {
      status: 'completed',
      completedAt,
      lastActivityAt: completedAt,
    },
  });

  // Calculate or retrieve EQ assessment
  const eqAssessment = await computeEqAssessment(sessionId);

  // If duration seconds provided or calculated from session, record screen time usage
  let durationSeconds = options.durationSeconds;
  if (!durationSeconds && session.startedAt) {
    durationSeconds = Math.max(1, Math.round((completedAt.getTime() - session.startedAt.getTime()) / 1000));
  }

  if (durationSeconds && durationSeconds > 0) {
    const usageDate = new Date(completedAt.toISOString().split('T')[0]);
    await prisma.childUsageSession.create({
      data: {
        childId: session.childId,
        startedAt: session.startedAt,
        endedAt: completedAt,
        durationSeconds,
        usageDate,
      },
    });
  }

  return {
    sessionId: session.id,
    childId: session.childId,
    storyId: session.storyId,
    status: 'completed',
    completedAt,
    durationSeconds: durationSeconds || 0,
    story: {
      id: session.story.id,
      title: session.story.title,
      primarySkill: session.story.template?.primarySkill,
    },
    eqAssessment,
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
            coverImageKey: true,
            template: {
              select: {
                id: true,
                title: true,
                primarySkill: {
                  select: { id: true, caselCode: true, nameVi: true, nameEn: true },
                },
              },
            },
          },
        },
        _count: {
          select: { decisions: true },
        },
        eqAssessment: {
          include: {
            scores: {
              include: {
                skill: {
                  select: { id: true, caselCode: true, nameVi: true, nameEn: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const formattedSessions = sessions.map((s) => ({
    id: s.id,
    story: s.story,
    status: s.status,
    isReplay: s.isReplay,
    startedAt: s.startedAt,
    lastActivityAt: s.lastActivityAt,
    completedAt: s.completedAt,
    decisionsCount: s._count.decisions,
    eqAssessment: s.eqAssessment
      ? {
          id: s.eqAssessment.id,
          summaryVi: s.eqAssessment.summaryVi,
          computedAt: s.eqAssessment.computedAt,
          scores: s.eqAssessment.scores.map((sc) => ({
            id: sc.id.toString(),
            skill: sc.skill,
            occurrences: sc.occurrences,
            prosocialChoices: sc.prosocialChoices,
            score: sc.score,
          })),
        }
      : null,
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
  submitChoice,
  completeSession,
  getChildHistory,
};
