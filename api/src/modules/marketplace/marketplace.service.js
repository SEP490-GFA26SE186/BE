import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Get all available price tiers
 * @returns {Promise<Array>}
 */
const getPriceTiers = async () => {
  const tiers = await prisma.priceTier.findMany({
    where: { isActive: true },
    orderBy: { priceVnd: 'asc' },
  });

  return tiers.map((t) => ({
    id: t.id,
    label: t.label,
    priceVnd: Number(t.priceVnd),
    isFree: t.priceVnd === 0n,
  }));
};

/**
 * Register as a community seller
 * @param {Object} user - Authenticated user
 * @param {Object} data - Seller application info
 * @returns {Promise<Object>}
 */
const registerSeller = async (user, data) => {
  const existing = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
  });

  if (existing) {
    throw ApiError.badRequest('You have already registered as a seller');
  }

  const profile = await prisma.sellerProfile.create({
    data: {
      userId: user.id,
      displayName: data.displayName.trim(),
      bio: data.bio?.trim() || null,
      expertise: data.expertise?.trim() || null,
      bankName: data.bankName?.trim() || null,
      bankAccountNumber: data.bankAccountNumber?.trim() || null,
      bankAccountHolder: data.bankAccountHolder?.trim() || null,
      status: 'pending',
    },
  });

  return profile;
};

/**
 * Get current user's seller profile
 * @param {Object} user
 * @returns {Promise<Object|null>}
 */
const getMySellerProfile = async (user) => {
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
    include: {
      _count: {
        select: { listings: true },
      },
    },
  });

  return profile;
};

/**
 * Update current user's seller profile
 * @param {Object} user
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updateSellerProfile = async (user, data) => {
  const existing = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
  });

  if (!existing) {
    throw ApiError.notFound('Seller profile not found. Please register first.');
  }

  const updated = await prisma.sellerProfile.update({
    where: { userId: user.id },
    data: {
      ...(data.displayName && { displayName: data.displayName.trim() }),
      ...(data.bio !== undefined && { bio: data.bio?.trim() || null }),
      ...(data.expertise !== undefined && { expertise: data.expertise?.trim() || null }),
      ...(data.bankName !== undefined && { bankName: data.bankName?.trim() || null }),
      ...(data.bankAccountNumber !== undefined && { bankAccountNumber: data.bankAccountNumber?.trim() || null }),
      ...(data.bankAccountHolder !== undefined && { bankAccountHolder: data.bankAccountHolder?.trim() || null }),
      bankUpdatedAt: new Date(),
    },
  });

  return updated;
};

/**
 * Public browse published marketplace listings
 * @param {Object} query - Filter & sort options
 * @returns {Promise<Object>} Listings and pagination
 */
