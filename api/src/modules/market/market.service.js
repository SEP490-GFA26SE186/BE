// Cho truyen (rev8 luong 4): xem truyen dang ban, mua qua payOS (0d -> nhan ngay), truyen da mua.
// Nguoi mua dung ban dang ban nguyen trang (DBML): quyen doc = entitlement, khong sao chep truyen.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { checkoutOrder } from '../billing/billing.service.js';
import { loadMarketSettings } from '../billing/billing.store.js';

const vnd = (v) => (v == null ? null : Number(v));
const SORTS = {
  best_selling: [{ purchaseCount: 'desc' }, { publishedAt: 'desc' }],
  newest: [{ publishedAt: 'desc' }],
  rating: [{ ratingAvg: { sort: 'desc', nulls: 'last' } }, { ratingCount: 'desc' }],
  price_asc: [{ priceTier: { priceVnd: 'asc' } }, { publishedAt: 'desc' }],
};

const LISTING_INCLUDE = {
  priceTier: true,
  seller: { select: { userId: true, displayName: true, ratingAvg: true, totalSales: true } },
  publishedStory: {
    select: { id: true, length: true, topic: { select: { title: true, ageMin: true, ageMax: true, skill: { select: { caselCode: true } } } }, _count: { select: { pages: true, checkpoints: true } } },
  },
};

const formatCard = (l, owned = false) => ({
  id: l.id,
  title: l.title,
  description: l.description,
  topic: {
    title: l.publishedStory.topic.title,
    competency: l.publishedStory.topic.skill.caselCode,
    ageMin: l.publishedStory.topic.ageMin,
    ageMax: l.publishedStory.topic.ageMax,
  },
  totalPages: l.publishedStory._count.pages,
  checkpointCount: l.publishedStory._count.checkpoints,
  priceTier: { id: l.priceTier.id, label: l.priceTier.label, priceVnd: vnd(l.priceTier.priceVnd) },
  seller: { id: l.seller.userId, displayName: l.seller.displayName, ratingAvg: l.seller.ratingAvg == null ? null : Number(l.seller.ratingAvg), totalSales: l.seller.totalSales },
  purchaseCount: l.purchaseCount + l.freeClaimCount,
  ratingAvg: l.ratingAvg == null ? 0 : Number(l.ratingAvg),
  ratingCount: l.ratingCount,
  hasAiContent: l.hasAiContent,
  publishedAt: l.publishedAt,
  publishedStoryId: l.publishedStory.id,
  owned,
});

// Dang ban duoc: listing published VA nguoi ban con hoat dong (3 canh cao -> tai khoan ban bi khoa, an het).
const SELLABLE = { status: 'published', seller: { status: 'approved' } };

async function ownedListingIds(userId, listingIds) {
  if (!userId || !listingIds.length) return new Set();
  const rows = await prisma.entitlement.findMany({ where: { parentId: userId, listingId: { in: listingIds }, revokedAt: null }, select: { listingId: true } });
  return new Set(rows.map((r) => r.listingId));
}

/** GET /market/listings — chi truyen `published`. */
export async function listListings(user, { search, competency = 'all', age = 'all', priceTierId = 'all', sort = 'best_selling', page = 1, limit = 8 }) {
  const keyword = search?.trim();
  const where = {
    ...SELLABLE,
    ...(priceTierId !== 'all' && { priceTierId }),
    publishedStory: {
      topic: {
        ...(competency !== 'all' && { skill: { caselCode: competency } }),
        ...(age !== 'all' && { ageMin: { lte: Number(age) }, ageMax: { gte: Number(age) } }),
      },
    },
    ...(keyword && {
      OR: [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
        { seller: { displayName: { contains: keyword, mode: 'insensitive' } } },
        { publishedStory: { topic: { title: { contains: keyword, mode: 'insensitive' } } } },
      ],
    }),
  };
  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({ where, orderBy: SORTS[sort] ?? SORTS.best_selling, skip: (page - 1) * limit, take: limit, include: LISTING_INCLUDE }),
  ]);
  const owned = await ownedListingIds(user?.id, rows.map((r) => r.id));
  return {
    items: rows.map((r) => formatCard(r, owned.has(r.id))),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** GET /market/listings/:id — chi tiet + trang dau xem truoc (ten chung). */
export async function getListing(user, listingId) {
  const l = await prisma.listing.findFirst({ where: { id: listingId, ...SELLABLE }, include: LISTING_INCLUDE });
  if (!l) throw ApiError.notFound('Không tìm thấy truyện đang bán.');
  const [owned, first, characters] = await Promise.all([
    ownedListingIds(user?.id, [l.id]),
    prisma.storyPage.findFirst({ where: { storyId: l.publishedStoryId }, orderBy: { pageOrder: 'asc' }, select: { contentText: true } }),
    prisma.storyCharacter.findMany({ where: { storyId: l.publishedStoryId }, select: { token: true, aliasName: true } }),
  ]);
  const names = new Map(characters.map((c) => [c.token, c.aliasName]));
  const preview = first?.contentText?.replace(/\{NV\d+\}/g, (t) => names.get(t) ?? t) ?? null;
  return { listing: { ...formatCard(l, owned.has(l.id)), preview, isMine: l.sellerId === user?.id } };
}

/** GET /market/owned — truyen phu huynh da co quyen doc (de dua len gia sach cua be). */
export async function listOwned(user) {
  const rows = await prisma.entitlement.findMany({
    where: { parentId: user.id, revokedAt: null },
    orderBy: { grantedAt: 'desc' },
    include: { listing: { include: LISTING_INCLUDE } },
  });
  return rows.map((e) => ({ ...formatCard(e.listing, true), grantedAt: e.grantedAt }));
}

/**
 * POST /payments/listings/checkout { listingId } -> { order, checkoutUrl }.
 * Gia + ti le nguoi ban nhan duoc CHOT vao order_item luc dat (SNAPSHOT, DBML order_items).
 */
export async function checkoutListing(user, listingId) {
  const l = await prisma.listing.findFirst({ where: { id: listingId, ...SELLABLE }, include: { priceTier: true } });
  if (!l) throw ApiError.notFound('Không tìm thấy truyện đang bán.');
  if (l.sellerId === user.id) throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Đây là truyện của ba mẹ, không cần mua.');
  if ((await ownedListingIds(user.id, [l.id])).size) throw new ApiError(StatusCodes.CONFLICT, 'Ba mẹ đã có truyện này.');
  const { sellerShareRate } = await loadMarketSettings(prisma);
  const price = l.priceTier.priceVnd;
  const sellerAmount = BigInt(Math.floor(Number(price) * sellerShareRate));
  return checkoutOrder(user, {
    price,
    itemName: l.title,
    item: { itemType: 'listing', listingId: l.id, unitPriceVnd: price, sellerShareRate, sellerAmountVnd: sellerAmount },
    returnPath: '/parent/marketplace/result',
  });
}

export default { listListings, getListing, listOwned, checkoutListing };
