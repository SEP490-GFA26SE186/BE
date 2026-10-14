import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Helper to check story ownership or elevated privileges and active listing lock
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @param {boolean} requireOwner - Require current user to be owner
 * @param {boolean} checkMutationLock - Check if story is locked by an active marketplace listing
 * @returns {Promise<Object>} Story record
 */
const verifyStoryAccess = async (user, storyId, requireOwner = false, checkMutationLock = false) => {
  const story = await prisma.story.findFirst({
    where: {
      id: storyId,
      deletedAt: null,
    },
    include: {
      topic: {
        include: {
          skill: true,
        },
      },
    },
  });

  if (!story) {
    throw ApiError.notFound('Story not found');
  }

  const isOwner = story.ownerId === user.id;
  const isElevated = ['admin', 'moderator'].includes(user.role);

  if (requireOwner && !isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('You do not have permission to modify this story');
  }

  if (!isOwner && story.kind !== 'published' && !isElevated) {
    throw ApiError.forbidden('Access denied to private story');
  }

  // If modifying a story, verify it's not currently locked by an active or pending marketplace listing
  if (checkMutationLock) {
    const activeListing = await prisma.listing.findFirst({
      where: {
        publishedStoryId: storyId,
        status: { in: ['submitted', 'in_review', 'published'] },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (activeListing) {
      const statusMap = {
        submitted: 'đang chờ kiểm duyệt',
        in_review: 'đang được thẩm định bởi kiểm duyệt viên',
        published: 'đã được xuất bản trên Marketplace',
      };
      const statusLabel = statusMap[activeListing.status] || activeListing.status;
      throw ApiError.badRequest(
        `Không thể chỉnh sửa hoặc xóa câu chuyện vì tác phẩm ${statusLabel}. Vui lòng tạo phiên bản mới hoặc xử lý bài đăng hiện tại.`
      );
    }
  }

  return story;
};

/**
 * Create a new story draft based on a pedagogical topic
 * @param {Object} user - Authenticated parent
 * @param {Object} data - Story creation payload
 * @returns {Promise<Object>} Created story
 */
const createStory = async (user, data) => {
  const {
    topicId,
    templateId,
    title,
    length = 'medium',
    situation,
    useAiImage = false,
    useTts = true,
    autoInitializePages = true,
    characters = [],
  } = data;

  const targetTopicId = topicId || templateId;
  if (!targetTopicId) {
    throw ApiError.badRequest('Topic ID is required');
  }

  // 1. Verify topic exists and is active
  const topic = await prisma.topic.findUnique({
    where: { id: targetTopicId },
    include: { skill: true },
  });

  if (!topic) {
    throw ApiError.notFound('Pedagogical topic not found');
  }

  if (!topic.isActive) {
    throw ApiError.badRequest('Cannot create stories from an inactive topic');
  }

  // 2. Validate family characters if provided
  if (characters.length > 0) {
    const characterIds = characters.map((c) => c.characterId).filter(Boolean);
    if (characterIds.length > 0) {
      const familyCharacters = await prisma.character.findMany({
        where: {
          id: { in: characterIds },
          parentId: user.id,
          deletedAt: null,
        },
      });

      if (familyCharacters.length !== characterIds.length) {
        throw ApiError.badRequest('One or more selected family characters do not exist or belong to another account');
      }
    }
  }

  // 3. Create Story and structure in a database transaction
  const result = await prisma.$transaction(async (tx) => {
    // 3.1 Create story header
    const newStory = await tx.story.create({
      data: {
        ownerId: user.id,
        kind: 'private',
        topicId: targetTopicId,
        length,
        situation: situation || null,
        title,
        useAiImage: Boolean(useAiImage),
        useTts: Boolean(useTts),
        status: 'draft',
      },
    });

    // 3.2 Bind character tokens
    for (let i = 0; i < characters.length; i++) {
      const c = characters[i];
      const token = c.token || c.slotKey || `{NV${i + 1}}`;
      await tx.storyCharacter.create({
        data: {
          storyId: newStory.id,
          token,
          characterId: c.characterId || null,
          aliasName: c.aliasName || null,
          isMain: c.isMain ?? (i === 0),
        },
      });
    }

    // 3.3 Auto-initialize story skeleton (scene & initial page)
    if (autoInitializePages) {
      const defaultScene = await tx.storyScene.create({
        data: {
          storyId: newStory.id,
          sceneOrder: 1,
          description: `Khung cảnh mở đầu cho bài học "${topic.title}"`,
        },
      });

      await tx.storyPage.create({
        data: {
          storyId: newStory.id,
          sceneId: defaultScene.id,
          pageOrder: 1,
          contentText: `Mở đầu câu chuyện về chủ đề "${topic.title}"...`,
          origin: 'human',
        },
      });
    }

    return newStory;
  });

  return getStoryById(user, result.id);
};

/**
 * Get stories created by user or accessible to user
 * @param {Object} user - Authenticated user
 * @param {Object} filter - Query parameters
 * @returns {Promise<Object>} Paginated stories list
 */
const getStories = async (user, filter = {}) => {
  const { kind, status, topicId, templateId, search, page = 1, limit = 10 } = filter;
  const targetTopicId = topicId || templateId;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  const where = {
    ownerId: user.id,
    deletedAt: null,
  };

  if (kind) where.kind = kind;
  if (status) where.status = status;
  if (targetTopicId) where.topicId = targetTopicId;
  if (search) {
    where.title = { contains: search, mode: 'insensitive' };
  }

  const [total, stories] = await Promise.all([
    prisma.story.count({ where }),
    prisma.story.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { updatedAt: 'desc' },
      include: {
        topic: {
          select: {
            id: true,
            title: true,
            guidance: true,
            ageMin: true,
            ageMax: true,
            skill: {
              select: { id: true, caselCode: true, nameVi: true, nameEn: true },
            },
          },
        },
        storyCharacters: {
          include: {
            character: {
              select: { id: true, name: true, appearance: true, portraitImageKey: true },
            },
          },
        },
        _count: {
          select: {
            pages: true,
            bookshelfItems: true,
            playSessions: true,
          },
        },
      },
    }),
  ]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    stories: stories.map((s) => ({
      id: s.id,
      title: s.title,
      length: s.length,
      situation: s.situation,
      kind: s.kind,
      status: s.status,
      useAiImage: s.useAiImage,
      useTts: s.useTts,
      reviewedAt: s.reviewedAt,
      isReviewed: s.reviewedAt !== null,
      topic: s.topic,
      characters: s.storyCharacters.map((sc) => ({
        token: sc.token,
        characterId: sc.characterId,
        aliasName: sc.aliasName,
        isMain: sc.isMain,
        character: sc.character,
      })),
      totalPages: s._count.pages,
      bookshelfCount: s._count.bookshelfItems,
      playCount: s._count.playSessions,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
};

/**
 * Get full story detail including scenes, pages, and checkpoints
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @returns {Promise<Object>} Story with full pages hierarchy
 */
const getStoryById = async (user, storyId) => {
  const story = await prisma.story.findFirst({
    where: {
      id: storyId,
      deletedAt: null,
    },
    include: {
      owner: {
        select: { id: true, fullName: true },
      },
      topic: {
        include: {
          skill: true,
        },
      },
      storyCharacters: {
        include: {
          character: true,
        },
      },
      scenes: {
        orderBy: { sceneOrder: 'asc' },
        include: {
          background: {
            select: { id: true, name: true, imageKey: true },
          },
        },
      },
      pages: {
        orderBy: { pageOrder: 'asc' },
        include: {
          scene: {
            select: { id: true, sceneOrder: true, description: true, imageKey: true },
          },
          checkpoint: {
            include: {
              options: {
                orderBy: { optionOrder: 'asc' },
              },
            },
          },
        },
      },
      checkpoints: {
        include: {
          options: {
            orderBy: { optionOrder: 'asc' },
          },
        },
      },
      _count: {
        select: {
          bookshelfItems: true,
          playSessions: true,
        },
      },
    },
  });

  if (!story) {
    throw ApiError.notFound('Story not found');
  }

  const isOwner = story.ownerId === user.id;
  const isElevated = ['admin', 'moderator'].includes(user.role);

  if (!isOwner && story.kind !== 'published' && !isElevated) {
    throw ApiError.forbidden('Access denied to private story');
  }

  return {
    id: story.id,
    title: story.title,
    length: story.length,
    situation: story.situation,
    kind: story.kind,
    status: story.status,
    useAiImage: story.useAiImage,
    useTts: story.useTts,
    reviewedAt: story.reviewedAt,
    isReviewed: story.reviewedAt !== null,
    owner: story.owner,
    topic: story.topic,
    characters: story.storyCharacters.map((sc) => ({
      token: sc.token,
      characterId: sc.characterId,
      aliasName: sc.aliasName,
      isMain: sc.isMain,
      character: sc.character,
    })),
    scenes: story.scenes,
    pages: story.pages.map((p) => ({
      id: p.id,
      pageOrder: p.pageOrder,
      sceneId: p.sceneId,
      scene: p.scene,
      contentText: p.contentText,
      aiOriginalText: p.aiOriginalText,
      origin: p.origin,
      audioKey: p.audioKey,
      audioStatus: p.audioStatus,
      checkpoint: p.checkpoint,
    })),
    checkpoints: story.checkpoints,
    totalPages: story.pages.length,
    bookshelfCount: story._count.bookshelfItems,
    playCount: story._count.playSessions,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  };
};

/**
 * Update story header details
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated story
 */
const updateStory = async (user, storyId, data) => {
  const story = await verifyStoryAccess(user, storyId, true, true);

  const updated = await prisma.story.update({
    where: { id: story.id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.useAiImage !== undefined && { useAiImage: data.useAiImage }),
      ...(data.useTts !== undefined && { useTts: data.useTts }),
      ...(data.status !== undefined && { status: data.status }),
    },
  });

  return updated;
};

/**
 * Soft delete a story
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @returns {Promise<Object>} Deletion result
 */
const deleteStory = async (user, storyId) => {
  const story = await verifyStoryAccess(user, storyId, true, true);

  await prisma.story.update({
    where: { id: story.id },
    data: { deletedAt: new Date() },
  });

  return { message: 'Story deleted successfully', storyId: story.id };
};

/**
 * Bind or rebind family characters to story character tokens
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @param {Array} characters - Slot character mappings
 * @returns {Promise<Object>} Updated character bindings
 */
const bindCharacters = async (user, storyId, characters) => {
  const story = await verifyStoryAccess(user, storyId, true, true);

  const characterIds = characters.map((c) => c.characterId).filter(Boolean);
  if (characterIds.length > 0) {
    const familyCharacters = await prisma.character.findMany({
      where: {
        id: { in: characterIds },
        parentId: user.id,
        deletedAt: null,
      },
    });

    if (familyCharacters.length !== characterIds.length) {
      throw ApiError.badRequest('One or more selected family characters do not exist or belong to another account');
    }
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < characters.length; i++) {
      const item = characters[i];
      const token = item.token || item.slotKey || `{NV${i + 1}}`;
      await tx.storyCharacter.upsert({
        where: {
          storyId_token: {
            storyId: story.id,
            token,
          },
        },
        create: {
          storyId: story.id,
          token,
          characterId: item.characterId || null,
          aliasName: item.aliasName || null,
          isMain: item.isMain ?? (i === 0),
        },
        update: {
          characterId: item.characterId || null,
          aliasName: item.aliasName || null,
          isMain: item.isMain ?? undefined,
        },
      });
    }
  });

  return getStoryById(user, story.id);
};

/**
 * Update a specific story page (Text, Background, Origin)
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @param {string} pageId - Page ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated page
 */
const updatePage = async (user, storyId, pageId, data) => {
  await verifyStoryAccess(user, storyId, true, true);

  const page = await prisma.storyPage.findFirst({
    where: {
      id: pageId,
      storyId,
    },
  });

  if (!page) {
    throw ApiError.notFound('Story page not found');
  }

  // Determine origin flag: if editing an AI-generated page, mark as 'ai_edited'
  let origin = data.origin;
  if (!origin) {
    if (page.origin === 'ai' && data.contentText !== undefined && data.contentText !== page.contentText) {
      origin = 'ai_edited';
    } else {
      origin = page.origin;
    }
  }

  const updatedPage = await prisma.storyPage.update({
    where: { id: page.id },
    data: {
      ...(data.contentText !== undefined && { contentText: data.contentText }),
      ...(data.sceneId !== undefined && { sceneId: data.sceneId }),
      ...(data.audioKey !== undefined && { audioKey: data.audioKey }),
      origin,
    },
    include: {
      scene: { include: { background: true } },
      checkpoint: { include: { options: true } },
    },
  });

  return updatedPage;
};

/**
 * Create a new page manually in a story
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @param {Object} data - Page creation data
 * @returns {Promise<Object>} Created page
 */
const createPage = async (user, storyId, data) => {
  await verifyStoryAccess(user, storyId, true, true);

  let pageOrder = data.pageOrder;
  if (!pageOrder) {
    const lastPage = await prisma.storyPage.findFirst({
      where: { storyId },
      orderBy: { pageOrder: 'desc' },
      select: { pageOrder: true },
    });
    pageOrder = (lastPage?.pageOrder || 0) + 1;
  }

  // Ensure a scene exists for story
  let sceneId = data.sceneId;
  if (!sceneId) {
    const firstScene = await prisma.storyScene.findFirst({
      where: { storyId },
      orderBy: { sceneOrder: 'asc' },
    });
    if (firstScene) {
      sceneId = firstScene.id;
    } else {
      const newScene = await prisma.storyScene.create({
        data: {
          storyId,
          sceneOrder: 1,
          description: 'Khung cảnh trang truyện',
        },
      });
      sceneId = newScene.id;
    }
  }

  const newPage = await prisma.storyPage.create({
    data: {
      storyId,
      sceneId,
      pageOrder,
      contentText: data.contentText || '',
      origin: data.origin || 'human',
    },
    include: {
      scene: true,
      checkpoint: true,
    },
  });

  return newPage;
};

/**
 * Delete a page from story and reorder remaining pages
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @param {string} pageId - Page ID
 * @returns {Promise<Object>} Deletion result
 */
const deletePage = async (user, storyId, pageId) => {
  await verifyStoryAccess(user, storyId, true, true);

  const page = await prisma.storyPage.findFirst({
    where: { id: pageId, storyId },
  });

  if (!page) {
    throw ApiError.notFound('Page not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.storyPage.delete({ where: { id: page.id } });

    // Reorder subsequent pages
    const subsequentPages = await tx.storyPage.findMany({
      where: {
        storyId,
        pageOrder: { gt: page.pageOrder },
      },
      orderBy: { pageOrder: 'asc' },
    });

    for (let i = 0; i < subsequentPages.length; i++) {
      await tx.storyPage.update({
        where: { id: subsequentPages[i].id },
        data: { pageOrder: page.pageOrder + i },
      });
    }
  });

  return { message: 'Page deleted and order recalculated', pageId };
};

/**
 * Update choice / checkpoint option text
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @param {string} pageId - Page ID
 * @param {string} choiceId - Option ID
 * @param {Object} data - Option update data
 * @returns {Promise<Object>} Updated option
 */
const updateChoice = async (user, storyId, pageId, choiceId, data) => {
  await verifyStoryAccess(user, storyId, true, true);

  const option = await prisma.checkpointOption.findFirst({
    where: {
      id: choiceId,
      checkpoint: { storyId },
    },
  });

  if (!option) {
    throw ApiError.notFound('Checkpoint option not found');
  }

  const updatedOption = await prisma.checkpointOption.update({
    where: { id: option.id },
    data: {
      ...(data.choiceText !== undefined && { text: data.choiceText }),
      ...(data.text !== undefined && { text: data.text }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.isCorrect !== undefined && { isCorrect: data.isCorrect }),
      ...(data.feedback !== undefined && { feedback: data.feedback }),
      ...(data.audioKey !== undefined && { textAudioKey: data.audioKey }),
    },
  });

  return updatedOption;
};

/**
 * Review Mode: Parent verifies and marks story as reviewed and ready
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @returns {Promise<Object>} Reviewed story
 */
const reviewStory = async (user, storyId) => {
  const story = await verifyStoryAccess(user, storyId, true, true);

  // 1. Check minimum requirements
  const pages = await prisma.storyPage.findMany({
    where: { storyId: story.id },
  });

  if (pages.length === 0) {
    throw ApiError.badRequest('Cannot review a story with no pages. Please compose the story first.');
  }

  // 2. Ensure each page has content text
  const emptyPages = pages.filter((p) => !p.contentText || p.contentText.trim() === '');
  if (emptyPages.length > 0) {
    throw ApiError.badRequest(
      `Pages ${emptyPages.map((p) => p.pageOrder).join(', ')} do not have content text yet. Please complete all pages before review.`
    );
  }

  // 3. Ensure checkpoints options have text if any checkpoints exist
  const checkpoints = await prisma.storyCheckpoint.findMany({
    where: { storyId: story.id },
    include: { options: true },
  });

  for (const cp of checkpoints) {
    for (const opt of cp.options) {
      if (!opt.text || opt.text.trim() === '') {
        throw ApiError.badRequest(`Option order ${opt.optionOrder} on checkpoint ${cp.id} has empty text`);
      }
    }
  }

  // 4. Update story status to ready and mark reviewedAt
  const updatedStory = await prisma.story.update({
    where: { id: story.id },
    data: {
      reviewedAt: new Date(),
      status: 'ready',
    },
  });

  return {
    message: 'Story successfully reviewed and marked ready for child bookshelf',
    story: {
      id: updatedStory.id,
      title: updatedStory.title,
      status: updatedStory.status,
      reviewedAt: updatedStory.reviewedAt,
    },
  };
};

/**
 * Sao chep canh, trang, diem dung va phuong an tu truyen nguon sang truyen dich (trong transaction).
 * Chu van giu token {NVx}; ten nhan vat do story_characters cua truyen dich quyet dinh.
 * @param {Object} tx - Prisma transaction client
 * @param {Object} params
 * @param {string} params.sourceStoryId
 * @param {string} params.targetStoryId
 * @param {Function} [params.transformText] - bien doi chu (vd: go ten rieng khi dang ban)
 * @param {boolean} [params.keepAudio] - giu file doc khi ten nhan vat khong doi
 */
const cloneStoryContent = async (tx, { sourceStoryId, targetStoryId, transformText = (t) => t, keepAudio = false }) => {
  const scenes = await tx.storyScene.findMany({
    where: { storyId: sourceStoryId },
    orderBy: { sceneOrder: 'asc' },
  });

  const sceneIdMap = new Map();
  for (const sc of scenes) {
    const newScene = await tx.storyScene.create({
      data: {
        storyId: targetStoryId,
        sceneOrder: sc.sceneOrder,
        description: sc.description,
        imageKey: sc.imageKey,
        backgroundId: sc.backgroundId,
        imageStatus: sc.imageStatus,
      },
    });
    sceneIdMap.set(sc.id, newScene.id);
  }

  const pages = await tx.storyPage.findMany({
    where: { storyId: sourceStoryId },
    orderBy: { pageOrder: 'asc' },
    include: { checkpoint: { include: { options: { orderBy: { optionOrder: 'asc' } } } } },
  });

  const audio = (key, status) =>
    keepAudio ? { key, status } : { key: null, status: 'none' };

  for (const page of pages) {
    const pageAudio = audio(page.audioKey, page.audioStatus);
    const clonedPage = await tx.storyPage.create({
      data: {
        storyId: targetStoryId,
        sceneId: sceneIdMap.get(page.sceneId),
        pageOrder: page.pageOrder,
        contentText: transformText(page.contentText),
        aiOriginalText: transformText(page.aiOriginalText),
        origin: page.origin,
        audioKey: pageAudio.key,
        audioStatus: pageAudio.status,
      },
    });

    const cp = page.checkpoint;
    if (!cp) continue;

    const clonedCp = await tx.storyCheckpoint.create({
      data: {
        storyId: targetStoryId,
        afterPageId: clonedPage.id,
        type: cp.type,
        targetToken: cp.targetToken,
        question: transformText(cp.question),
        answerEmotion: cp.answerEmotion,
        hint: transformText(cp.hint),
        origin: cp.origin,
        questionAudioKey: keepAudio ? cp.questionAudioKey : null,
        hintAudioKey: keepAudio ? cp.hintAudioKey : null,
      },
    });

    for (const opt of cp.options) {
      await tx.checkpointOption.create({
        data: {
          checkpointId: clonedCp.id,
          optionOrder: opt.optionOrder,
          text: transformText(opt.text),
          role: opt.role,
          isCorrect: opt.isCorrect,
          feedback: transformText(opt.feedback),
          textAudioKey: keepAudio ? opt.textAudioKey : null,
          feedbackAudioKey: keepAudio ? opt.feedbackAudioKey : null,
        },
      });
    }
  }
};

/**
 * Create a published clone of a private story with de-personalization
 * @param {Object} user - Authenticated parent/seller
 * @param {string} storyId - Source private story ID
 * @param {Object} options - Publish options (optional title, nameReplacements)
 * @returns {Promise<Object>} De-personalized published story ready for marketplace listing
 */
const publishStoryVersion = async (user, storyId, options = {}) => {
  const sourceStory = await verifyStoryAccess(user, storyId, true);

  if (sourceStory.kind !== 'private') {
    throw ApiError.badRequest('Only private stories can be cloned into a published version');
  }

  if (!sourceStory.reviewedAt) {
    throw ApiError.badRequest('You must review the private story before publishing it');
  }

  const topic = sourceStory.topic;

  // Fetch story characters to prepare de-personalization
  const storyCharacters = await prisma.storyCharacter.findMany({
    where: { storyId: sourceStory.id },
    include: { character: true },
  });

  // Map custom replacement names if provided by parent in options.nameReplacements
  const customByToken = new Map();
  const customByName = new Map();

  if (Array.isArray(options.nameReplacements)) {
    for (const item of options.nameReplacements) {
      const target = item?.customName?.trim();
      if (!target) continue;
      const tokenKey = (item.token || item.slotKey)?.trim();
      if (tokenKey) {
        customByToken.set(tokenKey, target);
      }
      if (item.fromName?.trim()) {
        customByName.set(item.fromName.trim().toLowerCase(), target);
      }
    }
  }

  const nameReplacements = [];
  for (const sc of storyCharacters) {
    if (sc.character) {
      const charName = sc.character.name;
      const targetName =
        customByToken.get(sc.token) ||
        customByName.get(charName.toLowerCase()) ||
        sc.aliasName ||
        'Nhân vật';

      nameReplacements.push({
        from: charName,
        to: targetName,
      });
    }
  }

  // Also support ad-hoc custom name replacements for nicknames not directly bound to characters
  if (Array.isArray(options.nameReplacements)) {
    for (const item of options.nameReplacements) {
      const from = item?.fromName?.trim();
      const to = item?.customName?.trim();
      if (from && to && !nameReplacements.some((r) => r.from.toLowerCase() === from.toLowerCase())) {
        nameReplacements.push({ from, to });
      }
    }
  }

  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const depersonalizeText = (text) => {
    if (!text) return text;
    let result = text;
    for (const rep of nameReplacements) {
      if (!rep.from) continue;
      const regex = new RegExp(
        `(?<=^|[^\\p{L}\\p{N}])${escapeRegex(rep.from)}(?=$|[^\\p{L}\\p{N}])`,
        'gui'
      );
      result = result.replace(regex, rep.to);
    }
    return result;
  };

  // Perform cloning inside a database transaction
  const publishedStory = await prisma.$transaction(async (tx) => {
    // 1. Create published story. Khong chep situation: do la chuyen that cua gia dinh
    const clonedStory = await tx.story.create({
      data: {
        ownerId: user.id,
        kind: 'published',
        topicId: sourceStory.topicId,
        length: sourceStory.length,
        situation: null,
        sourceStoryId: sourceStory.id,
        title: depersonalizeText(options.title || sourceStory.title),
        useAiImage: sourceStory.useAiImage,
        useTts: sourceStory.useTts,
        status: 'ready',
        reviewedAt: new Date(),
      },
    });

    // 2. Clone story characters with aliasName (de-personalized, characterId is null)
    for (const sc of storyCharacters) {
      const aliasName =
        customByToken.get(sc.token) ||
        (sc.character ? customByName.get(sc.character.name.toLowerCase()) : null) ||
        sc.aliasName ||
        sc.character?.name ||
        'Nhân vật';

      await tx.storyCharacter.create({
        data: {
          storyId: clonedStory.id,
          token: sc.token,
          characterId: null, // De-personalized
          aliasName,
          isMain: sc.isMain,
        },
      });
    }

    // 3. Clone scenes, pages, checkpoints. Audio doc ten that nen bo, se sinh lai
    await cloneStoryContent(tx, {
      sourceStoryId: sourceStory.id,
      targetStoryId: clonedStory.id,
      transformText: depersonalizeText,
      keepAudio: false,
    });

    return clonedStory;
  });

  return getStoryById(user, publishedStory.id);
};

export default {
  cloneStoryContent,
  createStory,
  getStories,
  getStoryById,
  updateStory,
  deleteStory,
  bindCharacters,
  updatePage,
  createPage,
  deletePage,
  updateChoice,
  reviewStory,
  publishStoryVersion,
};
