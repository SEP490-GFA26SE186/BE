import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { buildShelf, readingProgress } from './lib/shelf.js';

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
 * Gia sach cua be (rev8): { child, items, pagination, counts, continueReading }.
 * query: { childId, page, limit, search, status: all|reading|completed|not_started, competency: all|<casel_code> }.
 * Lay het muc tren gia (vai chuc) roi loc / dem / phan trang trong bo nho — lib/shelf.js.
 */
const getBookshelf = async (user, query) => {
  const child = await verifyChildAccess(user, query.childId);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));

  const rows = await prisma.bookshelfItem.findMany({
    where: { childId: child.id, story: { deletedAt: null } },
    orderBy: { addedAt: 'desc' },
    select: {
      addedAt: true,
      story: {
        select: {
          id: true,
          title: true,
          kind: true,
          length: true,
          useAiImage: true,
          useTts: true,
          topic: { select: { title: true, skill: { select: { caselCode: true } } } },
          _count: { select: { pages: true } },
        },
      },
    },
  });

  // Lan choi gan nhat cua moi truyen (findMany da sap xep moi nhat truoc -> giu ban dau tien).
  const sessions = await prisma.playSession.findMany({
    where: { childId: child.id, storyId: { in: rows.map((r) => r.story.id) } },
    orderBy: { lastActivityAt: 'desc' },
    select: { storyId: true, status: true, lastActivityAt: true, currentPage: { select: { pageOrder: true } } },
  });
  const latest = new Map();
  for (const s of sessions) if (!latest.has(s.storyId)) latest.set(s.storyId, s);

  const items = rows.map(({ addedAt, story }) => {
    const session = latest.get(story.id);
    const totalPages = story._count.pages;
    return {
      storyId: story.id,
      title: story.title,
      kind: story.kind,
      length: story.length,
      totalPages,
      useTts: story.useTts,
      useAiImage: story.useAiImage,
      topic: { title: story.topic.title, competency: story.topic.skill.caselCode },
      addedAt,
      readingProgress: readingProgress(
        session && { ...session, currentPageOrder: session.currentPage?.pageOrder ?? null },
        totalPages,
      ),
    };
  });

  return {
    child: { id: child.id, name: child.name },
    ...buildShelf(items, { search: query.search, status: query.status, competency: query.competency, page, limit }),
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
