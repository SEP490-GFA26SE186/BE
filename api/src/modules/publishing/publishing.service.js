// Dang ban + kiem duyet (rev8 luong 3). Nguoi ban = phu huynh co goi `can_sell` va ho so ban da duyet.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { formatStoryDetail, STORY_DETAIL_INCLUDE } from '../stories/lib/storyFormat.js';
import { findReviewGaps } from '../stories/lib/editorRules.js';
import { COVER_SELECT, coverImageKey, formatCover } from '../stories/lib/cover.js';
import { dispatchNarration, prepareNarration } from '../stories/stories.narration.service.js';
import { loadReadiness, loadVoice, reuseNarration } from '../stories/stories.narration.store.js';
import {
  CLAIM_MINUTES,
  PRICE_RULE_MESSAGE,
  aliasErrors,
  claimedByOther,
  leftoverNameErrors,
  reviewProgress,
  validPriceVnd,
} from './lib/publish.js';
import { DECISIONS_BY_REVIEW_TYPE, LISTING_STATUS_BY_DECISION } from '../monitoring/lib/monitoring.js';
import { closeOpenReports, issueStrikeTx } from '../monitoring/monitoring.service.js';

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
  priceVnd: vnd(l.priceVnd),
  hasAiContent: l.hasAiContent,
  hasNarration: Boolean(l.publishedStory?.useTts),
  cover: formatCover(l.publishedStory ?? {}, { imageKey: l.coverImageKey }),
  publishedStoryId: l.publishedStoryId,
  sourceStoryId: l.publishedStory?.sourceStoryId ?? null,
  previousListingId: l.previousListingId ?? null, // phien ban moi thay cho listing nay khi duoc duyet
  submittedAt: l.submittedAt,
  publishedAt: l.publishedAt,
  lastDecision: l.moderationReviews?.[0]
    ? { decision: l.moderationReviews[0].decision, comment: l.moderationReviews[0].comment, decidedAt: l.moderationReviews[0].decidedAt }
    : null,
});