const getListings = async (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const where = {
    status: 'published',
    ...(query.search && {
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
    ...(query.skillId && {
      publishedStory: {
        template: { primarySkillId: query.skillId },
      },
    }),
    ...(query.age !== undefined && {
      publishedStory: {
        template: {
          ageMin: { lte: query.age },
          ageMax: { gte: query.age },
        },
      },
    }),
    ...(query.isFree !== undefined && {
      priceTier: {
        priceVnd: query.isFree ? 0n : { gt: 0n },
      },
    }),
  };

  // Determine order by
  let orderBy = { publishedAt: 'desc' };
  if (query.sortBy === 'rating') {
    orderBy = { ratingAvg: 'desc' };
  } else if (query.sortBy === 'popular') {
    orderBy = { purchaseCount: 'desc' };
  } else if (query.sortBy === 'price_asc') {
    orderBy = { priceTier: { priceVnd: 'asc' } };
  } else if (query.sortBy === 'price_desc') {
    orderBy = { priceTier: { priceVnd: 'desc' } };
  }

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      take: limit,
      skip,
      orderBy,
      include: {
        seller: {
          select: {
            userId: true,
            displayName: true,
            ratingAvg: true,
          },
        },
        priceTier: {
          select: {
            id: true,
            label: true,
            priceVnd: true,
          },
        },
        publishedStory: {
          select: {
            id: true,
            title: true,
            coverImageKey: true,
            template: {
              select: {
                id: true,
                title: true,
                ageMin: true,
                ageMax: true,
                primarySkill: {
                  select: { id: true, caselCode: true, nameVi: true, nameEn: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const formatted = listings.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    coverImageKey: l.coverImageKey || l.publishedStory.coverImageKey,
    hasAiContent: l.hasAiContent,
    purchaseCount: l.purchaseCount,
    freeClaimCount: l.freeClaimCount,
    ratingAvg: l.ratingAvg ? Number(l.ratingAvg) : null,
    ratingCount: l.ratingCount,
    publishedAt: l.publishedAt,
    price: {
      tierId: l.priceTier.id,
      label: l.priceTier.label,
      priceVnd: Number(l.priceTier.priceVnd),
      isFree: l.priceTier.priceVnd === 0n,
    },
    seller: l.seller,
    story: {
      id: l.publishedStory.id,
      template: l.publishedStory.template,
    },
  }));

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
 * Get detailed marketplace listing by ID
 * @param {string} listingId
 * @param {Object} [currentUser]
 * @returns {Promise<Object>}
 */
const getListingById = async (listingId, currentUser) => {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      seller: {
        select: {
          userId: true,
          displayName: true,
          bio: true,
          expertise: true,
          ratingAvg: true,
          totalSales: true,
        },
      },
      priceTier: {
        select: {
          id: true,
          label: true,
          priceVnd: true,
        },
      },
      publishedStory: {
        select: {
          id: true,
          title: true,
          coverImageKey: true,
          useAiImage: true,
          useTts: true,
          template: {
            select: {
              id: true,
              title: true,
              ageMin: true,
              ageMax: true,
              primarySkill: {
                select: { id: true, caselCode: true, nameVi: true, nameEn: true },
              },
            },
          },
          _count: {
            select: { pages: true },
          },
        },
      },
    },
  });

  if (!listing) {
    throw ApiError.notFound('Listing not found');
  }

  // If not published, only the seller or admin can view
  if (listing.status !== 'published') {
    const isOwner = currentUser && listing.sellerId === currentUser.id;
    const isElevated = currentUser && ['admin', 'moderator'].includes(currentUser.role);
    if (!isOwner && !isElevated) {
      throw ApiError.notFound('Listing not found');
    }
  }

  let isOwned = false;
  if (currentUser) {
    const entitlement = await prisma.entitlement.findFirst({
      where: {
        parentId: currentUser.id,
        listingId: listing.id,
        revokedAt: null,
      },
    });
    isOwned = !!entitlement || listing.sellerId === currentUser.id;
  }

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    coverImageKey: listing.coverImageKey || listing.publishedStory.coverImageKey,
    status: listing.status,
    hasAiContent: listing.hasAiContent,
    purchaseCount: listing.purchaseCount,
    freeClaimCount: listing.freeClaimCount,
    ratingAvg: listing.ratingAvg ? Number(listing.ratingAvg) : null,
    ratingCount: listing.ratingCount,
    submittedAt: listing.submittedAt,
    publishedAt: listing.publishedAt,
    isOwned,
    price: {
      tierId: listing.priceTier.id,
      label: listing.priceTier.label,
      priceVnd: Number(listing.priceTier.priceVnd),
      isFree: listing.priceTier.priceVnd === 0n,
    },
    seller: listing.seller,
    story: {
      id: listing.publishedStory.id,
      title: listing.publishedStory.title,
      totalPages: listing.publishedStory._count.pages,
      useAiImage: listing.publishedStory.useAiImage,
      useTts: listing.publishedStory.useTts,
      template: listing.publishedStory.template,
    },
  };
};

/**
 * Submit a story to marketplace for moderation
 * @param {Object} user - Authenticated seller
 * @param {Object} data - Listing data
 * @returns {Promise<Object>} Created listing
 */
const createListing = async (user, data) => {
  // 1. Verify seller profile
  const seller = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
  });

  if (!seller) {
    throw ApiError.forbidden('You must register as a seller before publishing stories');
  }

  if (seller.status !== 'approved' && user.role !== 'admin') {
    throw ApiError.forbidden('Your seller profile is pending approval or suspended');
  }

  // 2. Verify story
  const story = await prisma.story.findFirst({
    where: {
      id: data.publishedStoryId,
      ownerId: user.id,
      deletedAt: null,
    },
  });

  if (!story) {
    throw ApiError.notFound('Story not found or does not belong to your account');
  }

  // Ensure story kind is published (must be created through de-personalization flow)
  if (story.kind !== 'published') {
    throw ApiError.badRequest(
      'Chỉ có thể đăng bán câu chuyện đã tạo bản sao xuất bản (gỡ thông tin cá nhân). Vui lòng tạo bản xuất bản qua API /stories/:id/publish-version trước khi tạo bài đăng.'
    );
  }

  // 3. Verify price tier
  const priceTier = await prisma.priceTier.findUnique({
    where: { id: data.priceTierId },
  });

  if (!priceTier || !priceTier.isActive) {
    throw ApiError.badRequest('Invalid or inactive price tier');
  }

  // 4. Check if listing already exists for this story
  const existingListing = await prisma.listing.findFirst({
    where: {
      publishedStoryId: data.publishedStoryId,
      status: { in: ['submitted', 'in_review', 'published'] },
    },
  });

  if (existingListing) {
    throw ApiError.conflict('A listing already exists for this story in active or review status');
  }

  // 5. Create listing and queue for moderation
  const listing = await prisma.listing.create({
    data: {
      sellerId: user.id,
      publishedStoryId: story.id,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      coverImageKey: data.coverImageKey || story.coverImageKey,
      priceTierId: priceTier.id,
      hasAiContent: data.hasAiContent || false,
      status: 'submitted',
    },
  });

  // Automatically queue moderation review
  await prisma.moderationReview.create({
    data: {
      listingId: listing.id,
      reviewType: 'submission',
    },
  });

  return {
    id: listing.id,
    title: listing.title,
    status: listing.status,
    priceTierId: listing.priceTierId,
    submittedAt: listing.submittedAt,
  };
};

/**
 * Get current seller's own listings
 * @param {Object} user
 * @returns {Promise<Array>}
 */
const getMyListings = async (user) => {
  const listings = await prisma.listing.findMany({
    where: { sellerId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      priceTier: {
        select: { label: true, priceVnd: true },
      },
      publishedStory: {
        select: { id: true, title: true, coverImageKey: true },
      },
    },
  });

  return listings.map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    price: {
      label: l.priceTier.label,
      priceVnd: Number(l.priceTier.priceVnd),
      isFree: l.priceTier.priceVnd === 0n,
    },
    purchaseCount: l.purchaseCount,
    freeClaimCount: l.freeClaimCount,
    ratingAvg: l.ratingAvg ? Number(l.ratingAvg) : null,
    ratingCount: l.ratingCount,
    submittedAt: l.submittedAt,
    publishedAt: l.publishedAt,
  }));
};

