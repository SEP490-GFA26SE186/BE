// Dang ban + kiem duyet (rev8 luong 3). Nguoi ban = phu huynh co goi `can_sell` va ho so ban da duyet.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { formatStoryDetail, STORY_DETAIL_INCLUDE } from '../stories/lib/storyFormat.js';
import { findReviewGaps } from '../stories/lib/editorRules.js';
import {
  CLAIM_MINUTES,
  LISTING_STATUS_BY_DECISION,
  aliasErrors,
  claimedByOther,
  leftoverNameErrors,
  reviewProgress,
} from './lib/publish.js';

const TX = { timeout: 20000 };
const unprocessable = (message, errors = []) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message, errors);
const vnd = (v) => (v == null ? null : Number(v));

const formatSeller = (s) =>
  s && { userId: s.userId, displayName: s.displayName, bio: s.bio, expertise: s.expertise, status: s.status, reviewedAt: s.reviewedAt, createdAt: s.createdAt };

const formatListing = (l) => ({
  id: l.id,
  title: l.title,
  description: l.description,
  status: l.status,
  priceVnd: vnd(l.priceTier?.priceVnd),
  priceTierId: l.priceTierId,
  hasAiContent: l.hasAiContent,
  publishedStoryId: l.publishedStoryId,
  sourceStoryId: l.publishedStory?.sourceStoryId ?? null,
  submittedAt: l.submittedAt,
  publishedAt: l.publishedAt,
  lastDecision: l.moderationReviews?.[0]
    ? { decision: l.moderationReviews[0].decision, comment: l.moderationReviews[0].comment, decidedAt: l.moderationReviews[0].decidedAt }
    : null,
});

const LISTING_INCLUDE = {
  priceTier: true,
  publishedStory: { select: { sourceStoryId: true } },
  moderationReviews: { where: { decidedAt: { not: null } }, orderBy: { decidedAt: 'desc' }, take: 1 },
};

async function activePlan(userId) {
  const sub = await prisma.subscription.findFirst({ where: { parentId: userId, status: 'active' }, include: { plan: true } });
  return sub?.plan ?? null;
}

// ---------------------------------------------------------------------------
// Nguoi ban
// ---------------------------------------------------------------------------

export async function getMySeller(user) {
  const [seller, plan] = await Promise.all([prisma.sellerProfile.findUnique({ where: { userId: user.id } }), activePlan(user.id)]);
  return { seller: formatSeller(seller), planCanSell: Boolean(plan?.canSell) };
}

/** Nop / nop lai ho so ban (bi tu choi thi nop lai duoc). Can goi `can_sell`. */
export async function applySeller(user, { displayName, bio, expertise }) {
  const plan = await activePlan(user.id);
  if (!plan?.canSell) throw unprocessable('Gói hiện tại chưa cho phép đăng bán. Ba mẹ nâng cấp gói Gia đình để đăng bán truyện.');
  const existing = await prisma.sellerProfile.findUnique({ where: { userId: user.id } });
  if (existing && ['pending', 'approved'].includes(existing.status)) {
    throw new ApiError(StatusCodes.CONFLICT, existing.status === 'approved' ? 'Ba mẹ đã là người bán.' : 'Hồ sơ đang chờ duyệt.');
  }
  if (existing?.status === 'suspended') throw ApiError.forbidden('Tài khoản bán đang bị tạm khoá.');
  const data = { displayName: displayName.trim(), bio: bio?.trim() || null, expertise: expertise?.trim() || null, status: 'pending', reviewedBy: null, reviewedAt: null };
  const seller = await prisma.sellerProfile.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
  return { seller: formatSeller(seller) };
}

export async function listSellerApplications({ status = 'pending' } = {}) {
  const rows = await prisma.sellerProfile.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { email: true, fullName: true } } },
  });
  return rows.map((s) => ({ ...formatSeller(s), email: s.user.email, fullName: s.user.fullName }));
}

export async function decideSeller(moderator, userId, { approve }) {
  const { count } = await prisma.sellerProfile.updateMany({
    where: { userId, status: 'pending' },
    data: { status: approve ? 'approved' : 'rejected', reviewedBy: moderator.id, reviewedAt: new Date() },
  });
  if (count === 0) throw ApiError.notFound('Không có hồ sơ đang chờ duyệt.');
  return { seller: formatSeller(await prisma.sellerProfile.findUnique({ where: { userId } })) };
}

// ---------------------------------------------------------------------------
// Dang ban
// ---------------------------------------------------------------------------

