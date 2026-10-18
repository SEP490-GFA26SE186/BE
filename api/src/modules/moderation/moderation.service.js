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

export default {
  getChecklistItems,
  checkTextAgainstKeywords,
  getReviewQueue,
  claimReview,
  submitReviewDecision,
};
