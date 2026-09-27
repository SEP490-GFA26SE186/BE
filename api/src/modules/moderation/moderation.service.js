import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Get all active pedagogical checklist items
 * @returns {Promise<Array>}
 */
const getChecklistItems = async () => {
  return prisma.checklistItem.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
  });
};

/**
 * Get all blocked keywords
 * @returns {Promise<Array>}
 */
const getBlockedKeywords = async () => {
  return prisma.blockedKeyword.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Add a new blocked keyword
 * @param {Object} user - Admin or Moderator
 * @param {Object} data - { keyword, severity }
 * @returns {Promise<Object>}
 */
const addBlockedKeyword = async (user, { keyword, severity = 'block' }) => {
  const normalized = keyword.trim().toLowerCase();

  const existing = await prisma.blockedKeyword.findUnique({
    where: { keyword: normalized },
  });

  if (existing) {
    if (!existing.isActive) {
      return prisma.blockedKeyword.update({
        where: { id: existing.id },
        data: { isActive: true, severity },
      });
    }
    throw ApiError.conflict('Keyword already exists in blocked list');
  }

  return prisma.blockedKeyword.create({
    data: {
      keyword: normalized,
      severity,
      createdById: user.id,
    },
  });
};

/**
 * Delete a blocked keyword
 * @param {string} id
 * @returns {Promise<Object>}
 */
const deleteBlockedKeyword = async (id) => {
  const existing = await prisma.blockedKeyword.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound('Blocked keyword not found');
  }

  await prisma.blockedKeyword.delete({ where: { id } });
  return { message: 'Blocked keyword removed successfully' };
};

/**
 * Check a string against all blocked keywords
 * @param {string} text
 * @returns {Promise<Object>} { clean: boolean, matched: Array }
 */
const checkTextAgainstKeywords = async (text) => {
  const keywords = await prisma.blockedKeyword.findMany({
    where: { isActive: true },
  });

  const normalizedText = text.toLowerCase();
  const matched = [];

  for (const item of keywords) {
    if (normalizedText.includes(item.keyword.toLowerCase())) {
      matched.push({
        keyword: item.keyword,
        severity: item.severity,
      });
    }
  }

  return {
    clean: matched.length === 0,
    hasBlockingKeywords: matched.some((m) => m.severity === 'block'),
    matched,
  };
};

/**
 * Get queue of listings waiting for moderation review
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getReviewQueue = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const where = {
    status: { in: ['submitted', 'in_review'] },
  };

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      take: limit,
      skip,
      orderBy: { submittedAt: 'asc' },
      include: {
        seller: {
          select: { userId: true, displayName: true, ratingAvg: true },
        },
        priceTier: {
          select: { label: true, priceVnd: true },
        },
        publishedStory: {
          select: {
            id: true,
            title: true,
            coverImageKey: true,
            _count: { select: { pages: true } },
            template: {
              select: {
                id: true,
                title: true,
                primarySkill: { select: { nameVi: true, nameEn: true } },
              },
            },
          },
        },
        moderationReviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            moderator: {
              select: { id: true, fullName: true, username: true },
            },
          },
        },
      },
    }),
  ]);

  const formatted = listings.map((l) => {
    const latestReview = l.moderationReviews[0];
    return {
      listingId: l.id,
      title: l.title,
      status: l.status,
      submittedAt: l.submittedAt,
      seller: l.seller,
      price: {
        label: l.priceTier.label,
        priceVnd: Number(l.priceTier.priceVnd),
      },
      story: {
        id: l.publishedStory.id,
        title: l.publishedStory.title,
        totalPages: l.publishedStory._count.pages,
        template: l.publishedStory.template,
      },
      latestReview: latestReview
        ? {
            id: latestReview.id,
            reviewType: latestReview.reviewType,
            claimedBy: latestReview.moderator?.fullName || latestReview.moderator?.username || null,
            claimedAt: latestReview.claimedAt,
            claimExpiresAt: latestReview.claimExpiresAt,
          }
        : null,
    };
  });

  return {
    items: formatted,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Claim a listing for review by current moderator
 * @param {Object} user - Moderator
 * @param {string} listingId
 * @returns {Promise<Object>}
 */
