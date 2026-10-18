import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

const ELEVATED_ROLES = new Set(['moderator', 'admin']);

const notFound = () => ApiError.notFound('Không tìm thấy truyện.');

const findStory = (db, storyId) => db.story.findFirst({ where: { id: storyId, deletedAt: null } });

/**
 * Doc truyen: chu truyen, hoac moderator/admin. Nguoi khac thay 404 (khong lo truyen ton tai).
 * `db` la prisma hoac transaction client.
 */
export async function loadStoryForRead(user, storyId, db = prisma) {
  const story = await findStory(db, storyId);
  if (!story) throw notFound();
  if (story.ownerId !== user.id && !ELEVATED_ROLES.has(user.role)) throw notFound();
  return story;
}

/**
 * Chu truyen, bo qua trang thai. Dung cho xoa: xoa trong luc dang sinh la hop le (worker thay
 * truyen da xoa thi bo qua ket qua).
 */
export async function loadOwnedStory(user, storyId, db = prisma) {
  const story = await loadStoryForRead(user, storyId, db);
  if (story.ownerId !== user.id) {
    throw ApiError.forbidden('Chỉ phụ huynh tạo truyện mới được chỉnh sửa truyện này.');
  }
  return story;
}

/** Sua truyen: chi chu truyen; truyen dang `generating` -> 409. */
export async function loadStoryForWrite(user, storyId, db = prisma) {
  const story = await loadOwnedStory(user, storyId, db);
  if (story.status === 'generating') {
    throw ApiError.conflict('Truyện đang được AI viết, vui lòng đợi xong rồi chỉnh sửa.');
  }
  return story;
}

/**
 * Khoa dong truyen trong transaction roi kiem lai quyen ghi. Chan dua voi `POST /generate`
 * (doi status sang generating) giua luc kiem va luc ghi. `tx` bat buoc la transaction client.
 */
export async function lockForWrite(tx, user, storyId) {
  await tx.$queryRaw`SELECT id FROM stories WHERE id = ${storyId}::uuid FOR UPDATE`;
  return loadStoryForWrite(user, storyId, tx);
}