export async function listPriceTiers() {
  const tiers = await prisma.priceTier.findMany({ where: { isActive: true }, orderBy: { priceVnd: 'asc' } });
  return tiers.map((t) => ({ id: t.id, label: t.label, priceVnd: vnd(t.priceVnd) }));
}

/** Ten that bi cam trong ban dang ban: moi nhan vat + moi be cua nguoi ban. */
async function forbiddenNamesOf(userId) {
  const [characters, children] = await Promise.all([
    prisma.character.findMany({ where: { parentId: userId }, select: { name: true } }),
    prisma.childProfile.findMany({ where: { parentId: userId }, select: { name: true } }),
  ]);
  return [...new Set([...characters, ...children].map((x) => x.name).filter(Boolean))];
}

/**
 * POST /listings { storyId, title, description?, priceTierId, aliases: [{ token, aliasName }] }
 * Truyen rieng da hoan tat -> ban sao `published` (go ca nhan hoa) + listing `submitted` + luot duyet.
 */
export async function createListing(user, body) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId: user.id } });
  if (seller?.status !== 'approved') throw ApiError.forbidden('Ba mẹ cần được duyệt hồ sơ người bán trước khi đăng bán.');
  const plan = await activePlan(user.id);
  if (!plan?.canSell) throw unprocessable('Gói hiện tại chưa cho phép đăng bán.');

  const tier = await prisma.priceTier.findFirst({ where: { id: body.priceTierId, isActive: true } });
  if (!tier) throw ApiError.badRequest('Mức giá không hợp lệ.');

  const story = await prisma.story.findFirst({
    where: { id: body.storyId, ownerId: user.id, kind: 'private', deletedAt: null },
    include: { scenes: true, pages: true, checkpoints: { include: { options: true } }, storyCharacters: true, aiRequests: { select: { id: true }, take: 1 } },
  });
  if (!story) throw ApiError.notFound('Không tìm thấy truyện.');
  if (!story.reviewedAt) throw unprocessable('Hãy bấm hoàn tất truyện trước khi đăng bán.');
  const gaps = findReviewGaps({ pages: story.pages, checkpoints: story.checkpoints });
  if (gaps.length) throw unprocessable('Truyện còn chỗ chưa viết xong.', gaps);

  const forbidden = await forbiddenNamesOf(user.id);
  const errors = [...aliasErrors(story.storyCharacters, body.aliases, forbidden), ...leftoverNameErrors(story, forbidden, body.title)];
  if (errors.length) throw unprocessable('Chưa gỡ hết thông tin cá nhân của gia đình.', errors);

  const aliasOf = new Map(body.aliases.map((a) => [a.token, a.aliasName.normalize('NFC').trim()]));
  const listing = await prisma.$transaction(async (tx) => {
    const copy = await tx.story.create({
      data: {
        ownerId: user.id,
        kind: 'published',
        sourceStoryId: story.id,
        topicId: story.topicId,
        length: story.length,
        title: body.title.trim(),
        situation: null, // chuyen that cua gia dinh khong theo ban dang ban
        useAiImage: false,
        useTts: false, // audio cua ban rieng chua ten that (spec TTS §7)
        status: 'ready',
        reviewedAt: new Date(),
        storyCharacters: { create: story.storyCharacters.map((c) => ({ token: c.token, aliasName: aliasOf.get(c.token), isMain: c.isMain })) },
      },
    });
    const sceneId = new Map();
    for (const s of story.scenes) {
      const created = await tx.storyScene.create({ data: { storyId: copy.id, sceneOrder: s.sceneOrder, description: s.description } });
      sceneId.set(s.id, created.id);
    }
    const pageId = new Map();
    for (const p of story.pages) {
      const created = await tx.storyPage.create({
        data: { storyId: copy.id, pageOrder: p.pageOrder, sceneId: sceneId.get(p.sceneId), contentText: p.contentText, origin: p.origin },
      });
      pageId.set(p.id, created.id);
    }
    for (const c of story.checkpoints) {
      await tx.storyCheckpoint.create({
        data: {
          storyId: copy.id,
          afterPageId: pageId.get(c.afterPageId),
          type: c.type,
          targetToken: c.targetToken,
          question: c.question,
          answerEmotion: c.answerEmotion,
          hint: c.hint,
          origin: c.origin,
          options: { create: c.options.map((o) => ({ optionOrder: o.optionOrder, text: o.text, role: o.role, isCorrect: o.isCorrect, feedback: o.feedback })) },
        },
      });
    }
    const created = await tx.listing.create({
      data: {
        sellerId: user.id,
        publishedStoryId: copy.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        priceTierId: tier.id,
        status: 'submitted',
        hasAiContent: story.length !== 'custom' || story.aiRequests.length > 0,
      },
    });
    await tx.moderationReview.create({ data: { listingId: created.id, reviewType: 'submission' } });
    return tx.listing.findUniqueOrThrow({ where: { id: created.id }, include: LISTING_INCLUDE });
  }, TX);
  return { listing: formatListing(listing) };
}