const claimReview = async (user, listingId) => {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      moderationReviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!listing) {
    throw ApiError.notFound('Listing not found');
  }

  let review = listing.moderationReviews[0];

  // If review exists and claimed by another moderator with active claim
  if (
    review &&
    review.moderatorId &&
    review.moderatorId !== user.id &&
    review.claimExpiresAt &&
    review.claimExpiresAt > new Date()
  ) {
    throw ApiError.conflict('This listing is currently being reviewed by another moderator');
  }

  const claimExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours claim

  if (!review || review.decision) {
    // Create new review session if none or already decided
    review = await prisma.moderationReview.create({
      data: {
        listingId,
        reviewType: 'submission',
        moderatorId: user.id,
        claimedAt: new Date(),
        claimExpiresAt,
      },
    });
  } else {
    review = await prisma.moderationReview.update({
      where: { id: review.id },
      data: {
        moderatorId: user.id,
        claimedAt: new Date(),
        claimExpiresAt,
      },
    });
  }

  await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'in_review' },
  });

  return {
    reviewId: review.id,
    listingId,
    moderatorId: user.id,
    claimedAt: review.claimedAt,
    claimExpiresAt: review.claimExpiresAt,
  };
};

/**
 * Submit moderation decision for a review
 * @param {Object} user - Moderator
 * @param {string} reviewId
 * @param {Object} payload - { decision, comment, checklist }
 * @returns {Promise<Object>}
 */
const submitReviewDecision = async (user, reviewId, { decision, comment, checklist }) => {
  const review = await prisma.moderationReview.findUnique({
    where: { id: reviewId },
    include: { listing: true },
  });

  if (!review) {
    throw ApiError.notFound('Moderation review not found');
  }

  // Update review checklist results if provided
  if (checklist && Array.isArray(checklist)) {
    for (const item of checklist) {
      await prisma.reviewChecklistResult.upsert({
        where: {
          reviewId_checklistItemId: {
            reviewId,
            checklistItemId: item.checklistItemId,
          },
        },
        update: { passed: item.passed },
        create: {
          reviewId,
          checklistItemId: item.checklistItemId,
          passed: item.passed,
        },
      });
    }
  }

  const decidedAt = new Date();

  // Update review
  const updatedReview = await prisma.moderationReview.update({
    where: { id: reviewId },
    data: {
      decision,
      comment: comment?.trim() || null,
      decidedAt,
      moderatorId: user.id,
    },
  });

  // Determine new listing status
  let newListingStatus = review.listing.status;
  let publishedAt = review.listing.publishedAt;

  if (decision === 'approved') {
    newListingStatus = 'published';
    publishedAt = new Date();
  } else if (decision === 'changes_requested') {
    newListingStatus = 'changes_requested';
  } else if (decision === 'rejected') {
    newListingStatus = 'rejected';
  } else if (decision === 'taken_down') {
    newListingStatus = 'suspended';
  }

  await prisma.listing.update({
    where: { id: review.listingId },
    data: {
      status: newListingStatus,
      publishedAt,
    },
  });

  return {
    reviewId: updatedReview.id,
    listingId: review.listingId,
    decision: updatedReview.decision,
    newListingStatus,
    comment: updatedReview.comment,
    decidedAt: updatedReview.decidedAt,
  };
};

/**
 * Create a content report from user
 * @param {Object} user
 * @param {Object} data - { listingId, pageId, productReviewId, category, description }
 * @returns {Promise<Object>}
 */
const createReport = async (user, data) => {
  if (!data.listingId && !data.pageId && !data.productReviewId) {
    throw ApiError.badRequest('At least one of listingId, pageId, or productReviewId must be provided');
  }

  const report = await prisma.contentReport.create({
    data: {
      reporterId: user.id,
      listingId: data.listingId || null,
      pageId: data.pageId || null,
      productReviewId: data.productReviewId || null,
      category: data.category,
      description: data.description?.trim() || null,
      status: 'open',
    },
  });

  // Automated safety threshold: >= 3 distinct reports in 24 hours -> auto-suspend listing
  if (data.listingId) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReports = await prisma.contentReport.findMany({
      where: {
        listingId: data.listingId,
        createdAt: { gte: oneDayAgo },
      },
      select: { reporterId: true },
    });

    const distinctReporters = new Set(recentReports.map((r) => r.reporterId)).size;
    if (distinctReporters >= 3) {
      await prisma.listing.update({
        where: { id: data.listingId },
        data: { status: 'suspended' },
      });
    }
  }

  return report;
};