const LISTING_INCLUDE = {
  publishedStory: { select: { sourceStoryId: true, useTts: true, ...COVER_SELECT } },
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

/**
 * PUT /sellers/me — sua ho so ban khi dang cho duyet hoac da duyet (khong can duyet lai: biet danh chi la ten
 * hien thi; Specialist van thay ho so moi o trang duyet nguoi ban). Bi tu choi -> nop lai bang /apply.
 */
export async function updateMySeller(user, { displayName, bio, expertise }) {
  const existing = await prisma.sellerProfile.findUnique({ where: { userId: user.id } });
  if (!existing) throw ApiError.notFound('Ba mẹ chưa có hồ sơ bán.');
  if (!['pending', 'approved'].includes(existing.status)) {
    throw new ApiError(StatusCodes.CONFLICT, existing.status === 'suspended' ? 'Tài khoản bán đang bị tạm khoá.' : 'Hồ sơ bị từ chối: hãy nộp lại hồ sơ.');
  }
  const data = {
    ...(displayName !== undefined && { displayName: displayName.trim() }),
    ...(bio !== undefined && { bio: bio.trim() || null }),
    ...(expertise !== undefined && { expertise: expertise.trim() || null }),
  };
  const seller = await prisma.sellerProfile.update({ where: { userId: user.id }, data });
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

/** Ten that bi cam trong ban dang ban: moi nhan vat + moi be cua nguoi ban. */
async function forbiddenNamesOf(userId) {
  const [characters, children] = await Promise.all([
    prisma.character.findMany({ where: { parentId: userId }, select: { name: true } }),
    prisma.childProfile.findMany({ where: { parentId: userId }, select: { name: true } }),
  ]);
  return [...new Set([...characters, ...children].map((x) => x.name).filter(Boolean))];
}

/**
 * POST /listings { storyId, title, description?, priceVnd, aliases: [{ token, aliasName }] }
 * priceVnd: 0 = mien phi (don 0d) hoac 5.000-500.000, boi 1.000 (validPriceVnd).
 * Truyen rieng da hoan tat -> ban sao `published` (go ca nhan hoa) + listing `submitted` + luot duyet.
 * Ban rieng bat giong doc -> ban sao cung bat va SINH LAI giong doc bang ten chung (audio cu chua ten that,
 * khong dung lai duoc). Phien ban moi (previousListingId) dung lai audio cua ban dang ban o doan chu khong doi
 * (reuseNarration), chi doc lai doan da sua. Specialist chi nhan duyet khi giong doc xong (claimReview).
 */
export async function createListing(user, body, narrationOptions, { previousListingId = null } = {}) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId: user.id } });
  if (seller?.status !== 'approved') throw ApiError.forbidden('Ba mẹ cần được duyệt hồ sơ người bán trước khi đăng bán.');
  const plan = await activePlan(user.id);
  if (!plan?.canSell) throw unprocessable('Gói hiện tại chưa cho phép đăng bán.');

  if (!validPriceVnd(body.priceVnd)) throw unprocessable(PRICE_RULE_MESSAGE);

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
  const { listing, jobs } = await prisma.$transaction(async (tx) => {
    const copy = await tx.story.create({
      data: {
        ownerId: user.id,
        kind: 'published',
        sourceStoryId: story.id,
        topicId: story.topicId,
        length: story.length,
        title: body.title.trim(),
        situation: null, // chuyen that cua gia dinh khong theo ban dang ban
        // Loi vao + co cham theo truyen goc; khoanh khac / tinh tiet (chuyen that) khong theo ban dang ban.
        entry: story.entry,
        scored: story.scored,
        useAiImage: story.useAiImage, // tranh ve tu mo ta ngoai hinh, khong co ten -> theo sang ban dang ban
        useTts: story.useTts, // theo lua chon cua tac gia; audio sinh lai bang ten chung ben duoi
        status: 'ready',
        reviewedAt: new Date(),
        storyCharacters: { create: story.storyCharacters.map((c) => ({ token: c.token, aliasName: aliasOf.get(c.token), isMain: c.isMain })) },
      },
    });
    const sceneId = new Map();
    for (const s of story.scenes) {
      const ready = s.imageStatus === 'ready' && s.imageKey;
      const created = await tx.storyScene.create({ data: { storyId: copy.id, sceneOrder: s.sceneOrder, description: s.description, imageKey: ready ? s.imageKey : null, imageStatus: ready ? 'ready' : 'none' } });
      sceneId.set(s.id, created.id);
    }
    // Anh bia theo truyen goc: canh da chon -> canh tuong ung cua ban sao.
    if (story.coverSceneId && sceneId.has(story.coverSceneId)) {
      await tx.story.update({ where: { id: copy.id }, data: { coverSceneId: sceneId.get(story.coverSceneId) } });
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
          // Giu truy vet cham diem cua nguon; reviewedOk* la soat rieng cua tung ban, khong chep.
          subSkillId: c.subSkillId,
          templateVersionId: c.templateVersionId,
          scored: c.scored,
          excluded: c.excluded,
          excludedReason: c.excludedReason,
          excludedBy: c.excludedBy,
          excludedAt: c.excludedAt,
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
        coverImageKey: coverImageKey(story), // canh bia da chon hoac canh 1, neu da co anh
        priceVnd: BigInt(body.priceVnd),
        status: 'submitted',
        hasAiContent: story.length !== 'custom' || story.aiRequests.length > 0,
        previousListingId,
      },
    });
    await tx.moderationReview.create({ data: { listingId: created.id, reviewType: 'submission' } });
    if (previousListingId && story.useTts) {
      const live = await tx.listing.findUniqueOrThrow({ where: { id: previousListingId }, select: { publishedStoryId: true } });
      await reuseNarration(tx, copy.id, live.publishedStoryId, await loadVoice(tx));
    }
    return {
      listing: await tx.listing.findUniqueOrThrow({ where: { id: created.id }, include: LISTING_INCLUDE }),
      jobs: await prepareNarration(tx, copy.id),
    };
  }, TX);
  await dispatchNarration(jobs, narrationOptions); // Redis loi -> clip failed, nguoi ban bam thu lai
  return { listing: await withNarration(formatListing(listing)) };
}

// ---------------------------------------------------------------------------
// Phien ban (phieu dang ky: "manage published versions")
// ---------------------------------------------------------------------------