export async function getMyListings(user) {
  const rows = await prisma.listing.findMany({ where: { sellerId: user.id }, orderBy: { submittedAt: 'desc' }, include: LISTING_INCLUDE });
  return rows.map(formatListing);
}

// ---------------------------------------------------------------------------
// Kiem duyet
// ---------------------------------------------------------------------------

/** Hang doi: luot duyet chua quyet, cu nhat truoc. */
export async function getQueue(moderator, { now = new Date() } = {}) {
  const rows = await prisma.moderationReview.findMany({
    where: { decidedAt: null, listing: { status: { in: ['submitted', 'in_review'] } } },
    orderBy: { createdAt: 'asc' },
    include: {
      listing: {
        include: {
          priceTier: true,
          seller: { select: { displayName: true } },
          publishedStory: { select: { length: true, topic: { select: { title: true, skill: { select: { caselCode: true } } } }, _count: { select: { pages: true } } } },
        },
      },
      moderator: { select: { id: true, fullName: true } },
    },
  });
  return rows.map((r) => ({
    reviewId: r.id,
    reviewType: r.reviewType,
    listingId: r.listingId,
    title: r.listing.title,
    seller: r.listing.seller.displayName,
    priceVnd: vnd(r.listing.priceTier.priceVnd),
    topic: r.listing.publishedStory.topic.title,
    competency: r.listing.publishedStory.topic.skill.caselCode,
    pageCount: r.listing.publishedStory._count.pages,
    hasAiContent: r.listing.hasAiContent,
    submittedAt: r.listing.submittedAt,
    claimedBy: r.claimExpiresAt && r.claimExpiresAt > now ? { id: r.moderator?.id, name: r.moderator?.fullName, mine: r.moderatorId === moderator.id } : null,
  }));
}

async function loadReview(reviewId, db = prisma) {
  const review = await db.moderationReview.findUnique({
    where: { id: reviewId },
    include: { listing: { include: { priceTier: true, seller: { select: { displayName: true } } } }, pageViews: true, checklistResults: true },
  });
  if (!review) throw ApiError.notFound('Không tìm thấy lượt duyệt.');
  return review;
}

