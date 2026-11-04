// Giam sat noi dung (rev8 luong 7) — viec cua Specialist: bao cao vi pham, tam go truyen, canh cao tac gia,
// kiem tra ngau nhien. Khang nghi canh cao do Admin (khac nguoi ra canh cao) quyet (DBML strike_appeals).
// Quyet dinh hau kiem (giu / go han) nam o publishing.decide (dung chung khong gian duyet).
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import {
  AUDIT_COOLDOWN_DAYS,
  DAY_MS,
  MODERATION_SETTING_KEYS,
  auditDue,
  isStrikeActive,
  parseModerationSettings,
  reachesThreshold,
  strikeExpiry,
} from './lib/monitoring.js';

const TX = { timeout: 20000 };
const unprocessable = (message) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message);

export async function loadModerationSettings(db = prisma) {
  return parseModerationSettings(await db.platformSetting.findMany({ where: { key: { in: MODERATION_SETTING_KEYS } }, select: { key: true, value: true } }));
}

/** Nhat ky hanh dong (admin_audit_logs) cho moi thao tac giam sat co nguoi lam. */
const audit = (db, actorId, action, targetType, targetId, beforeState, afterState) =>
  db.adminAuditLog.create({ data: { actorId, action, targetType, targetId, beforeState, afterState } });

/** Luot duyet hau kiem dang mo cho listing (chua quyet) — co roi thi dung lai, khong tao trung. */
async function ensureFollowupReview(db, listingId) {
  const open = await db.moderationReview.findFirst({ where: { listingId, decidedAt: null } });
  if (open) {
    // Dang co luot kiem tra ngau nhien chua quyet -> doi thanh hau kiem bao cao (uu tien hon).
    if (open.reviewType === 'random_audit') await db.moderationReview.update({ where: { id: open.id }, data: { reviewType: 'report_followup' } });
    return open.id;
  }
  return (await db.moderationReview.create({ data: { listingId, reviewType: 'report_followup' } })).id;
}

// ---------------------------------------------------------------------------
// Bao cao (phu huynh gui)
// ---------------------------------------------------------------------------

/**
 * Phu huynh bao cao truyen dang ban (moi nguoi mot lan / truyen — partial unique). pageId tuy chon.
 * Du `reportThreshold` nguoi khac nhau trong 24 gio (bao cao con mo) -> tu tam go + tao luot hau kiem.
 */
