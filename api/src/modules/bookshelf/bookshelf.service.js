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

  // Admin and Moderator have system-wide access
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
 * Get stories on child's bookshelf with reading progress
 * @param {Object} user - Authenticated user
 * @param {Object} query - Query parameters
 * @returns {Promise<Object>} Bookshelf items and pagination
 */
const getBookshelf = async (user, query) => {
  const childId = query.childId;
  const child = await verifyChildAccess(user, childId);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const storyWhere = {
    deletedAt: null,
    ...(query.search && {
      title: { contains: query.search, mode: 'insensitive' },
    }),
  };

  const [total, items] = await Promise.all([
    prisma.bookshelfItem.count({
      where: {
        childId: child.id,
        story: storyWhere,
      },
    }),
    prisma.bookshelfItem.findMany({
      where: {
        childId: child.id,
        story: storyWhere,
      },
      take: limit,
      skip,
      orderBy: { addedAt: 'desc' },
      include: {
        story: {
          select: {
            id: true,
            title: true,
            coverImageKey: true,
            kind: true,
            status: true,
            useAiImage: true,
            useTts: true,
            createdAt: true,
            template: {
              select: {
                id: true,
                title: true,
                ageMin: true,
                ageMax: true,
                primarySkill: {
                  select: {
                    id: true,
                    caselCode: true,
                    nameVi: true,
                    nameEn: true,
                  },
                },
              },
            },
            _count: {
              select: { pages: true },
            },
          },
        },
      },
    }),
  ]);

  // Fetch latest play session for each story to report reading progress
  const storyIds = items.map((item) => item.storyId);
  const latestSessions = await prisma.playSession.findMany({
    where: {
      childId: child.id,
      storyId: { in: storyIds },
    },
    orderBy: { lastActivityAt: 'desc' },
    include: {
      currentPage: {
        select: {
          id: true,
          pageOrder: true,
          pageKind: true,
        },
      },
    },
  });

  // Group latest session by storyId
  const sessionByStoryId = {};
  for (const session of latestSessions) {
    if (!sessionByStoryId[session.storyId]) {
      sessionByStoryId[session.storyId] = session;
    }
  }

  const formattedItems = items.map((item) => {
    const story = item.story;
    const session = sessionByStoryId[story.id];
    const totalPages = story._count.pages;
    const currentPageOrder = session?.currentPage?.pageOrder || 0;
    const isCompleted = session?.status === 'completed';

    let progressPercentage = 0;
    if (isCompleted) {
      progressPercentage = 100;
    } else if (totalPages > 0 && currentPageOrder > 0) {
      progressPercentage = Math.round((currentPageOrder / totalPages) * 100);
    }

    return {
      storyId: story.id,
      title: story.title,
      coverImageKey: story.coverImageKey,
      kind: story.kind,
      status: story.status,
      useAiImage: story.useAiImage,
      useTts: story.useTts,
      addedAt: item.addedAt,
      totalPages,
      template: story.template,
      readingProgress: session
        ? {
            sessionId: session.id,
            status: session.status,
            isCompleted,
            currentPageOrder,
            progressPercentage,
            lastActivityAt: session.lastActivityAt,
          }
        : null,
    };
  });

  return {
    child: {
      id: child.id,
      name: child.name,
    },
    items: formattedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Add a story to child's bookshelf
 * @param {Object} user - Authenticated user
 * @param {Object} payload - { childId, storyId }
 * @returns {Promise<Object>} Added bookshelf item
 */
const addToBookshelf = async (user, { childId, storyId }) => {
  const child = await verifyChildAccess(user, childId);

  const story = await prisma.story.findFirst({
    where: {
      id: storyId,
      deletedAt: null,
    },
    include: {
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
  });

  if (!story) {
    throw ApiError.notFound('Story not found');
  }

  // Access check: story is owned by parent OR is published
  const isOwner = story.ownerId === user.id;
  const isPublished = story.kind === 'published';
  const isElevated = ['admin', 'moderator'].includes(user.role);

  if (!isOwner && !isPublished && !isElevated) {
    throw ApiError.forbidden('You do not have permission to add this story');
  }

  // Check if already in bookshelf
  const existing = await prisma.bookshelfItem.findUnique({
    where: {
      childId_storyId: {
        childId: child.id,
        storyId: story.id,
      },
    },
  });

  if (existing) {
    return {
      childId: child.id,
      storyId: story.id,
      addedAt: existing.addedAt,
      alreadyInBookshelf: true,
      story: {
        id: story.id,
        title: story.title,
        coverImageKey: story.coverImageKey,
      },
    };
  }

  const newItem = await prisma.bookshelfItem.create({
    data: {
      childId: child.id,
      storyId: story.id,
    },
    include: {
      story: {
        select: {
          id: true,
          title: true,
          coverImageKey: true,
        },
      },
    },
  });

  return {
    childId: newItem.childId,
    storyId: newItem.storyId,
    addedAt: newItem.addedAt,
    alreadyInBookshelf: false,
    story: newItem.story,
  };
};

/**
 * Remove a story from child's bookshelf
 * @param {Object} user - Authenticated user
 * @param {Object} payload - { childId, storyId }
 * @returns {Promise<Object>} Success message
 */
const removeFromBookshelf = async (user, { childId, storyId }) => {
  const child = await verifyChildAccess(user, childId);

  const existing = await prisma.bookshelfItem.findUnique({
    where: {
      childId_storyId: {
        childId: child.id,
        storyId,
      },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Story is not in child bookshelf');
  }

  await prisma.bookshelfItem.delete({
    where: {
      childId_storyId: {
        childId: child.id,
        storyId,
      },
    },
  });

  return { message: 'Story removed from bookshelf successfully' };
};

/**
 * Check if a story is present in child's bookshelf
 * @param {Object} user - Authenticated user
 * @param {Object} payload - { childId, storyId }
 * @returns {Promise<Object>} Status info
 */
const checkBookshelf = async (user, { childId, storyId }) => {
  const child = await verifyChildAccess(user, childId);

  const existing = await prisma.bookshelfItem.findUnique({
    where: {
      childId_storyId: {
        childId: child.id,
        storyId,
      },
    },
  });

  return {
    childId: child.id,
    storyId,
    inBookshelf: !!existing,
    addedAt: existing?.addedAt || null,
  };
};

export default {
  verifyChildAccess,
  getBookshelf,
  addToBookshelf,
  removeFromBookshelf,
  checkBookshelf,
};
