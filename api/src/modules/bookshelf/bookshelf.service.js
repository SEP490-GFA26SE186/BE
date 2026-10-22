import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { loadReadiness, notReadyMessage } from '../stories/stories.narration.store.js';
import { buildShelf, readingProgress } from './lib/shelf.js';
import { COVER_SELECT, formatCover } from '../stories/lib/cover.js';

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

  // Admin and Specialist have system-wide access
  const isElevated = ['admin', 'specialist'].includes(user.role);

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
          ...COVER_SELECT,
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
      // topic_id tuy chon voi truyen tu viet (custom)
      topic: story.topic ? { title: story.topic.title, competency: story.topic.skill.caselCode } : null,
      cover: formatCover(story),
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

/** Phu huynh duoc dua truyen nay len gia: truyen rieng cua minh, hoac ban dang ban da mua (entitlement). */
async function canShelve(user, story) {
  if (story.kind === 'private') return story.ownerId === user.id;
  const listing = await prisma.listing.findUnique({ where: { publishedStoryId: story.id }, select: { id: true } });
  if (!listing) return false;
  return Boolean(await prisma.entitlement.findFirst({ where: { parentId: user.id, listingId: listing.id, revokedAt: null }, select: { id: true } }));
}

/**
 * Dua truyen len gia sach cua be (rev8). Truyen rieng cua phu huynh, hoac ban dang ban da mua (dung
 * nguyen trang, DBML). Phai "san sang cho tre": da hoan tat + du giong doc khop chu (spec TTS §5.5)
 * -> 422 kem tien do neu chua. Da co tren gia -> tra lai muc cu (idempotent).
 */
const addToBookshelf = async (user, { childId, storyId }) => {
  const child = await verifyChildAccess(user, childId);
  const check = await loadReadiness(prisma, storyId);
  if (!check || !(await canShelve(user, check.story))) throw ApiError.notFound('Không tìm thấy truyện.');
  if (!check.ready) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, notReadyMessage(check), [
      { path: 'storyId', message: check.reason, narration: check.narration },
    ]);
  }

  const key = { childId_storyId: { childId: child.id, storyId } };
  const existing = await prisma.bookshelfItem.findUnique({ where: key });
  const item = existing ?? (await prisma.bookshelfItem.create({ data: { childId: child.id, storyId } }));
  return {
    childId: child.id,
    storyId,
    addedAt: item.addedAt,
    alreadyInBookshelf: Boolean(existing),
    story: { id: storyId, title: check.story.title },
  };
};

/** Bo truyen khoi gia sach. Lich su doc (play_sessions) giu nguyen. */
const removeFromBookshelf = async (user, { childId, storyId }) => {
  const child = await verifyChildAccess(user, childId);
  const { count } = await prisma.bookshelfItem.deleteMany({ where: { childId: child.id, storyId } });
  if (count === 0) throw ApiError.notFound('Truyện không có trên giá sách của bé.');
  return { message: 'Đã bỏ truyện khỏi giá sách' };
};

/** Truyen co tren gia cua be nao (cua phu huynh nay) — cho nut "Dua len gia sach" o editor. */
const checkBookshelf = async (user, { childId, storyId }) => {
  const children = childId ? [await verifyChildAccess(user, childId)] : await prisma.childProfile.findMany({
    where: { parentId: user.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const rows = await prisma.bookshelfItem.findMany({
    where: { storyId, childId: { in: children.map((c) => c.id) } },
    select: { childId: true, addedAt: true },
  });
  const added = new Map(rows.map((r) => [r.childId, r.addedAt]));
  return {
    storyId,
    children: children.map((c) => ({ childId: c.id, name: c.name, inBookshelf: added.has(c.id), addedAt: added.get(c.id) ?? null })),
  };
};

export default {
  verifyChildAccess,
  getBookshelf,
  addToBookshelf,
  removeFromBookshelf,
  checkBookshelf,
};