export async function createReport(user, listingId, { category, description, pageId }, { now = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId}::uuid FOR UPDATE`;
    const listing = await tx.listing.findUnique({ where: { id: listingId }, select: { id: true, status: true, sellerId: true, publishedStoryId: true } });
    if (!listing || listing.status !== 'published') throw ApiError.notFound('Không tìm thấy truyện đang bán.');
    if (listing.sellerId === user.id) throw unprocessable('Không báo cáo truyện của chính ba mẹ.');
    if (pageId && !(await tx.storyPage.findFirst({ where: { id: pageId, storyId: listing.publishedStoryId }, select: { id: true } }))) {
      throw ApiError.badRequest('Trang không thuộc truyện này.');
    }
    if (await tx.contentReport.findFirst({ where: { reporterId: user.id, listingId }, select: { id: true } })) {
      throw new ApiError(StatusCodes.CONFLICT, 'Ba mẹ đã báo cáo truyện này rồi. Cảm ơn ba mẹ, kiểm duyệt viên đang xem xét.');
    }
    const report = await tx.contentReport.create({
      data: { reporterId: user.id, listingId, pageId: pageId ?? null, category, description: description?.trim() || null },
    });

    const { reportThreshold } = await loadModerationSettings(tx);
    const recent = await tx.contentReport.findMany({
      where: { listingId, status: 'open', createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      select: { reporterId: true },
    });
    let suspended = false;
    if (reachesThreshold(recent.map((r) => r.reporterId), reportThreshold)) {
      await tx.listing.update({ where: { id: listingId }, data: { status: 'suspended' } });
      await ensureFollowupReview(tx, listingId);
      suspended = true;
    }
    return { reportId: report.id, suspended };
  }, TX);
}

const REPORT_INCLUDE = {
  reporter: { select: { id: true, fullName: true } },
  handler: { select: { id: true, fullName: true } },
  page: { select: { id: true, pageOrder: true } },
  listing: { select: { id: true, title: true, status: true, sellerId: true, seller: { select: { displayName: true } } } },
  productReview: { select: { id: true, rating: true, comment: true, hiddenAt: true, listing: { select: { id: true, title: true, status: true, sellerId: true, seller: { select: { displayName: true } } } } } },
};

const formatReport = (r) => ({
  id: r.id,
  category: r.category,
  description: r.description,
  status: r.status,
  createdAt: r.createdAt,
  handledAt: r.handledAt,
  reporter: r.reporter?.fullName ?? null,
  handler: r.handler?.fullName ?? null,
  pageOrder: r.page?.pageOrder ?? null,
  listing: formatReportListing(r.listing ?? r.productReview?.listing),
  // Bao cao danh gia (luong 7.1): danh gia bi bao cao, Specialist an duoc (luong 7.3)
  review: r.productReview && { id: r.productReview.id, rating: r.productReview.rating, comment: r.productReview.comment, hidden: Boolean(r.productReview.hiddenAt) },
});

const formatReportListing = (l) => l && { id: l.id, title: l.title, status: l.status, sellerId: l.sellerId, seller: l.seller.displayName };

/**
 * Hang doi bao cao, gom theo truyen: moi truyen co cac bao cao + luot hau kiem dang mo (neu co).
 * status: open (mac dinh) | resolved | dismissed | all.
 */
export async function listReports({ status = 'open' } = {}) {
  const rows = await prisma.contentReport.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    include: REPORT_INCLUDE,
    take: 300,
  });
  const keyOf = (r) => r.listingId ?? r.productReview?.listing.id;
  const listingIds = [...new Set(rows.map(keyOf))];
  const openReviews = await prisma.moderationReview.findMany({
    where: { listingId: { in: listingIds }, decidedAt: null },
    select: { id: true, listingId: true, reviewType: true },
  });
  const reviewBy = new Map(openReviews.map((r) => [r.listingId, r]));
  const groups = new Map();
  for (const r of rows) {
    const key = keyOf(r);
    const g = groups.get(key) ?? { listing: formatReport(r).listing, openReview: reviewBy.get(key) ?? null, reports: [] };
    g.reports.push(formatReport(r));
    groups.set(key, g);
  }
  return { groups: [...groups.values()] };
}

/** Bac bao cao (khong vi pham). Bao cao da xu ly -> 409. */
export async function dismissReport(moderator, reportId, { now = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.contentReport.findUnique({ where: { id: reportId } });
    if (!r) throw ApiError.notFound('Không tìm thấy báo cáo.');
    if (r.status !== 'open') throw new ApiError(StatusCodes.CONFLICT, 'Báo cáo này đã được xử lý.');
    await tx.contentReport.update({ where: { id: reportId }, data: { status: 'dismissed', handledBy: moderator.id, handledAt: now } });
    await audit(tx, moderator.id, 'report.dismiss', 'content_report', reportId, { status: 'open' }, { status: 'dismissed' });
    return { reportId, status: 'dismissed' };
  }, TX);
}

/** Dong cac bao cao con mo cua listing khi luot hau kiem quyet (go han -> resolved, giu -> dismissed). */
export async function closeOpenReports(tx, moderatorId, listingId, decision, now) {
  const { count } = await tx.contentReport.updateMany({
    where: { listingId, status: 'open' },
    data: { status: decision === 'taken_down' ? 'resolved' : 'dismissed', handledBy: moderatorId, handledAt: now },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Tam go / danh sach truyen bi tam go
// ---------------------------------------------------------------------------

/** Specialist chu dong tam go truyen dang ban (kem ly do) -> tao luot hau kiem de quyet giu / go han. */
export async function suspendListing(moderator, listingId, { reason }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId}::uuid FOR UPDATE`;
    const listing = await tx.listing.findUnique({ where: { id: listingId }, select: { status: true } });
    if (!listing) throw ApiError.notFound('Không tìm thấy truyện.');
    if (listing.status !== 'published') throw new ApiError(StatusCodes.CONFLICT, 'Chỉ tạm gỡ được truyện đang bán.');
    await tx.listing.update({ where: { id: listingId }, data: { status: 'suspended' } });
    const reviewId = await ensureFollowupReview(tx, listingId);
    await audit(tx, moderator.id, 'listing.suspend', 'listing', listingId, { status: 'published' }, { status: 'suspended', reason: reason.trim() });
    return { listingId, status: 'suspended', reviewId };
  }, TX);
}