/**
 * Get reports list for moderation
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getReports = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const where = {
    ...(query.status && { status: query.status }),
  };

  const [total, reports] = await Promise.all([
    prisma.contentReport.count({ where }),
    prisma.contentReport.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: {
          select: { id: true, fullName: true, username: true },
        },
        listing: {
          select: { id: true, title: true, status: true },
        },
        handledBy: {
          select: { id: true, fullName: true, username: true },
        },
      },
    }),
  ]);

  return {
    items: reports,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Resolve or dismiss a content report
 * @param {Object} user - Moderator
 * @param {string} reportId
 * @param {Object} payload - { status }
 * @returns {Promise<Object>}
 */
const resolveReport = async (user, reportId, { status }) => {
  const existing = await prisma.contentReport.findUnique({
    where: { id: reportId },
  });

  if (!existing) {
    throw ApiError.notFound('Content report not found');
  }

  const updated = await prisma.contentReport.update({
    where: { id: reportId },
    data: {
      status,
      handledById: user.id,
      handledAt: new Date(),
    },
  });

  return updated;
};

/**
 * Issue a creator strike for pedagogical or safety violation
 * @param {Object} user - Moderator or Admin
 * @param {Object} payload - { sellerId, source, sourceId, reason }
 * @returns {Promise<Object>}
 */