const PENDING_VERSION = ['submitted', 'in_review'];

/**
 * POST /listings/:listingId/versions { storyId?, title, description?, priceVnd, aliases } — dang phien ban moi
 * cua truyen DANG BAN. Ban dang ban van ban binh thuong trong luc phien ban moi cho duyet. `storyId` mac dinh
 * la truyen rieng goc (nguoi ban sua truyen goc roi cap nhat). Moi luc mot phien ban cho duyet.
 */
export async function createListingVersion(user, listingId, body, narrationOptions) {
  const live = await prisma.listing.findFirst({
    where: { id: listingId, sellerId: user.id },
    include: { publishedStory: { select: { sourceStoryId: true } } },
  });
  if (!live) throw ApiError.notFound('Không tìm thấy truyện đang bán.');
  if (live.status !== 'published') throw new ApiError(StatusCodes.CONFLICT, 'Chỉ cập nhật phiên bản cho truyện đang bán.');
  const pending = await prisma.listing.findFirst({ where: { previousListingId: live.id, status: { in: PENDING_VERSION } }, select: { id: true } });
  if (pending) throw new ApiError(StatusCodes.CONFLICT, 'Truyện này đang có một phiên bản mới chờ duyệt.');
  const storyId = body.storyId ?? live.publishedStory.sourceStoryId;
  if (!storyId) throw unprocessable('Chọn truyện dùng cho phiên bản mới.');
  return createListing(user, { ...body, storyId }, narrationOptions, { previousListingId: live.id });
}

/**
 * Phien ban moi duoc duyet -> thay ban cu: quyen doc, danh gia, bo dem chuyen sang ban moi; gia sach cua be
 * doi sang ban moi; ban cu `archived` (het hien tren cho). Lich su doc / diem EQ giu tren truyen cu.
 */
async function promoteVersion(tx, listing) {
  const prev = await tx.listing.findUnique({ where: { id: listing.previousListingId } });
  if (!prev || !['published', 'suspended'].includes(prev.status)) return;
  await tx.entitlement.updateMany({ where: { listingId: prev.id }, data: { listingId: listing.id } });
  await tx.productReview.updateMany({ where: { listingId: prev.id }, data: { listingId: listing.id } });
  await tx.bookshelfItem.updateMany({ where: { storyId: prev.publishedStoryId }, data: { storyId: listing.publishedStoryId } });
  await tx.listing.update({
    where: { id: listing.id },
    data: {
      purchaseCount: { increment: prev.purchaseCount },
      freeClaimCount: { increment: prev.freeClaimCount },
      ratingAvg: prev.ratingAvg,
      ratingCount: prev.ratingCount,
    },
  });
  await tx.listing.update({ where: { id: prev.id }, data: { status: 'archived' } });
}

/** Phien ban dang ban hien tai cua mot listing (di theo chuoi previous_listing_id ve phia moi nhat). */
export async function currentVersion(db, listingId) {
  let current = await db.listing.findUnique({ where: { id: listingId } });
  for (let i = 0; current && i < 20; i += 1) {
    const next = await db.listing.findFirst({ where: { previousListingId: current.id, status: { in: ['published', 'suspended'] } } });
    if (!next) break;
    current = next;
  }
  return current;
}

/** Tien do giong doc cua ban dang ban (nguoi ban + Specialist thay; Specialist chi duyet khi xong). */
async function withNarration(listing) {
  if (!listing.hasNarration) return { ...listing, narration: null };
  const check = await loadReadiness(prisma, listing.publishedStoryId);
  return { ...listing, narration: check?.narration ?? null };
}

export async function getMyListings(user) {
  const rows = await prisma.listing.findMany({ where: { sellerId: user.id }, orderBy: { submittedAt: 'desc' }, include: LISTING_INCLUDE });
  return Promise.all(rows.map((r) => withNarration(formatListing(r))));
}

// ---------------------------------------------------------------------------
// Kiem duyet
// ---------------------------------------------------------------------------

/**
 * Hang doi: luot duyet chua quyet, cu nhat truoc. Gom luot nop ban (submission) va hau kiem tren truyen
 * da ban: bao cao (report_followup, truyen dang tam go) + kiem tra ngau nhien (random_audit).
 */