/** Truyen dang tam go (suspended) hoac da go han (archived) + so bao cao + luot hau kiem dang mo. */
export async function listRestrictedListings({ status = 'suspended' } = {}) {
  const rows = await prisma.listing.findMany({
    where: { status },
    orderBy: { updatedAt: 'desc' },
    include: {
      seller: { select: { userId: true, displayName: true, status: true } },
      moderationReviews: { orderBy: { createdAt: 'desc' }, take: 1, include: { moderator: { select: { fullName: true } } } },
      _count: { select: { contentReports: true, entitlements: true } },
    },
  });
  return {
    listings: rows.map((l) => {
      const review = l.moderationReviews[0];
      return {
        id: l.id,
        title: l.title,
        status: l.status,
        updatedAt: l.updatedAt,
        seller: { id: l.seller.userId, displayName: l.seller.displayName, status: l.seller.status },
        reportsCount: l._count.contentReports,
        buyersCount: l._count.entitlements,
        review: review && {
          id: review.id,
          reviewType: review.reviewType,
          decidedAt: review.decidedAt,
          decision: review.decision,
          comment: review.comment,
          moderator: review.moderator?.fullName ?? null,
        },
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Canh cao tac gia
// ---------------------------------------------------------------------------

/**
 * Ra canh cao (hieu luc strikeValidDays ngay). Du strikeLimit canh cao con hieu luc -> khoa tai khoan ban
 * (seller suspended: an moi truyen khoi cho, khong dang ban moi). Goi trong transaction cua nguoi goi.
 */
export async function issueStrikeTx(tx, issuerId, { sellerId, source, sourceId = null, reason }, now = new Date()) {
  const seller = await tx.sellerProfile.findUnique({ where: { userId: sellerId }, select: { status: true } });
  if (!seller) throw ApiError.notFound('Không tìm thấy người bán.');
  const { strikeLimit, strikeValidDays } = await loadModerationSettings(tx);
  const strike = await tx.creatorStrike.create({
    data: { sellerId, source, sourceId, reason: reason.trim(), issuedBy: issuerId, issuedAt: now, expiresAt: strikeExpiry(now, strikeValidDays) },
  });
  const activeStrikes = await tx.creatorStrike.count({ where: { sellerId, revokedAt: null, expiresAt: { gt: now } } });
  const sellerSuspended = activeStrikes >= strikeLimit && seller.status === 'approved';
  if (sellerSuspended) await tx.sellerProfile.update({ where: { userId: sellerId }, data: { status: 'suspended' } });
  await audit(tx, issuerId, 'strike.issue', 'creator_strike', strike.id, null, { sellerId, source, activeStrikes, sellerSuspended });
  return { strikeId: strike.id, activeStrikes, strikeLimit, sellerSuspended };
}

/** Specialist ra canh cao thu cong (tu bao cao / truyen bi go). */
export async function issueStrike(moderator, body, { now = new Date() } = {}) {
  return prisma.$transaction((tx) => issueStrikeTx(tx, moderator.id, body, now), TX);
}

const STRIKE_INCLUDE = {
  seller: { select: { userId: true, displayName: true, status: true } },
  issuer: { select: { id: true, fullName: true } },
  appeal: { include: { decider: { select: { fullName: true } } } },
};

const formatStrike = (s, now) => ({
  id: s.id,
  source: s.source,
  sourceId: s.sourceId,
  reason: s.reason,
  issuedAt: s.issuedAt,
  expiresAt: s.expiresAt,
  revokedAt: s.revokedAt,
  active: isStrikeActive(s, now),
  issuer: s.issuer && { id: s.issuer.id, name: s.issuer.fullName },
  seller: s.seller && { id: s.seller.userId, displayName: s.seller.displayName, status: s.seller.status },
  appeal: s.appeal && {
    id: s.appeal.id,
    reason: s.appeal.reason,
    status: s.appeal.status,
    createdAt: s.appeal.createdAt,
    decidedAt: s.appeal.decidedAt,
    decisionNote: s.appeal.decisionNote,
    decider: s.appeal.decider?.fullName ?? null,
  },
});

/** Danh sach canh cao (Specialist). active=true -> chi canh cao con hieu luc. */
export async function listStrikes({ sellerId, active } = {}, { now = new Date() } = {}) {
  const rows = await prisma.creatorStrike.findMany({
    where: { ...(sellerId && { sellerId }), ...(active && { revokedAt: null, expiresAt: { gt: now } }) },
    orderBy: { issuedAt: 'desc' },
    include: STRIKE_INCLUDE,
    take: 300,
  });
  const { strikeLimit } = await loadModerationSettings();
  return { strikeLimit, strikes: rows.map((s) => formatStrike(s, now)) };
}

/** Nguoi ban xem canh cao cua minh. */
export async function listMyStrikes(user, { now = new Date() } = {}) {
  const [rows, seller, settings] = await Promise.all([
    prisma.creatorStrike.findMany({ where: { sellerId: user.id }, orderBy: { issuedAt: 'desc' }, include: STRIKE_INCLUDE }),
    prisma.sellerProfile.findUnique({ where: { userId: user.id }, select: { status: true } }),
    loadModerationSettings(),
  ]);
  const strikes = rows.map((s) => {
    const f = formatStrike(s, now);
    delete f.issuer; // nguoi ban khong can biet ten kiem duyet vien
    return f;
  });
  return { sellerStatus: seller?.status ?? null, strikeLimit: settings.strikeLimit, activeStrikes: strikes.filter((s) => s.active).length, strikes };
}

/** Nguoi ban khang nghi mot canh cao con hieu luc (moi canh cao mot lan). */
export async function appealStrike(user, strikeId, { reason }, { now = new Date() } = {}) {
  const strike = await prisma.creatorStrike.findUnique({ where: { id: strikeId }, include: { appeal: true } });
  if (!strike || strike.sellerId !== user.id) throw ApiError.notFound('Không tìm thấy cảnh cáo.');
  if (!isStrikeActive(strike, now)) throw unprocessable('Cảnh cáo này đã hết hiệu lực hoặc đã được gỡ.');
  if (strike.appeal) throw new ApiError(StatusCodes.CONFLICT, 'Ba mẹ đã kháng nghị cảnh cáo này rồi.');
  const appeal = await prisma.strikeAppeal.create({ data: { strikeId, reason: reason.trim() } });
  return { appealId: appeal.id, status: appeal.status };
}

// ---------------------------------------------------------------------------
// Khang nghi (Admin quyet, khac nguoi ra canh cao)
// ---------------------------------------------------------------------------

export async function listAppeals({ status = 'pending' } = {}, { now = new Date() } = {}) {
  const rows = await prisma.strikeAppeal.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'asc' },
    include: { strike: { include: STRIKE_INCLUDE } },
  });
  return { appeals: rows.map((a) => ({ ...formatStrike(a.strike, now).appeal, strike: { ...formatStrike(a.strike, now), appeal: undefined } })) };
}

/**
 * Chap thuan -> thu hoi canh cao; con duoi strikeLimit canh cao hieu luc ma tai khoan ban dang khoa -> mo lai.
 * Tu choi -> giu canh cao. Nguoi ra canh cao khong tu xet khang nghi cua canh cao do.
 */
export async function decideAppeal(admin, appealId, { approve, note }, { now = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM strike_appeals WHERE id = ${appealId}::uuid FOR UPDATE`;
    const appeal = await tx.strikeAppeal.findUnique({ where: { id: appealId }, include: { strike: true } });
    if (!appeal) throw ApiError.notFound('Không tìm thấy kháng nghị.');
    if (appeal.status !== 'pending') throw new ApiError(StatusCodes.CONFLICT, 'Kháng nghị này đã được xử lý.');
    if (appeal.strike.issuedBy === admin.id) throw ApiError.forbidden('Người ra cảnh cáo không tự xét kháng nghị của cảnh cáo đó.');
    if (!approve && !note?.trim()) throw unprocessable('Hãy ghi lý do từ chối để người bán biết.');

    const status = approve ? 'approved' : 'rejected';
    await tx.strikeAppeal.update({ where: { id: appealId }, data: { status, decidedBy: admin.id, decidedAt: now, decisionNote: note?.trim() || null } });
    let sellerReinstated = false;
    if (approve) {
      const sellerId = appeal.strike.sellerId;
      await tx.creatorStrike.update({ where: { id: appeal.strikeId }, data: { revokedAt: now } });
      const { strikeLimit } = await loadModerationSettings(tx);
      const active = await tx.creatorStrike.count({ where: { sellerId, revokedAt: null, expiresAt: { gt: now } } });
      if (active < strikeLimit) {
        sellerReinstated = (await tx.sellerProfile.updateMany({ where: { userId: sellerId, status: 'suspended' }, data: { status: 'approved' } })).count > 0;
      }
    }
    await audit(tx, admin.id, `appeal.${status}`, 'strike_appeal', appealId, { status: 'pending' }, { status, sellerReinstated });
    return { appealId, status, strikeRevoked: approve, sellerReinstated };
  }, TX);
}

// ---------------------------------------------------------------------------
// Kiem tra ngau nhien
// ---------------------------------------------------------------------------

/**
 * Chon toi da `auditPerWeek` truyen dang ban (nguoi ban con hoat dong, chua co luot duyet dang mo, khong co luot
 * duyet nao xong trong AUDIT_COOLDOWN_DAYS ngay), uu tien truyen lau chua duoc Specialist xem. Worker goi moi chu ky: chi chon khi tuan nay chua chon (idempotent).
 * force (Specialist bam) -> chon ngay, bo qua moc tuan.
 */
export async function scheduleRandomAudits(db = prisma, { now = new Date(), force = false, count } = {}) {
  const last = await db.moderationReview.findFirst({ where: { reviewType: 'random_audit' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  if (!force && !auditDue(last?.createdAt, now)) return { created: 0, reviewIds: [] };
  const { auditPerWeek } = await loadModerationSettings(db);
  const take = count ?? auditPerWeek;
  const recent = new Date(now.getTime() - AUDIT_COOLDOWN_DAYS * DAY_MS);
  // Ngau nhien trong nhom "lau chua duoc xem nhat" (moi loai luot duyet: duyet dang ban, kiem tra, bao cao).
  const picked = await db.$queryRaw`
    SELECT l.id
    FROM listings l
    JOIN seller_profiles s ON s.user_id = l.seller_id AND s.status = 'approved'
    WHERE l.status = 'published'
      AND NOT EXISTS (
        SELECT 1 FROM moderation_reviews r WHERE r.listing_id = l.id AND (r.decided_at IS NULL OR r.decided_at > ${recent})
      )
    ORDER BY (SELECT max(r.decided_at) FROM moderation_reviews r WHERE r.listing_id = l.id) ASC NULLS FIRST, random()
    LIMIT ${take}`;
  const reviewIds = [];
  for (const { id } of picked) {
    // Khoa dong truyen nhu suspendListing / createReport (cung khoa listing) roi kiem lai: DB chi cho mot luot
    // duyet dang mo moi truyen (unique moderation_reviews_listing_id_open_key).
    const reviewId = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${id}::uuid AND status = 'published' FOR UPDATE`;
      if (await tx.moderationReview.findFirst({ where: { listingId: id, decidedAt: null }, select: { id: true } })) return null;
      return (await tx.moderationReview.create({ data: { listingId: id, reviewType: 'random_audit', createdAt: now } })).id;
    }, TX);
    if (reviewId) reviewIds.push(reviewId);
  }
  return { created: reviewIds.length, reviewIds };
}