/**
 * Claim a free listing into user's library
 * @param {Object} user
 * @param {string} listingId
 * @returns {Promise<Object>}
 */
const claimFreeListing = async (user, listingId) => {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { priceTier: true },
  });

  if (!listing || listing.status !== 'published') {
    throw ApiError.notFound('Listing not found or not published');
  }

  if (listing.priceTier.priceVnd > 0n) {
    throw ApiError.badRequest('This story is not free. Please purchase it via order.');
  }

  const existingEntitlement = await prisma.entitlement.findFirst({
    where: {
      parentId: user.id,
      listingId,
      revokedAt: null,
    },
  });

  if (existingEntitlement) {
    return {
      message: 'Story is already in your library',
      alreadyOwned: true,
      entitlementId: existingEntitlement.id,
    };
  }

  const entitlement = await prisma.entitlement.create({
    data: {
      parentId: user.id,
      listingId,
      source: 'free_claim',
    },
  });

  await prisma.listing.update({
    where: { id: listingId },
    data: { freeClaimCount: { increment: 1 } },
  });

  return {
    message: 'Story claimed successfully into your library',
    alreadyOwned: false,
    entitlementId: entitlement.id,
  };
};

/**
 * Review a listing (ratings & comments)
 * @param {Object} user
 * @param {string} listingId
 * @param {Object} data - { rating, comment, tags }
 * @returns {Promise<Object>}
 */