export async function getQueue(moderator, { now = new Date() } = {}) {
  const rows = await prisma.moderationReview.findMany({
    where: { decidedAt: null, listing: { status: { in: ['submitted', 'in_review', 'published', 'suspended'] } } },
    orderBy: { createdAt: 'asc' },
    include: {
      listing: {
        include: {
          seller: { select: { displayName: true } },
          publishedStory: { select: { length: true, useTts: true, topic: { select: { title: true, skill: { select: { caselCode: true } } } }, _count: { select: { pages: true } } } },
          _count: { select: { contentReports: { where: { status: 'open' } } } },
        },
      },
      moderator: { select: { id: true, fullName: true } },
    },
  });
  const narrationOf = new Map();
  for (const r of rows) {
    if (r.listing.publishedStory.useTts) narrationOf.set(r.id, (await loadReadiness(prisma, r.listing.publishedStoryId))?.narration ?? null);
  }
  return rows.map((r) => ({
    reviewId: r.id,
    hasNarration: r.listing.publishedStory.useTts,
    narration: narrationOf.get(r.id) ?? null,
    reviewType: r.reviewType,
    listingId: r.listingId,
    title: r.listing.title,
    seller: r.listing.seller.displayName,
    priceVnd: vnd(r.listing.priceVnd),
    topic: r.listing.publishedStory.topic?.title ?? null,
    competency: r.listing.publishedStory.topic?.skill.caselCode ?? null,
    pageCount: r.listing.publishedStory._count.pages,
    hasAiContent: r.listing.hasAiContent,
    listingStatus: r.listing.status,
    openReports: r.listing._count.contentReports,
    submittedAt: r.listing.submittedAt,
    createdAt: r.createdAt,
    claimedBy: r.claimExpiresAt && r.claimExpiresAt > now ? { id: r.moderator?.id, name: r.moderator?.fullName, mine: r.moderatorId === moderator.id } : null,
  }));
}

async function loadReview(reviewId, db = prisma) {
  const review = await db.moderationReview.findUnique({
    where: { id: reviewId },
    include: { listing: { include: { seller: { select: { displayName: true } } } }, pageViews: true },
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
    if (claimedByOther(review, moderator.id, now)) throw new ApiError(StatusCodes.CONFLICT, 'Specialist khác đang duyệt bài này.');
    await assertNarrationReady(tx, review.listing.publishedStoryId);
    await tx.moderationReview.update({
      where: { id: reviewId },
      data: { moderatorId: moderator.id, claimedAt: now, claimExpiresAt: new Date(now.getTime() + CLAIM_MINUTES * 60_000) },
    });
    await tx.listing.updateMany({ where: { id: review.listingId, status: 'submitted' }, data: { status: 'in_review' } });
  }, TX);
  return getReview(moderator, reviewId, { now });
}

/** Truyen bat giong doc: phai doc xong moi duyet (Specialist nghe khi duyet; nguoi mua nhan truyen co san audio). */
async function assertNarrationReady(db, storyId) {
  const check = await loadReadiness(db, storyId);
  const n = check?.narration;
  if (n?.enabled && !n.complete) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      n.failed || n.missing
        ? `Giọng đọc của truyện còn lỗi (${n.ready}/${n.total} đoạn) — chờ người bán bấm tạo lại giọng đọc.`
        : `Giọng đọc đang được tạo (${n.ready}/${n.total} đoạn). Duyệt lại sau ít phút.`,
    );
  }
}

async function assertClaimed(moderator, review, now) {
  if (review.decidedAt) throw new ApiError(StatusCodes.CONFLICT, 'Bài này đã được quyết định.');
  if (review.moderatorId !== moderator.id || !review.claimExpiresAt || review.claimExpiresAt <= now) {
    throw new ApiError(StatusCodes.CONFLICT, 'Hãy nhận bài (hoặc nhận lại vì đã quá thời gian giữ) trước khi duyệt.');
  }
}