const issueStrike = async (user, { sellerId, source, sourceId, reason }) => {
  const seller = await prisma.sellerProfile.findUnique({
    where: { userId: sellerId },
  });

  if (!seller) {
    throw ApiError.notFound('Seller not found');
  }

  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days validity

  const strike = await prisma.creatorStrike.create({
    data: {
      sellerId,
      source,
      sourceId: sourceId || null,
      reason: reason.trim(),
      issuedById: user.id,
      expiresAt,
    },
  });

  // Count active non-revoked strikes
  const activeStrikesCount = await prisma.creatorStrike.count({
    where: {
      sellerId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  let sellerSuspended = false;
  if (activeStrikesCount >= 3) {
    await prisma.sellerProfile.update({
      where: { userId: sellerId },
      data: { status: 'suspended' },
    });

    // Also suspend all currently published listings of this seller
    await prisma.listing.updateMany({
      where: { sellerId, status: 'published' },
      data: { status: 'suspended' },
    });

    sellerSuspended = true;
  }

  return {
    strikeId: strike.id,
    sellerId,
    activeStrikesCount,
    sellerSuspended,
    expiresAt: strike.expiresAt,
  };
};

/**
 * Get all strikes for a seller
 * @param {string} sellerId
 * @returns {Promise<Array>}
 */
const getSellerStrikes = async (sellerId) => {
  return prisma.creatorStrike.findMany({
    where: { sellerId },
    orderBy: { issuedAt: 'desc' },
    include: {
      appeal: true,
      issuedBy: {
        select: { fullName: true, username: true },
      },
    },
  });
};

/**
 * Seller submits an appeal against a creator strike
 * @param {Object} user - Seller
 * @param {string} strikeId
 * @param {Object} payload - { reason }
 * @returns {Promise<Object>}
 */
const createStrikeAppeal = async (user, strikeId, { reason }) => {
  const strike = await prisma.creatorStrike.findUnique({
    where: { id: strikeId },
    include: { appeal: true },
  });

  if (!strike) {
    throw ApiError.notFound('Không tìm thấy gậy cảnh cáo');
  }

  if (strike.sellerId !== user.id) {
    throw ApiError.forbidden('Bạn chỉ có thể gửi khiếu nại đối với gậy cảnh cáo của chính mình');
  }

  if (strike.revokedAt) {
    throw ApiError.badRequest('Gậy cảnh cáo này đã được gỡ bỏ trước đó');
  }

  if (strike.expiresAt < new Date()) {
    throw ApiError.badRequest('Gậy cảnh cáo này đã hết hạn hiệu lực');
  }

  if (strike.appeal) {
    throw ApiError.conflict('Gậy cảnh cáo này đã được gửi đơn khiếu nại trước đó');
  }

  const appeal = await prisma.strikeAppeal.create({
    data: {
      strikeId,
      reason: reason.trim(),
      status: 'pending',
    },
    include: {
      strike: true,
    },
  });

  return appeal;
};

/**
 * Get all appeals submitted by current seller
 * @param {Object} user - Seller
 * @returns {Promise<Array>}
 */
const getMyStrikeAppeals = async (user) => {
  return prisma.strikeAppeal.findMany({
    where: {
      strike: {
        sellerId: user.id,
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      strike: true,
      decidedBy: {
        select: { id: true, username: true, fullName: true },
      },
    },
  });
};

/**
 * Moderator / Admin queries all strike appeals with filtering and pagination
 * @param {Object} filter - { status, sellerId, page, limit }
 * @returns {Promise<Object>}
 */
const getStrikeAppeals = async (filter = {}) => {
  const { status, sellerId, page = 1, limit = 20 } = filter;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  const where = {};
  if (status) {
    where.status = status;
  }
  if (sellerId) {
    where.strike = { sellerId };
  }

  const [total, appeals] = await Promise.all([
    prisma.strikeAppeal.count({ where }),
    prisma.strikeAppeal.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        strike: {
          include: {
            seller: {
              select: {
                userId: true,
                penName: true,
                user: { select: { email: true, fullName: true } },
              },
            },
            issuedBy: {
              select: { id: true, username: true, fullName: true },
            },
          },
        },
        decidedBy: {
          select: { id: true, username: true, fullName: true },
        },
      },
    }),
  ]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    appeals,
  };
};

/**
 * Admin decides on a strike appeal
 * @param {Object} adminUser - Admin
 * @param {string} appealId
 * @param {Object} payload - { status: 'approved' | 'rejected', decisionNote }
 * @returns {Promise<Object>}
 */
const decideStrikeAppeal = async (adminUser, appealId, { status, decisionNote }) => {
  const appeal = await prisma.strikeAppeal.findUnique({
    where: { id: appealId },
    include: {
      strike: true,
    },
  });

  if (!appeal) {
    throw ApiError.notFound('Không tìm thấy đơn khiếu nại');
  }

  if (appeal.status !== 'pending') {
    throw ApiError.badRequest('Đơn khiếu nại này đã được xử lý trước đó');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Update appeal decision
    const updatedAppeal = await tx.strikeAppeal.update({
      where: { id: appealId },
      data: {
        status,
        decidedById: adminUser.id,
        decidedAt: new Date(),
        decisionNote: decisionNote ? decisionNote.trim() : null,
      },
    });

    let strikeRevoked = false;
    let sellerReinstated = false;

    // 2. If approved, revoke the strike
    if (status === 'approved') {
      await tx.creatorStrike.update({
        where: { id: appeal.strikeId },
        data: {
          revokedAt: new Date(),
        },
      });
      strikeRevoked = true;

      // Check remaining active strikes count for seller
      const activeCount = await tx.creatorStrike.count({
        where: {
          sellerId: appeal.strike.sellerId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (activeCount < 3) {
        const sellerProfile = await tx.sellerProfile.findUnique({
          where: { userId: appeal.strike.sellerId },
        });

        if (sellerProfile && sellerProfile.status === 'suspended') {
          await tx.sellerProfile.update({
            where: { userId: appeal.strike.sellerId },
            data: { status: 'approved' },
          });
          sellerReinstated = true;
        }
      }
    }

    // 3. Send notification to the seller
    const notifTitle =
      status === 'approved'
        ? 'Khiếu nại gậy cảnh cáo được chấp thuận'
        : 'Khiếu nại gậy cảnh cáo bị từ chối';
    const notifBody =
      status === 'approved'
        ? `Đơn khiếu nại gậy cảnh cáo của bạn đã được Quản trị viên chấp thuận và gỡ bỏ gậy.${decisionNote ? ' Lời nhắn: ' + decisionNote : ''}`
        : `Đơn khiếu nại gậy cảnh cáo của bạn đã bị từ chối.${decisionNote ? ' Lý do: ' + decisionNote : ''}`;

    await tx.notification.create({
      data: {
        userId: appeal.strike.sellerId,
        type: status === 'approved' ? 'STRIKE_APPEAL_APPROVED' : 'STRIKE_APPEAL_REJECTED',
        title: notifTitle,
        body: notifBody,
        refType: 'strike_appeal',
        refId: appeal.id,
      },
    });

    return {
      appeal: updatedAppeal,
      strikeRevoked,
      sellerReinstated,
      message:
        status === 'approved'
          ? 'Đã chấp thuận đơn khiếu nại và gỡ bỏ gậy cảnh cáo thành công'
          : 'Đã từ chối đơn khiếu nại',
    };
  });
};

export default {
  getChecklistItems,
  getBlockedKeywords,
  addBlockedKeyword,
  deleteBlockedKeyword,
  checkTextAgainstKeywords,
  getReviewQueue,
  claimReview,
  submitReviewDecision,
  createReport,
  getReports,
  resolveReport,
  issueStrike,
  getSellerStrikes,
  createStrikeAppeal,
  getMyStrikeAppeals,
  getStrikeAppeals,
  decideStrikeAppeal,
};