const createReview = async (user, listingId, data) => {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing || listing.status !== 'published') {
    throw ApiError.notFound('Listing not found or not published');
  }

  // Must have an entitlement or be seller/admin
  const entitlement = await prisma.entitlement.findFirst({
    where: {
      parentId: user.id,
      listingId,
      revokedAt: null,
    },
  });

  if (!entitlement && listing.sellerId !== user.id && user.role !== 'admin') {
    throw ApiError.forbidden('You must own this story to submit a review');
  }

  // Upsert product review
  const review = await prisma.productReview.upsert({
    where: {
      listingId_parentId: {
        listingId,
        parentId: user.id,
      },
    },
    update: {
      rating: data.rating,
      comment: data.comment?.trim() || null,
      updatedAt: new Date(),
    },
    create: {
      listingId,
      parentId: user.id,
      rating: data.rating,
      comment: data.comment?.trim() || null,
    },
  });

  // Update tags if provided
  if (data.tags && Array.isArray(data.tags)) {
    await prisma.productReviewTag.deleteMany({
      where: { reviewId: review.id },
    });

    for (const tag of data.tags) {
      await prisma.productReviewTag.create({
        data: {
          reviewId: review.id,
          tag,
        },
      });
    }
  }

  // Recalculate listing rating average
  const agg = await prisma.productReview.aggregate({
    where: { listingId, visibility: 'visible' },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const ratingAvg = agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null;
  const ratingCount = agg._count.rating;

  await prisma.listing.update({
    where: { id: listingId },
    data: { ratingAvg, ratingCount },
  });

  // Recalculate seller rating average across all published listings
  const sellerListings = await prisma.listing.findMany({
    where: { sellerId: listing.sellerId, status: 'published', ratingAvg: { not: null } },
    select: { ratingAvg: true },
  });

  if (sellerListings.length > 0) {
    const totalAvg =
      sellerListings.reduce((acc, curr) => acc + Number(curr.ratingAvg), 0) /
      sellerListings.length;

    await prisma.sellerProfile.update({
      where: { userId: listing.sellerId },
      data: { ratingAvg: Number(totalAvg.toFixed(2)) },
    });
  }

  return {
    id: review.id,
    listingId,
    rating: review.rating,
    comment: review.comment,
    updatedAt: review.updatedAt,
  };
};

/**
 * Get reviews of a listing
 * @param {string} listingId
 * @returns {Promise<Array>}
 */
const getListingReviews = async (listingId) => {
  const reviews = await prisma.productReview.findMany({
    where: { listingId, visibility: 'visible' },
    orderBy: { createdAt: 'desc' },
    include: {
      parent: {
        select: { fullName: true, username: true },
      },
      tags: {
        select: { tag: true },
      },
    },
  });

  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    tags: r.tags.map((t) => t.tag),
    parentName: r.parent.fullName || r.parent.username,
    sellerReply: r.sellerReply,
    sellerRepliedAt: r.sellerRepliedAt,
    createdAt: r.createdAt,
  }));
};

/**
 * Seller reply to a review
 * @param {Object} user
 * @param {string} reviewId
 * @param {string} reply
 * @returns {Promise<Object>}
 */
const replyReview = async (user, reviewId, reply) => {
  const review = await prisma.productReview.findUnique({
    where: { id: reviewId },
    include: { listing: true },
  });

  if (!review) {
    throw ApiError.notFound('Review not found');
  }

  if (review.listing.sellerId !== user.id && user.role !== 'admin') {
    throw ApiError.forbidden('Only the author of this story can reply to reviews');
  }

  const updated = await prisma.productReview.update({
    where: { id: reviewId },
    data: {
      sellerReply: reply.trim(),
      sellerRepliedAt: new Date(),
    },
  });

  return {
    id: updated.id,
    sellerReply: updated.sellerReply,
    sellerRepliedAt: updated.sellerRepliedAt,
  };
};

export default {
  getPriceTiers,
  registerSeller,
  getMySellerProfile,
  updateSellerProfile,
  getListings,
  getListingById,
  createListing,
  getMyListings,
  claimFreeListing,
  createReview,
  getListingReviews,
  replyReview,
};
