import prisma from '../../config/prisma.js';
import ApiError from '../../utils/ApiError.js';
import plansService from '../plans/plans.service.js';
import storiesService from '../stories/stories.service.js';
import payosService from '../../services/payos.service.js';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a unique numeric PayOS order code (< 9007199254740991)
 * Combines 9 digits of timestamp with 3 random digits.
 */
const generatePayosOrderCode = () => {
  const tsPart = Date.now().toString().slice(-9);
  const randPart = Math.floor(Math.random() * 900 + 100).toString();
  return BigInt(`${tsPart}${randPart}`);
};

const DEFAULT_COMMISSION_PERCENT = 30;
const DEFAULT_HOLDING_DAYS = 7;

const ORDER_INCLUDE = {
  items: {
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          coverImageKey: true,
          sellerId: true,
          seller: { select: { displayName: true } },
        },
      },
      plan: true,
    },
  },
};

/**
 * Doc mot setting dang so trong platform_settings (value jsonb: 30 hoac { value: 30 })
 * @param {Object} client - prisma hoac tx
 * @param {string} key
 * @param {number} fallback
 * @returns {Promise<number>}
 */
const getNumericSetting = async (client, key, fallback) => {
  const setting = await client.platformSetting.findUnique({ where: { key } });
  const raw = setting?.value;
  const value = typeof raw === 'object' && raw !== null ? raw.value : raw;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * Cap quyen loi cho mot don vua chuyen sang paid (don 0d hoac webhook payOS).
 * Phai chay trong cung transaction voi buoc chuyen trang thai don.
 *  - listing: entitlement; truyen tra phi cong doanh thu treo (earning_pending) cho nguoi ban
 *  - plan: kich hoat goi + cap credit thang dau
 * @param {Object} tx - Prisma transaction client
 * @param {Object} order - don kem items (ORDER_INCLUDE)
 * @returns {Promise<Object>} { skippedListings } - truyen nguoi mua da so huu tu truoc (can hoan tien tay)
 */
const fulfillOrder = async (tx, order) => {
  const holdingDays = await getNumericSetting(tx, 'holding_days', DEFAULT_HOLDING_DAYS);
  const skippedListings = [];

  for (const item of order.items) {
    if (item.itemType === 'plan' && item.planId) {
      await plansService.activateSubscription(tx, {
        userId: order.buyerId,
        plan: item.plan,
        orderItemId: item.id,
      });
      continue;
    }

    if (item.itemType !== 'listing' || !item.listingId) continue;

    // Partial unique (parent_id, listing_id) WHERE revoked_at IS NULL: hai don song song cung mot truyen
    const owned = await tx.entitlement.findFirst({
      where: { parentId: order.buyerId, listingId: item.listingId, revokedAt: null },
    });
    if (owned) {
      skippedListings.push(item.listingId);
      continue;
    }

    await tx.entitlement.create({
      data: {
        parentId: order.buyerId,
        listingId: item.listingId,
        orderItemId: item.id,
      },
    });

    const isPaid = item.unitPriceVnd > 0n;
    await tx.listing.update({
      where: { id: item.listingId },
      data: isPaid ? { purchaseCount: { increment: 1 } } : { freeClaimCount: { increment: 1 } },
    });

    if (!isPaid || !item.sellerAmountVnd) continue;

    const sellerId = item.listing.sellerId;
    await tx.sellerProfile.update({
      where: { userId: sellerId },
      data: { totalSales: { increment: 1 } },
    });

    await tx.wallet.upsert({ where: { userId: sellerId }, update: {}, create: { userId: sellerId } });
    const sellerWallet = await tx.wallet.update({
      where: { userId: sellerId },
      data: { earningPendingVnd: { increment: item.sellerAmountVnd } },
    });

    await tx.walletLedger.create({
      data: {
        userId: sellerId,
        walletType: 'earning',
        entryType: 'earning_pending',
        amount: item.sellerAmountVnd,
        balanceAfter: sellerWallet.earningPendingVnd,
        // Cron chuyen sang kha dung khi qua available_at
        availableAt: new Date(Date.now() + holdingDays * 24 * 60 * 60 * 1000),
        idempotencyKey: `earning-pending-${item.id}`,
        refType: 'order_item',
        refId: item.id,
      },
    });
  }

  // Bo cac truyen vua mua khoi gio hang
  const listingIds = order.items.filter((i) => i.listingId).map((i) => i.listingId);
  if (listingIds.length > 0) {
    await tx.cartItem.deleteMany({ where: { parentId: order.buyerId, listingId: { in: listingIds } } });
  }

  return { skippedListings };
};

// =============================================================================
// 1. CART
// =============================================================================

/**
 * Get current user's shopping cart
 * @param {string} userId
 */
const getCart = async (userId) => {
  const items = await prisma.cartItem.findMany({
    where: { parentId: userId },
    include: {
      listing: {
        include: {
          priceTier: true,
          seller: {
            select: {
              userId: true,
              displayName: true,
            },
          },
          publishedStory: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: { addedAt: 'desc' },
  });

  const subtotalVnd = items.reduce((sum, item) => sum + (item.listing?.priceTier?.priceVnd || 0n), 0n);

  return {
    items,
    itemCount: items.length,
    subtotalVnd,
  };
};

/**
 * Add a listing to cart
 * @param {string} userId
 * @param {string} listingId
 */
const addToCart = async (userId, listingId) => {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { priceTier: true },
  });

  if (!listing || listing.status !== 'published') {
    throw ApiError.badRequest('Truyện không khả dụng hoặc chưa được xuất bản trên chợ');
  }

  if (listing.sellerId === userId) {
    throw ApiError.badRequest('Bạn không thể mua truyện do chính mình đăng bán');
  }

  // Check if user already owns this story
  const existingEntitlement = await prisma.entitlement.findFirst({
    where: {
      parentId: userId,
      listingId,
      revokedAt: null,
    },
  });

  if (existingEntitlement) {
    throw ApiError.badRequest('Bạn đã sở hữu truyện này rồi');
  }

  const cartItem = await prisma.cartItem.upsert({
    where: {
      parentId_listingId: {
        parentId: userId,
        listingId,
      },
    },
    create: {
      parentId: userId,
      listingId,
    },
    update: {
      addedAt: new Date(),
    },
    include: {
      listing: {
        include: {
          priceTier: true,
          publishedStory: { select: { title: true } },
        },
      },
    },
  });

  return {
    message: 'Đã thêm truyện vào giỏ hàng',
    cartItem,
  };
};

/**
 * Remove a listing from cart
 * @param {string} userId
 * @param {string} listingId
 */
const removeFromCart = async (userId, listingId) => {
  await prisma.cartItem.deleteMany({
    where: {
      parentId: userId,
      listingId,
    },
  });

  return { message: 'Đã xóa truyện khỏi giỏ hàng' };
};

/**
 * Clear all items from cart
 * @param {string} userId
 */
const clearCart = async (userId) => {
  const result = await prisma.cartItem.deleteMany({
    where: { parentId: userId },
  });

  return {
    message: 'Đã làm trống giỏ hàng',
    deletedCount: result.count,
  };
};

// =============================================================================
// 2. ORDERS
// =============================================================================

/**
 * Create an order (from cart or direct buy)
 * @param {string} userId
 * @param {Object} payload - { fromCart, itemType, itemId }
 */
const createOrder = async (userId, { fromCart, itemType, itemId }) => {
  let itemsToOrder = [];
  const commissionPercent = await getNumericSetting(prisma, 'commission_rate', DEFAULT_COMMISSION_PERCENT);
  const listingItem = (listingId, unitPriceVnd) => ({
    itemType: 'listing',
    listingId,
    unitPriceVnd,
    // SNAPSHOT ty le chia luc mua; nguoi ban nhan phan con lai sau hoa hong
    sellerShareRate: (100 - commissionPercent) / 100,
    sellerAmountVnd: (unitPriceVnd * BigInt(100 - commissionPercent)) / 100n,
  });

  if (fromCart) {
    const cartItems = await prisma.cartItem.findMany({
      where: { parentId: userId },
      include: {
        listing: {
          include: {
            priceTier: true,
            seller: true,
          },
        },
      },
    });

    if (cartItems.length === 0) {
      throw ApiError.badRequest('Giỏ hàng của bạn đang trống');
    }

    for (const item of cartItems) {
      if (!item.listing || item.listing.status !== 'published') {
        throw ApiError.badRequest(`Truyện "${item.listing?.title || 'đã chọn'}" hiện không còn mở bán`);
      }
      if (item.listing.sellerId === userId) {
        throw ApiError.badRequest(`Bạn không thể mua truyện "${item.listing.title}" do chính mình đăng bán`);
      }

      // Check ownership
      const owned = await prisma.entitlement.findFirst({
        where: { parentId: userId, listingId: item.listingId, revokedAt: null },
      });
      if (owned) {
        throw ApiError.badRequest(`Bạn đã sở hữu truyện "${item.listing.title}" rồi`);
      }

      itemsToOrder.push(listingItem(item.listingId, item.listing.priceTier.priceVnd));
    }
  } else {
    // Direct buy
    if (itemType === 'listing') {
      const listing = await prisma.listing.findUnique({
        where: { id: itemId },
        include: { priceTier: true },
      });

      if (!listing || listing.status !== 'published') {
        throw ApiError.badRequest('Truyện không khả dụng hoặc chưa được xuất bản');
      }
      if (listing.sellerId === userId) {
        throw ApiError.badRequest('Bạn không thể mua truyện do chính mình đăng bán');
      }

      const owned = await prisma.entitlement.findFirst({
        where: { parentId: userId, listingId: itemId, revokedAt: null },
      });
      if (owned) {
        throw ApiError.badRequest('Bạn đã sở hữu truyện này rồi');
      }

      itemsToOrder.push(listingItem(itemId, listing.priceTier.priceVnd));
    } else if (itemType === 'plan') {
      const plan = await prisma.plan.findUnique({
        where: { id: itemId },
      });

      if (!plan || !plan.isActive) {
        throw ApiError.badRequest('Gói hội viên không tồn tại hoặc đã ngừng cung cấp');
      }

      itemsToOrder.push({
        itemType: 'plan',
        planId: itemId,
        unitPriceVnd: plan.priceVnd,
        sellerShareRate: null,
        sellerAmountVnd: null,
      });
    }
  }

  // Calculate totals
  const subtotalVnd = itemsToOrder.reduce((sum, item) => sum + item.unitPriceVnd, 0n);
  const totalVnd = subtotalVnd;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  const isFree = totalVnd === 0n;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        buyerId: userId,
        subtotalVnd,
        discountVnd: 0n,
        totalVnd,
        status: isFree ? 'paid' : 'pending',
        // Don 0d khong di qua payOS
        payosOrderCode: isFree ? null : generatePayosOrderCode(),
        paidAt: isFree ? new Date() : null,
        expiresAt: isFree ? null : expiresAt,
        items: {
          create: itemsToOrder.map((item) => ({
            itemType: item.itemType,
            listingId: item.listingId || null,
            planId: item.planId || null,
            unitPriceVnd: item.unitPriceVnd,
            sellerShareRate: item.sellerShareRate ?? null,
            sellerAmountVnd: item.sellerAmountVnd ?? null,
            status: 'active',
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    // Don 0d: cap quyen ngay. Don tra phi: cho webhook payOS
    if (isFree) {
      await fulfillOrder(tx, created);
    }

    return created;
  });

  if (isFree) {
    return { order, checkoutUrl: null };
  }

  if (!payosService.isConfigured()) {
    console.warn(`payOS chua cau hinh: don ${order.id} nam o pending, khong co link thanh toan`);
    return { order, checkoutUrl: null };
  }

  try {
    const link = await payosService.createPaymentLink({
      orderCode: order.payosOrderCode,
      amount: order.totalVnd,
      // Tai khoan ngan hang chua lien ket payOS chi nhan mo ta toi da 9 ky tu
      description: `SW${String(order.payosOrderCode).slice(-6)}`,
      expiresAt,
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { payosPaymentLinkId: link.paymentLinkId },
      include: ORDER_INCLUDE,
    });
    return { order: updated, checkoutUrl: link.checkoutUrl };
  } catch (err) {
    console.error('Failed to create payOS payment link:', err.message);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'failed' } });
    throw new ApiError(502, 'Không tạo được link thanh toán, vui lòng thử lại');
  }
};

/**
 * Get buyer's orders with pagination
 * @param {string} userId
 * @param {Object} filter - { status, page, limit }
 */
const getMyOrders = async (userId, filter = {}) => {
  const { status, page = 1, limit = 10 } = filter;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  const where = { buyerId: userId };
  if (status) {
    where.status = status;
  }

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        items: {
          include: {
            listing: {
              select: {
                id: true,
                title: true,
                coverImageKey: true,
                seller: { select: { displayName: true } },
              },
            },
            plan: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    orders,
  };
};

/**
 * Get single order detail
 * @param {Object} user
 * @param {string} orderId
 */
const getOrderById = async (user, orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: {
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
        },
      },
      items: {
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              coverImageKey: true,
              seller: { select: { userId: true, displayName: true } },
            },
          },
          plan: true,
        },
      },
    },
  });

  if (!order) {
    throw ApiError.notFound('Không tìm thấy đơn hàng');
  }

  if (order.buyerId !== user.id && user.role !== 'admin') {
    throw ApiError.forbidden('Bạn không có quyền xem thông tin đơn hàng này');
  }

  return order;
};