/** Chi tiet luot duyet: noi dung ban dang ban (ten chung) kem gia ban (listing.priceVnd), trang da xem, tien do. */
export async function getReview(moderator, reviewId, { now = new Date() } = {}) {
  const review = await loadReview(reviewId);
  const story = await prisma.story.findUniqueOrThrow({ where: { id: review.listing.publishedStoryId }, include: STORY_DETAIL_INCLUDE });
  const detail = formatStoryDetail(story, { voice: await loadVoice(prisma) });
  return {
    review: {
      id: review.id,
      reviewType: review.reviewType,
      allowedDecisions: DECISIONS_BY_REVIEW_TYPE[review.reviewType],
      decision: review.decision,
      comment: review.comment,
      decidedAt: review.decidedAt,
      claimedByMe: review.moderatorId === moderator.id && review.claimExpiresAt > now,
      claimExpiresAt: review.claimExpiresAt,
    },
    listing: formatListing({ ...review.listing, publishedStory: { sourceStoryId: null } }),
    seller: review.listing.seller.displayName,
    story: detail,
    pageViews: review.pageViews.map((v) => ({ pageId: v.pageId, viewedAt: v.viewedAt, comment: v.comment })),
    progress: reviewProgress(detail.pages.map((p) => p.id), review.pageViews.map((v) => v.pageId)),
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
 * Quyet dinh. body: { decision, comment?, issueStrike? }.
 * - Luot nop ban: approved | changes_requested | rejected (rejected + issueStrike -> canh cao nguon `rejection`).
 * - Luot hau kiem (bao cao / ngau nhien): approved = giu (truyen dang tam go -> ban lai) | taken_down = go han
 *   (listing archived, tu canh cao nguon `takedown`). Bao cao con mo cua truyen dong theo quyet dinh.
 * approved: phai xem 100% trang (checklist su pham chi tren web, khong gui len). Quyet dinh khac: bat buoc nhan xet.
 */
export async function decide(moderator, reviewId, body, { now = new Date() } = {}) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM moderation_reviews WHERE id = ${reviewId}::uuid FOR UPDATE`;
    const review = await loadReview(reviewId, tx);
    await assertClaimed(moderator, review, now);
    if (!DECISIONS_BY_REVIEW_TYPE[review.reviewType].includes(body.decision)) {
      throw unprocessable('Quyết định không hợp lệ với loại lượt duyệt này.');
    }
    const pages = await tx.storyPage.findMany({ where: { storyId: review.listing.publishedStoryId }, select: { id: true } });
    const progress = reviewProgress(pages.map((p) => p.id), review.pageViews.map((v) => v.pageId));
    if (body.decision === 'approved') await assertNarrationReady(tx, review.listing.publishedStoryId);
    if (body.decision === 'approved' && !progress.canApprove) {
      throw unprocessable(`Cần xem hết ${progress.pagesTotal} trang (đã xem ${progress.pagesViewed}) trước khi duyệt.`);
    }
    const comment = body.comment?.trim() || null;
    if (body.decision !== 'approved' && !comment) throw unprocessable('Hãy ghi nhận xét để người bán biết cần sửa gì.');

    await tx.moderationReview.update({ where: { id: reviewId }, data: { decision: body.decision, comment, decidedAt: now } });
    await tx.listing.update({
      where: { id: review.listingId },
      data: { status: LISTING_STATUS_BY_DECISION[body.decision], ...(body.decision === 'approved' && !review.listing.publishedAt && { publishedAt: now }) },
    });
    if (body.decision === 'approved' && review.reviewType === 'submission' && review.listing.previousListingId) {
      await promoteVersion(tx, review.listing);
    }
    if (review.reviewType !== 'submission') await closeOpenReports(tx, moderator.id, review.listingId, body.decision, now);
    const strikeSource = body.decision === 'taken_down' ? 'takedown' : body.decision === 'rejected' && body.issueStrike ? 'rejection' : null;
    if (strikeSource) {
      await issueStrikeTx(tx, moderator.id, { sellerId: review.listing.sellerId, source: strikeSource, sourceId: reviewId, reason: `${review.listing.title}: ${comment}` }, now);
    }
  }, TX);
  return getReview(moderator, reviewId, { now });
}

export default {
  getMySeller, applySeller, updateMySeller, listSellerApplications, decideSeller,
  createListing, createListingVersion, getMyListings,
  getQueue, claimReview, getReview, viewPage, decide,
};