/** Specialist bam "chon dot kiem tra" -> ghi nhat ky. */
export async function runRandomAudits(moderator, { count } = {}) {
  const result = await scheduleRandomAudits(prisma, { force: true, count });
  if (result.created) await audit(prisma, moderator.id, 'audit.schedule', 'moderation_review', null, null, result);
  return result;
}

/** Lich su kiem tra ngau nhien (moi nhat truoc). */
export async function listAudits({ open } = {}) {
  const rows = await prisma.moderationReview.findMany({
    where: { reviewType: 'random_audit', ...(open !== undefined && { decidedAt: open ? null : { not: null } }) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { listing: { select: { id: true, title: true, status: true, seller: { select: { displayName: true } } } }, moderator: { select: { fullName: true } } },
  });
  return {
    audits: rows.map((r) => ({
      reviewId: r.id,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      decision: r.decision,
      comment: r.comment,
      moderator: r.moderator?.fullName ?? null,
      listing: { id: r.listing.id, title: r.listing.title, status: r.listing.status, seller: r.listing.seller.displayName },
    })),
  };
}

// ---------------------------------------------------------------------------
// Giam sat dung AI (luong 7.6, ban gon)
// ---------------------------------------------------------------------------

/**
 * Phu huynh co nhieu luot AI bi chan (guardrail: tu khoa cam / noi dung khong an toan) trong `days` ngay.
 * Bi chan = ai_requests.status 'blocked'. Kem luot loi, tong luot, ly do gan nhat, trang thai khoa.
 */
export async function listAiFlags({ days = 7, min = 2 } = {}, { now = new Date() } = {}) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = await prisma.aiRequest.groupBy({
    by: ['userId', 'status'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const byUser = new Map();
  for (const r of rows) {
    const u = byUser.get(r.userId) ?? { total: 0, blocked: 0, failed: 0 };
    u.total += r._count._all;
    if (r.status === 'blocked') u.blocked += r._count._all;
    if (r.status === 'failed') u.failed += r._count._all;
    byUser.set(r.userId, u);
  }
  const flagged = [...byUser].filter(([, u]) => u.blocked >= min).map(([userId]) => userId);
  const blockedNow = await prisma.user.findMany({ where: { aiBlockedUntil: { gt: now } }, select: { id: true } });
  const ids = [...new Set([...flagged, ...blockedNow.map((u) => u.id)])];
  const [users, lastBlocked] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true, aiBlockedUntil: true } }),
    prisma.aiRequest.findMany({
      where: { userId: { in: ids }, status: 'blocked' },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId'],
      select: { userId: true, createdAt: true, errorMessage: true, story: { select: { title: true } } },
    }),
  ]);
  const lastOf = new Map(lastBlocked.map((b) => [b.userId, b]));
  return {
    days,
    min,
    flags: users
      .map((u) => {
        const s = byUser.get(u.id) ?? { total: 0, blocked: 0, failed: 0 };
        const last = lastOf.get(u.id);
        return {
          userId: u.id,
          fullName: u.fullName,
          email: u.email,
          ...s,
          blockedRate: s.total ? Math.round((s.blocked / s.total) * 100) : 0,
          lastBlocked: last && { at: last.createdAt, reason: last.errorMessage, storyTitle: last.story?.title ?? null },
          aiBlockedUntil: u.aiBlockedUntil && u.aiBlockedUntil > now ? u.aiBlockedUntil : null,
        };
      })
      .sort((a, b) => b.blocked - a.blocked),
  };
}

/** Tam khoa quyen dung AI `days` ngay (khong khoa tai khoan: van doc truyen, tu viet duoc). days = 0 -> mo khoa. */
export async function setAiBlock(moderator, userId, { days, reason }, { now = new Date() } = {}) {
  const user = await prisma.user.findFirst({ where: { id: userId, role: 'parent', deletedAt: null }, select: { aiBlockedUntil: true } });
  if (!user) throw ApiError.notFound('Không tìm thấy phụ huynh.');
  const until = days > 0 ? new Date(now.getTime() + days * DAY_MS) : null;
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { aiBlockedUntil: until } });
    await audit(tx, moderator.id, until ? 'ai.block' : 'ai.unblock', 'user', userId, { aiBlockedUntil: user.aiBlockedUntil }, { aiBlockedUntil: until, reason: reason?.trim() || null });
    return { userId, aiBlockedUntil: until };
  }, TX);
}

export default {
  listAiFlags, setAiBlock,
  createReport, listReports, dismissReport,
  suspendListing, listRestrictedListings,
  issueStrike, listStrikes, listMyStrikes, appealStrike,
  listAppeals, decideAppeal,
  runRandomAudits, listAudits,
};