/** Nhan bai (giu CLAIM_MINUTES phut). Nguoi khac dang giu -> 409. Lan dau nhan -> listing in_review. */
export async function claimReview(moderator, reviewId, { now = new Date() } = {}) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM moderation_reviews WHERE id = ${reviewId}::uuid FOR UPDATE`;
    const review = await loadReview(reviewId, tx);
    if (review.decidedAt) throw new ApiError(StatusCodes.CONFLICT, 'Bài này đã được quyết định.');
    if (claimedByOther(review, moderator.id, now)) throw new ApiError(StatusCodes.CONFLICT, 'Moderator khác đang duyệt bài này.');
    await tx.moderationReview.update({
      where: { id: reviewId },
      data: { moderatorId: moderator.id, claimedAt: now, claimExpiresAt: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
    });
    await tx.listing.updateMany({ where: { id: review.listingId, status: 'submitted' }, data: { status: 'in_review' } });
  }, TX);
  return getReview(moderator, reviewId, { now });
}

async function assertClaimed(moderator, review, now) {
  if (review.decidedAt) throw new ApiError(StatusCodes.CONFLICT, 'Bài này đã được quyết định.');
  if (review.moderatorId !== moderator.id || !review.claimExpiresAt || review.claimExpiresAt <= now) {
    throw new ApiError(StatusCodes.CONFLICT, 'Hãy nhận bài (hoặc nhận lại vì đã quá thời gian giữ) trước khi duyệt.');
  }
}

/** Chi tiet luot duyet: noi dung ban dang ban (ten chung), checklist, trang da xem, tien do. */
export async function getReview(moderator, reviewId, { now = new Date() } = {}) {
  const review = await loadReview(reviewId);
  const [story, items] = await Promise.all([
    prisma.story.findUniqueOrThrow({ where: { id: review.listing.publishedStoryId }, include: STORY_DETAIL_INCLUDE }),
    prisma.checklistItem.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } }),
  ]);
  const detail = formatStoryDetail(story);
  return {
    review: {
      id: review.id,
      reviewType: review.reviewType,
      decision: review.decision,
      comment: review.comment,
      decidedAt: review.decidedAt,
      claimedByMe: review.moderatorId === moderator.id && review.claimExpiresAt > now,
      claimExpiresAt: review.claimExpiresAt,
    },
    listing: formatListing({ ...review.listing, publishedStory: { sourceStoryId: null } }),
    seller: review.listing.seller.displayName,
    story: detail,
    checklist: items.map((i) => ({
      id: i.id,
      code: i.code,
      description: i.description,
      passed: review.checklistResults.find((r) => r.checklistItemId === i.id)?.passed ?? null,
    })),
    pageViews: review.pageViews.map((v) => ({ pageId: v.pageId, viewedAt: v.viewedAt, comment: v.comment })),
    progress: reviewProgress(detail.pages.map((p) => p.id), review.pageViews.map((v) => v.pageId), items.map((i) => i.id), review.checklistResults),
  };
}

/** Danh dau da xem mot trang (+ nhan xet tuy chon, gom ca diem dung ngay sau trang). */
export async function viewPage(moderator, reviewId, pageId, { comment } = {}, { now = new Date() } = {}) {
  const review = await loadReview(reviewId);
  await assertClaimed(moderator, review, now);
  const page = await prisma.storyPage.findFirst({ where: { id: pageId, storyId: review.listing.publishedStoryId }, select: { id: true } });
  if (!page) throw ApiError.notFound('Trang không thuộc truyện đang duyệt.');
  const text = comment?.trim() || null;
  await prisma.reviewPageView.upsert({
    where: { reviewId_pageId: { reviewId, pageId } },
    create: { reviewId, pageId, comment: text },
    update: comment === undefined ? {} : { comment: text },
  });
  return getReview(moderator, reviewId, { now });
}

/**
 * Quyet dinh. body: { decision: approved|changes_requested|rejected, comment?, checklist: [{ itemId, passed }] }.
 * approved: phai xem 100% trang + dat du checklist. changes_requested / rejected: bat buoc nhan xet.
 */
export async function decide(moderator, reviewId, body, { now = new Date() } = {}) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM moderation_reviews WHERE id = ${reviewId}::uuid FOR UPDATE`;
    const review = await loadReview(reviewId, tx);
    await assertClaimed(moderator, review, now);
    const items = await tx.checklistItem.findMany({ where: { isActive: true }, select: { id: true } });
    const known = new Set(items.map((i) => i.id));
    for (const r of body.checklist ?? []) {
      if (!known.has(r.itemId)) throw ApiError.badRequest('Mục checklist không hợp lệ.');
      await tx.reviewChecklistResult.upsert({
        where: { reviewId_checklistItemId: { reviewId, checklistItemId: r.itemId } },
        create: { reviewId, checklistItemId: r.itemId, passed: r.passed },
        update: { passed: r.passed },
      });
    }
    const [pages, results] = await Promise.all([
      tx.storyPage.findMany({ where: { storyId: review.listing.publishedStoryId }, select: { id: true } }),
      tx.reviewChecklistResult.findMany({ where: { reviewId } }),
    ]);
    const progress = reviewProgress(pages.map((p) => p.id), review.pageViews.map((v) => v.pageId), items.map((i) => i.id), results);
    if (body.decision === 'approved' && !progress.canApprove) {
      throw unprocessable(`Cần xem hết ${progress.pagesTotal} trang (đã xem ${progress.pagesViewed}) và đạt đủ ${progress.checklistTotal} mục checklist (đạt ${progress.checklistPassed}) trước khi duyệt.`);
    }
    if (body.decision !== 'approved' && !body.comment?.trim()) throw unprocessable('Hãy ghi nhận xét để người bán biết cần sửa gì.');

    await tx.moderationReview.update({ where: { id: reviewId }, data: { decision: body.decision, comment: body.comment?.trim() || null, decidedAt: now } });
    await tx.listing.update({
      where: { id: review.listingId },
      data: { status: LISTING_STATUS_BY_DECISION[body.decision], ...(body.decision === 'approved' && { publishedAt: now }) },
    });
  }, TX);
  return getReview(moderator, reviewId, { now });
}

export default {
  getMySeller, applySeller, listSellerApplications, decideSeller,
  listPriceTiers, createListing, getMyListings,
  getQueue, claimReview, getReview, viewPage, decide,
};
