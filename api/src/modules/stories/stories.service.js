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
      template: {
        include: {
          slots: true,
          primarySkill: true,
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
 * Create a new story draft based on a pedagogical template
 * @param {Object} user - Authenticated parent
 * @param {Object} data - Story creation payload
 * @returns {Promise<Object>} Created story
 */
const createStory = async (user, data) => {
  const {
    templateId,
    title,
    coverImageKey,
    useAiImage = false,
    useTts = true,
    autoInitializePages = true,
    characters = [],
  } = data;

  // 1. Verify template exists and is active
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      slots: true,
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: {
          choices: {
            orderBy: { choiceOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!template) {
    throw ApiError.notFound('Pedagogical template not found');
  }

  if (template.status === 'retired') {
    throw ApiError.badRequest('Cannot create stories from a retired template');
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
        templateId,
        title,
        coverImageKey: coverImageKey || null,
        useAiImage,
        useTts,
        status: 'draft',
      },
    });

    // 3.2 Bind character slots
    const slotMap = new Map(characters.map((c) => [c.slotKey, c.characterId]));
    for (const slot of template.slots) {
      await tx.storyCharacter.create({
        data: {
          storyId: newStory.id,
          slotKey: slot.slotKey,
          characterId: slotMap.get(slot.slotKey) || null,
        },
      });
    }

    // 3.3 Auto-initialize story skeleton pages from template stages if requested
    if (autoInitializePages && template.stages.length > 0) {
      let pageOrder = 1;

      for (const stage of template.stages) {
        // A. Situation / Decision point page
        const situationPage = await tx.storyPage.create({
          data: {
            storyId: newStory.id,
            stageId: stage.id,
            pageKind: pageOrder === 1 ? 'lead_in' : 'situation',
            pageOrder: pageOrder++,
            contentText: `[${stage.learningObjective}] - Mô tả tình huống...`,
            origin: 'human',
          },
        });

        // B. Choices for this stage
        if (stage.choices && stage.choices.length > 0) {
          for (const choiceType of stage.choices) {
            const createdChoice = await tx.storyChoice.create({
              data: {
                pageId: situationPage.id,
                choiceOrder: choiceType.choiceOrder,
                choiceText: choiceType.description,
                choiceTypeId: choiceType.id,
              },
            });

            // C. Consequence page branching from this choice
            await tx.storyPage.create({
              data: {
                storyId: newStory.id,
                stageId: stage.id,
                pageKind: 'consequence',
                pageOrder: pageOrder++,
                fromChoiceId: createdChoice.id,
                contentText: `Kết quả diễn biến cho lựa chọn "${choiceType.description}"...`,
                origin: 'human',
              },
            });
          }
        }

        // D. Ending page if this is the climax or the last stage
        if (stage.isClimax || stage.stageOrder === template.stages.length) {
          await tx.storyPage.create({
            data: {
              storyId: newStory.id,
              stageId: stage.id,
              pageKind: 'ending',
              pageOrder: pageOrder++,
              contentText: 'Bài học cảm xúc và kết thúc câu chuyện...',
              origin: 'human',
            },
          });
        }
      }
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
  const { kind, status, templateId, search, page = 1, limit = 10 } = filter;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  const where = {
    ownerId: user.id,
    deletedAt: null,
  };

  if (kind) where.kind = kind;
  if (status) where.status = status;
  if (templateId) where.templateId = templateId;
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
        template: {
          select: {
            id: true,
            title: true,
            ageMin: true,
            ageMax: true,
            primarySkill: {
              select: { id: true, caselCode: true, nameVi: true, nameEn: true },
            },
          },
        },
        storyCharacters: {
          include: {
            character: {
              select: { id: true, name: true, role: true, portraitImageKey: true },
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
      coverImageKey: s.coverImageKey,
      kind: s.kind,
      status: s.status,
      useAiImage: s.useAiImage,
      useTts: s.useTts,
      reviewedAt: s.reviewedAt,
      isReviewed: s.reviewedAt !== null,
      template: s.template,
      characters: s.storyCharacters.map((sc) => ({
        slotKey: sc.slotKey,
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
 * Get full story detail including stages, pages, and branching choices
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
      template: {
        include: {
          primarySkill: true,
          slots: true,
        },
      },
      storyCharacters: {
        include: {
          character: true,
        },
      },
      pages: {
        orderBy: { pageOrder: 'asc' },
        include: {
          stage: {
            select: {
              id: true,
              stageOrder: true,
              learningObjective: true,
              emotionToName: true,
              isClimax: true,
            },
          },
          background: {
            select: { id: true, name: true, imageKey: true },
          },
          choices: {
            orderBy: { choiceOrder: 'asc' },
            include: {
              choiceType: {
                select: {
                  id: true,
                  choiceOrder: true,
                  typeCode: true,
                  description: true,
                  isProsocial: true,
                },
              },
            },
          },
          fromChoice: {
            select: {
              id: true,
              choiceOrder: true,
              choiceText: true,
            },
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
    coverImageKey: story.coverImageKey,
    kind: story.kind,
    status: story.status,
    useAiImage: story.useAiImage,
    useTts: story.useTts,
    reviewedAt: story.reviewedAt,
    isReviewed: story.reviewedAt !== null,
    owner: story.owner,
    template: {
      id: story.template.id,
      title: story.template.title,
      description: story.template.description,
      primarySkill: story.template.primarySkill,
      ageMin: story.template.ageMin,
      ageMax: story.template.ageMax,
      slots: story.template.slots,
    },
    characters: story.storyCharacters.map((sc) => ({
      slotKey: sc.slotKey,
      character: sc.character,
    })),
    pages: story.pages.map((p) => ({
      id: p.id,
      pageOrder: p.pageOrder,
      pageKind: p.pageKind,
      stageId: p.stageId,
      stage: p.stage,
      fromChoiceId: p.fromChoiceId,
      fromChoice: p.fromChoice,
      contentText: p.contentText,
      aiOriginalText: p.aiOriginalText,
      origin: p.origin,
      background: p.background,
      imageKey: p.imageKey,
      audioKey: p.audioKey,
      imageStatus: p.imageStatus,
      audioStatus: p.audioStatus,
      choices: p.choices.map((c) => ({
        id: c.id,
        choiceOrder: c.choiceOrder,
        choiceText: c.choiceText,
        audioKey: c.audioKey,
        choiceType: c.choiceType,
      })),
      updatedAt: p.updatedAt,
    })),
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
      ...(data.coverImageKey !== undefined && { coverImageKey: data.coverImageKey }),
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
 * Bind or rebind family characters to story template slots
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

  // Update or insert slot bindings in transaction
  await prisma.$transaction(async (tx) => {
    for (const item of characters) {
      await tx.storyCharacter.upsert({
        where: {
          storyId_slotKey: {
            storyId: story.id,
            slotKey: item.slotKey,
          },
        },
        create: {
          storyId: story.id,
          slotKey: item.slotKey,
          characterId: item.characterId || null,
        },
        update: {
          characterId: item.characterId || null,
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
      ...(data.backgroundId !== undefined && { backgroundId: data.backgroundId }),
      ...(data.imageKey !== undefined && { imageKey: data.imageKey }),
      ...(data.audioKey !== undefined && { audioKey: data.audioKey }),
      origin,
    },
    include: {
      background: true,
      choices: {
        include: { choiceType: true },
      },
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

  const newPage = await prisma.storyPage.create({
    data: {
      storyId,
      stageId: data.stageId,
      pageKind: data.pageKind,
      pageOrder,
      fromChoiceId: data.fromChoiceId || null,
      contentText: data.contentText || '',
      backgroundId: data.backgroundId || null,
      origin: data.origin || 'human',
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
 * Update choice text of a branch point
 * @param {Object} user - Authenticated user
 * @param {string} storyId - Story ID
 * @param {string} pageId - Page ID
 * @param {string} choiceId - Choice ID
 * @param {Object} data - Choice update data
 * @returns {Promise<Object>} Updated choice
 */
const updateChoice = async (user, storyId, pageId, choiceId, data) => {
  await verifyStoryAccess(user, storyId, true, true);

  const choice = await prisma.storyChoice.findFirst({
    where: {
      id: choiceId,
      pageId,
      page: { storyId },
    },
  });

  if (!choice) {
    throw ApiError.notFound('Choice not found');
  }

  const updatedChoice = await prisma.storyChoice.update({
    where: { id: choice.id },
    data: {
      choiceText: data.choiceText,
      ...(data.audioKey !== undefined && { audioKey: data.audioKey }),
    },
    include: { choiceType: true },
  });

  return updatedChoice;
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
    include: {
      choices: true,
    },
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

  // 3. Ensure choices have text
  for (const page of pages) {
    for (const choice of page.choices) {
      if (!choice.choiceText || choice.choiceText.trim() === '') {
        throw ApiError.badRequest(`Choice order ${choice.choiceOrder} on page ${page.pageOrder} has empty text`);
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
 * Create a published clone of a private story with de-personalization
 * @param {Object} user - Authenticated parent/seller
 * @param {string} storyId - Source private story ID
 * @param {Object} options - Publish options (optional title, cover)
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

  const template = sourceStory.template;

  // Fetch full pages and choices to clone
  const pages = await prisma.storyPage.findMany({
    where: { storyId: sourceStory.id },
    orderBy: { pageOrder: 'asc' },
    include: {
      choices: {
        orderBy: { choiceOrder: 'asc' },
      },
    },
  });

  // Prepare de-personalization: Map character names to slot default names or parent custom names
  const slotDefaultNames = new Map(template.slots.map((s) => [s.slotKey, s.defaultName]));

  // Also replace any private character name occurrences
  const storyCharacters = await prisma.storyCharacter.findMany({
    where: { storyId: sourceStory.id },
    include: { character: true },
  });

  // Map custom replacement names if provided by parent in options.nameReplacements
  const customBySlot = new Map();
  const customByName = new Map();

  if (Array.isArray(options.nameReplacements)) {
    for (const item of options.nameReplacements) {
      const target = item?.customName?.trim();
      if (!target) continue;
      if (item.slotKey?.trim()) {
        customBySlot.set(item.slotKey.trim(), target);
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
        customBySlot.get(sc.slotKey) ||
        customByName.get(charName.toLowerCase()) ||
        slotDefaultNames.get(sc.slotKey) ||
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
      // Unicode word boundary lookaround supporting Vietnamese diacritics
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
    // 1. Create published story
    const clonedStory = await tx.story.create({
      data: {
        ownerId: user.id,
        kind: 'published',
        templateId: sourceStory.templateId,
        sourceStoryId: sourceStory.id,
        title: options.title || sourceStory.title,
        coverImageKey: options.coverImageKey || sourceStory.coverImageKey,
        useAiImage: sourceStory.useAiImage,
        useTts: sourceStory.useTts,
        status: 'ready',
        reviewedAt: new Date(),
      },
    });

    // 2. Clone story characters without personal character references (using default names)
    for (const slot of template.slots) {
      await tx.storyCharacter.create({
        data: {
          storyId: clonedStory.id,
          slotKey: slot.slotKey,
          characterId: null, // De-personalized: no private characterId
        },
      });
    }

    // 3. Clone pages and choices with text de-personalization
    const choiceIdMap = new Map(); // oldChoiceId -> newChoiceId

    // First pass: create non-consequence pages and choices
    for (const page of pages) {
      const dePersonalizedContent = depersonalizeText(page.contentText);

      const clonedPage = await tx.storyPage.create({
        data: {
          storyId: clonedStory.id,
          stageId: page.stageId,
          pageKind: page.pageKind,
          pageOrder: page.pageOrder,
          contentText: dePersonalizedContent,
          aiOriginalText: page.aiOriginalText,
          origin: page.origin,
          backgroundId: page.backgroundId,
          imageKey: page.imageKey,
          audioKey: null, // TTS will need re-generation if names changed
        },
      });

      for (const choice of page.choices) {
        const clonedChoice = await tx.storyChoice.create({
          data: {
            pageId: clonedPage.id,
            choiceOrder: choice.choiceOrder,
            choiceText: depersonalizeText(choice.choiceText),
            choiceTypeId: choice.choiceTypeId,
          },
        });
        choiceIdMap.set(choice.id, clonedChoice.id);
      }
    }

    // Second pass: link consequence pages to their cloned fromChoiceId
    for (const page of pages) {
      if (page.fromChoiceId && choiceIdMap.has(page.fromChoiceId)) {
        const newChoiceId = choiceIdMap.get(page.fromChoiceId);
        await tx.storyPage.updateMany({
          where: {
            storyId: clonedStory.id,
            pageOrder: page.pageOrder,
          },
          data: {
            fromChoiceId: newChoiceId,
          },
        });
      }
    }

    return clonedStory;
  });

  return getStoryById(user, publishedStory.id);
};

export default {
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
