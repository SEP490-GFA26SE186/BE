// Danh gia truyen (rev8 luong 4.6): chi phu huynh dang co quyen doc VA co be da doc het truyen moi danh gia
// (DBML product_reviews). Moi phu huynh mot danh gia / truyen (sua lai duoc). Nguoi ban tra loi mot lan.
// Bao cao danh gia -> content_reports.product_review_id; Specialist an danh gia (luong 7.3).
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

const TX = { timeout: 20000 };
const unprocessable = (message) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message);

/** Thẻ hiện cho người mua chọn. `beautiful_art` thuộc phần ảnh (đang hoãn) — giữ trong enum, chưa cho chọn. */
export const REVIEW_TAGS = ['child_liked', 'age_appropriate', 'clear_lesson', 'good_narration'];

/** "Ba mẹ Hương" — chi ten goi (tu cuoi), khong lo ho ten day du / email cua nguoi danh gia. */
const authorLabel = (fullName) => {
  const last = fullName?.trim().split(/\s+/).at(-1);
  return last ? `Ba mẹ ${last}` : 'Phụ huynh';
};

const formatReview = (r, viewerId) => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment,
  tags: r.tags.map((t) => t.tag),
  author: authorLabel(r.author?.fullName),
  mine: r.parentId === viewerId,
  sellerReply: r.sellerReply,
  sellerRepliedAt: r.sellerRepliedAt,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** Tinh lai diem truyen + diem nguoi ban tu danh gia chua bi an (trong transaction cua nguoi goi). */
async function recomputeRatings(tx, listingId) {
  const agg = await tx.productReview.aggregate({ where: { listingId, hiddenAt: null }, _avg: { rating: true }, _count: { _all: true } });
  const listing = await tx.listing.update({
    where: { id: listingId },
    data: { ratingAvg: agg._avg.rating, ratingCount: agg._count._all },
    select: { sellerId: true },
  });
  const sellerAgg = await tx.productReview.aggregate({ where: { hiddenAt: null, listing: { sellerId: listing.sellerId } }, _avg: { rating: true } });
  await tx.sellerProfile.update({ where: { userId: listing.sellerId }, data: { ratingAvg: sellerAgg._avg.rating } });
}

/** Phu huynh danh gia duoc chua: dang co quyen doc + co be da doc het (luot doc completed) ban dang ban. */
async function eligibility(db, user, listing) {
  const owns = await db.entitlement.findFirst({ where: { parentId: user.id, listingId: listing.id, revokedAt: null }, select: { id: true } });
  if (!owns) return { canReview: false, reason: 'not_owned' };
  const finished = await db.playSession.findFirst({
    where: { storyId: listing.publishedStoryId, status: 'completed', child: { parentId: user.id } },
    select: { id: true },
  });
  return finished ? { canReview: true, reason: null } : { canReview: false, reason: 'not_finished' };
}

const loadListing = async (db, listingId) => {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, publishedStoryId: true, sellerId: true, status: true } });
  if (!listing) throw ApiError.notFound('Không tìm thấy truyện.');
  return listing;
};

const REVIEW_INCLUDE = { tags: true, author: { select: { fullName: true } } };

/** GET /market/listings/:id/reviews — danh gia chua bi an, moi nhat truoc + quyen danh gia cua nguoi xem. */
export async function listReviews(user, listingId, { page = 1, limit = 10 } = {}) {
  const listing = await loadListing(prisma, listingId);
  const where = { listingId, hiddenAt: null };
  const [total, rows, mine, elig, dist] = await Promise.all([
    prisma.productReview.count({ where }),
    prisma.productReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: REVIEW_INCLUDE }),
    prisma.productReview.findUnique({ where: { listingId_parentId: { listingId, parentId: user.id } }, include: REVIEW_INCLUDE }),
    eligibility(prisma, user, listing),
    prisma.productReview.groupBy({ by: ['rating'], where, _count: { _all: true } }),
  ]);
  return {
    reviews: rows.map((r) => formatReview(r, user.id)),
    distribution: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, dist.find((d) => d.rating === n)?._count._all ?? 0])),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    myReview: mine ? { ...formatReview(mine, user.id), hidden: Boolean(mine.hiddenAt) } : null,
    ...elig,
    isSeller: listing.sellerId === user.id,
    tags: REVIEW_TAGS,
  };
}