/**
 * Cancel a pending order
 * @param {string} userId
 * @param {string} orderId
 */
const cancelOrder = async (userId, orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw ApiError.notFound('Không tìm thấy đơn hàng');
  }

  if (order.buyerId !== userId) {
    throw ApiError.forbidden('Bạn không có quyền thao tác trên đơn hàng này');
  }

  if (order.status !== 'pending') {
    throw ApiError.badRequest(`Không thể hủy đơn hàng ở trạng thái "${order.status}"`);
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'cancelled' },
  });

  return {
    message: 'Đã hủy đơn hàng thành công',
    order: updatedOrder,
  };
};

// =============================================================================
// 3. ENTITLEMENTS & PERSONALIZATION
// =============================================================================

/**
 * Get all active entitlements for current parent
 * @param {string} userId
 */
const getMyEntitlements = async (userId) => {
  const entitlements = await prisma.entitlement.findMany({
    where: {
      parentId: userId,
      revokedAt: null,
    },
    include: {
      listing: {
        include: {
          seller: { select: { userId: true, displayName: true } },
          publishedStory: {
            select: {
              id: true,
              title: true,
              topicId: true,
              topic: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { grantedAt: 'desc' },
  });

  return entitlements;
};

/**
 * Personalize an owned story into parent's private collection & bookshelf.
 * Tao truyen private tu ban published: gan nhan vat gia dinh vao token {NVx},
 * token khong gan giu ten chung (alias) cua nguoi ban.
 * @param {string} userId
 * @param {string} entitlementId
 * @param {Object} payload - { title, childId, characters: [{ token, characterId }] }
 */
const personalizeEntitlement = async (userId, entitlementId, { title, childId, characters = [] }) => {
  const entitlement = await prisma.entitlement.findFirst({
    where: {
      id: entitlementId,
      parentId: userId,
      revokedAt: null,
    },
    include: {
      listing: {
        include: {
          publishedStory: {
            include: { storyCharacters: true },
          },
        },
      },
    },
  });

  if (!entitlement) {
    throw ApiError.notFound('Không tìm thấy quyền sở hữu truyện này hoặc truyện đã bị thu hồi');
  }

  const publishedStory = entitlement.listing?.publishedStory;
  if (!publishedStory || publishedStory.deletedAt) {
    throw ApiError.notFound('Không tìm thấy dữ liệu truyện gốc để nhân bản');
  }

  // Validate child if provided
  if (childId) {
    const child = await prisma.childProfile.findFirst({
      where: { id: childId, parentId: userId, deletedAt: null },
    });
    if (!child) {
      throw ApiError.notFound('Không tìm thấy hồ sơ của bé hoặc bé không thuộc tài khoản của bạn');
    }
  }

  // Validate character bindings: token phai co trong truyen, nhan vat thuoc gia dinh
  const tokens = new Set(publishedStory.storyCharacters.map((sc) => sc.token));
  const characterByToken = new Map();
  for (const binding of characters) {
    const token = binding.token || binding.slotKey;
    if (!tokens.has(token)) {
      throw ApiError.badRequest(`Truyện không có nhân vật ${token}`);
    }
    if (characterByToken.has(token)) {
      throw ApiError.badRequest(`Nhân vật ${token} được gán nhiều lần`);
    }
    if (!binding.characterId) continue;

    const char = await prisma.character.findFirst({
      where: { id: binding.characterId, parentId: userId, deletedAt: null },
    });
    if (!char) {
      throw ApiError.notFound(`Không tìm thấy nhân vật gia đình (id: ${binding.characterId})`);
    }
    characterByToken.set(token, char.id);
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create new private Story clone
    const newStory = await tx.story.create({
      data: {
        ownerId: userId,
        kind: 'private',
        topicId: publishedStory.topicId,
        sourceStoryId: publishedStory.id,
        length: publishedStory.length,
        title: title || publishedStory.title,
        useAiImage: publishedStory.useAiImage,
        useTts: publishedStory.useTts,
        status: 'ready',
        // Noi dung da qua kiem duyet tren cho -> dua len gia sach duoc ngay
        reviewedAt: new Date(),
      },
    });

    // 2. Bind characters: dung mot trong character_id / alias_name
    for (const sc of publishedStory.storyCharacters) {
      const characterId = characterByToken.get(sc.token) || null;
      await tx.storyCharacter.create({
        data: {
          storyId: newStory.id,
          token: sc.token,
          characterId,
          aliasName: characterId ? null : sc.aliasName,
          isMain: sc.isMain,
        },
      });
    }

    // 3. Clone scenes, pages, checkpoints. Doi ten nhan vat thi file doc cu khong con dung
    await storiesService.cloneStoryContent(tx, {
      sourceStoryId: publishedStory.id,
      targetStoryId: newStory.id,
      keepAudio: characterByToken.size === 0,
    });

    // 4. Place on child bookshelf if specified
    if (childId) {
      await tx.bookshelfItem.upsert({
        where: {
          childId_storyId: {
            childId,
            storyId: newStory.id,
          },
        },
        create: {
          childId,
          storyId: newStory.id,
        },
        update: {
          addedAt: new Date(),
        },
      });
    }

    return {
      message: 'Cá nhân hóa truyện thành công! Truyện đã sẵn sàng trong thư viện gia đình.',
      storyId: newStory.id,
      title: newStory.title,
      childId: childId || null,
      needsNarration: characterByToken.size > 0 && newStory.useTts,
    };
  });
};

export {
  // Cart
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  // Orders
  createOrder,
  fulfillOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  // Entitlements
  getMyEntitlements,
  personalizeEntitlement,
};