/** PUT /market/listings/:id/review { rating, comment?, tags? } — tao hoac sua danh gia cua minh. */
export async function upsertReview(user, listingId, { rating, comment, tags = [] }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId}::uuid FOR UPDATE`;
    const listing = await loadListing(tx, listingId);
    if (listing.sellerId === user.id) throw unprocessable('Không tự đánh giá truyện của mình.');
    const elig = await eligibility(tx, user, listing);
    if (!elig.canReview) {
      throw unprocessable(elig.reason === 'not_owned' ? 'Chỉ ba mẹ đã mua truyện mới đánh giá được.' : 'Bé đọc hết truyện này rồi ba mẹ đánh giá nhé.');
    }
    const existing = await tx.productReview.findUnique({ where: { listingId_parentId: { listingId, parentId: user.id } } });
    if (existing?.hiddenAt) throw new ApiError(StatusCodes.FORBIDDEN, 'Đánh giá của ba mẹ đã bị ẩn do vi phạm quy định, không sửa được.');
    const data = { rating, comment: comment?.trim() || null };
    const review = existing
      ? await tx.productReview.update({ where: { id: existing.id }, data })
      : await tx.productReview.create({ data: { ...data, listingId, parentId: user.id } });
    await tx.productReviewTag.deleteMany({ where: { reviewId: review.id } });
    const unique = [...new Set(tags)].filter((t) => REVIEW_TAGS.includes(t));
    if (unique.length) await tx.productReviewTag.createMany({ data: unique.map((tag) => ({ reviewId: review.id, tag })) });
    await recomputeRatings(tx, listingId);
    const full = await tx.productReview.findUniqueOrThrow({ where: { id: review.id }, include: REVIEW_INCLUDE });
    return { review: formatReview(full, user.id), created: !existing };
  }, TX);
}

/** POST /market/reviews/:id/reply { reply } — nguoi ban tra loi mot lan. */
export async function replyReview(user, reviewId, { reply }) {
  const review = await prisma.productReview.findUnique({ where: { id: reviewId }, include: { listing: { select: { sellerId: true } } } });
  if (!review || review.hiddenAt) throw ApiError.notFound('Không tìm thấy đánh giá.');
  if (review.listing.sellerId !== user.id) throw ApiError.forbidden('Chỉ người bán của truyện mới trả lời được.');
  if (review.sellerReply) throw new ApiError(StatusCodes.CONFLICT, 'Ba mẹ đã trả lời đánh giá này rồi.');
  const updated = await prisma.productReview.update({
    where: { id: reviewId },
    data: { sellerReply: reply.trim(), sellerRepliedAt: new Date() },
    include: REVIEW_INCLUDE,
  });
  return { review: formatReview(updated, user.id) };
}

/** POST /market/reviews/:id/reports — bao cao danh gia (moi nguoi mot lan / danh gia). */
export async function reportReview(user, reviewId, { category, description }) {
  const review = await prisma.productReview.findUnique({ where: { id: reviewId }, select: { id: true, parentId: true, hiddenAt: true } });
  if (!review || review.hiddenAt) throw ApiError.notFound('Không tìm thấy đánh giá.');
  if (review.parentId === user.id) throw unprocessable('Không báo cáo đánh giá của chính mình.');
  if (await prisma.contentReport.findFirst({ where: { reporterId: user.id, productReviewId: reviewId }, select: { id: true } })) {
    throw new ApiError(StatusCodes.CONFLICT, 'Ba mẹ đã báo cáo đánh giá này rồi.');
  }
  const r = await prisma.contentReport.create({ data: { reporterId: user.id, productReviewId: reviewId, category, description: description?.trim() || null } });
  return { reportId: r.id };
}

/** POST /moderation/product-reviews/:id/hide — Specialist an danh gia vi pham; dong bao cao, tinh lai diem. */
export async function hideReview(moderator, reviewId, { now = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    const review = await tx.productReview.findUnique({ where: { id: reviewId }, select: { id: true, listingId: true, hiddenAt: true } });
    if (!review) throw ApiError.notFound('Không tìm thấy đánh giá.');
    if (review.hiddenAt) throw new ApiError(StatusCodes.CONFLICT, 'Đánh giá đã bị ẩn.');
    await tx.productReview.update({ where: { id: reviewId }, data: { hiddenAt: now, hiddenBy: moderator.id } });
    const { count } = await tx.contentReport.updateMany({
      where: { productReviewId: reviewId, status: 'open' },
      data: { status: 'resolved', handledBy: moderator.id, handledAt: now },
    });
    await recomputeRatings(tx, review.listingId);
    await tx.adminAuditLog.create({ data: { actorId: moderator.id, action: 'review.hide', targetType: 'product_review', targetId: reviewId, afterState: { reportsResolved: count } } });
    return { reviewId, hidden: true, reportsResolved: count };
  }, TX);
}

export default { listReviews, upsertReview, replyReview, reportReview, hideReview };
