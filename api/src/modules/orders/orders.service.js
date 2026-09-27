import prisma from '../../config/prisma.js';
import ApiError from '../../utils/ApiError.js';

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

/**
 * Create a user notification safely without failing main transaction
 */
const createNotification = async (tx, { userId, type, title, body, refType, refId }) => {
  try {
    const client = tx || prisma;
    await client.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        refType: refType || null,
        refId: refId || null,
      },
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
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
              coverImageKey: true,
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
          publishedStory: { select: { title: true, coverImageKey: true } },
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

      const unitPriceVnd = item.listing.priceTier.priceVnd;
      // 70% for seller, 30% for platform
      const sellerAmountVnd = (unitPriceVnd * 70n) / 100n;

      itemsToOrder.push({
        itemType: 'listing',
        listingId: item.listingId,
        unitPriceVnd,
        sellerShareRate: 0.7,
        sellerAmountVnd,
      });
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

      const unitPriceVnd = listing.priceTier.priceVnd;
      const sellerAmountVnd = (unitPriceVnd * 70n) / 100n;

      itemsToOrder.push({
        itemType: 'listing',
        listingId: itemId,
        unitPriceVnd,
        sellerShareRate: 0.7,
        sellerAmountVnd,
      });
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
    } else if (itemType === 'credit_pack') {
      const pack = await prisma.creditPack.findUnique({
        where: { id: itemId },
      });

      if (!pack || !pack.isActive) {
        throw ApiError.badRequest('Gói nạp Credit không tồn tại hoặc đã ngừng cung cấp');
      }

      itemsToOrder.push({
        itemType: 'credit_pack',
        creditPackId: itemId,
        unitPriceVnd: pack.priceVnd,
        creditsGranted: pack.credits,
        bonusGranted: pack.bonusCredits,
        sellerShareRate: null,
        sellerAmountVnd: null,
      });
    }
  }

  // Calculate totals
  const subtotalVnd = itemsToOrder.reduce((sum, item) => sum + item.unitPriceVnd, 0n);
  const totalVnd = subtotalVnd;
  const payosOrderCode = generatePayosOrderCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  return prisma.$transaction(async (tx) => {
    const isFree = totalVnd === 0n;

    const order = await tx.order.create({
      data: {
        buyerId: userId,
        subtotalVnd,
        discountVnd: 0n,
        totalVnd,
        status: isFree ? 'paid' : 'pending',
        payosOrderCode,
        paidAt: isFree ? new Date() : null,
        expiresAt,
        items: {
          create: itemsToOrder.map((item) => ({
            itemType: item.itemType,
            listingId: item.listingId || null,
            planId: item.planId || null,
            creditPackId: item.creditPackId || null,
            unitPriceVnd: item.unitPriceVnd,
            creditsGranted: item.creditsGranted || null,
            bonusGranted: item.bonusGranted || null,
            sellerShareRate: item.sellerShareRate || null,
            sellerAmountVnd: item.sellerAmountVnd || null,
            status: 'active',
          })),
        },
      },
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
            creditPack: true,
          },
        },
      },
    });

    // If order is free (0 VND), immediately fulfill entitlements/benefits!
    if (isFree) {
      for (const item of order.items) {
        if (item.itemType === 'listing' && item.listingId) {
          await tx.entitlement.create({
            data: {
              parentId: userId,
              listingId: item.listingId,
              source: 'free_claim',
              orderItemId: item.id,
            },
          });

          await tx.listing.update({
            where: { id: item.listingId },
            data: {
              freeClaimCount: { increment: 1 },
            },
          });
        } else if (item.itemType === 'plan' && item.planId) {
          const plan = await tx.plan.findUnique({ where: { id: item.planId } });
          const days = plan?.period === 'year' ? 365 : 30;
          await tx.subscription.create({
            data: {
              parentId: userId,
              planId: item.planId,
              orderItemId: item.id,
              periodStart: new Date(),
              periodEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
              status: 'active',
            },
          });
        } else if (item.itemType === 'credit_pack' && item.creditPackId) {
          const totalCredits = (item.creditsGranted || 0) + (item.bonusGranted || 0);
          let wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) {
            wallet = await tx.wallet.create({
              data: {
                userId,
                creditBalance: 0,
                earningPendingVnd: 0n,
                earningAvailableVnd: 0n,
                earningLockedVnd: 0n,
              },
            });
          }

          const newBalance = wallet.creditBalance + totalCredits;
          await tx.wallet.update({
            where: { userId },
            data: { creditBalance: newBalance },
          });

          await tx.walletLedger.create({
            data: {
              userId,
              walletType: 'credit',
              entryType: 'credit_topup',
              amount: BigInt(totalCredits),
              balanceAfter: BigInt(newBalance),
              idempotencyKey: `order-${order.id}-${item.id}`,
              refType: 'order',
              refId: order.id,
            },
          });
        }
      }

      if (fromCart) {
        await tx.cartItem.deleteMany({ where: { parentId: userId } });
      }

      await createNotification(tx, {
        userId,
        type: 'order_completed',
        title: 'Đơn hàng hoàn tất',
        body: `Đơn hàng #${order.payosOrderCode} miễn phí đã được kích hoạt thành công.`,
        refType: 'order',
        refId: order.id,
      });
    } else {
      if (fromCart) {
        await tx.cartItem.deleteMany({ where: { parentId: userId } });
      }
    }

    return order;
  });
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
            creditPack: true,
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
          creditPack: true,
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
              coverImageKey: true,
              templateId: true,
              template: {
                select: {
                  title: true,
                  slots: true,
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
 * Personalize an owned story into parent's private collection & bookshelf
 * @param {string} userId
 * @param {string} entitlementId
 * @param {Object} payload - { title, childId, characters: [{ slotKey, characterId }] }
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
            include: {
              pages: {
                include: {
                  choices: true,
                },
                orderBy: { pageOrder: 'asc' },
              },
              storyCharacters: true,
            },
          },
        },
      },
    },
  });

  if (!entitlement) {
    throw ApiError.notFound('Không tìm thấy quyền sở hữu truyện này hoặc truyện đã bị thu hồi');
  }

  const publishedStory = entitlement.listing?.publishedStory;
  if (!publishedStory) {
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

  // Validate characters if provided
  for (const c of characters) {
    if (c.characterId) {
      const char = await prisma.character.findFirst({
        where: { id: c.characterId, parentId: userId, deletedAt: null },
      });
      if (!char) {
        throw ApiError.notFound(`Không tìm thấy nhân vật gia đình (id: ${c.characterId})`);
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create new private Story clone
    const newStory = await tx.story.create({
      data: {
        ownerId: userId,
        kind: 'private',
        templateId: publishedStory.templateId,
        sourceStoryId: publishedStory.id,
        title: title || publishedStory.title,
        coverImageKey: publishedStory.coverImageKey,
        useAiImage: publishedStory.useAiImage,
        useTts: publishedStory.useTts,
        status: 'ready',
        reviewedAt: new Date(),
      },
    });

    // 2. Bind characters
    if (characters.length > 0) {
      for (const charBinding of characters) {
        await tx.storyCharacter.create({
          data: {
            storyId: newStory.id,
            slotKey: charBinding.slotKey,
            characterId: charBinding.characterId || null,
          },
        });
      }
    } else {
      // Default: copy existing slots with empty bindings
      for (const sc of publishedStory.storyCharacters) {
        await tx.storyCharacter.create({
          data: {
            storyId: newStory.id,
            slotKey: sc.slotKey,
            characterId: null,
          },
        });
      }
    }

    // 3. Two-phase clone of pages and choices to preserve branching
    const oldChoiceIdToNewChoiceId = new Map();
    const createdPagesWithOldChoices = [];

    // Phase A: Create pages and choices
    for (const page of publishedStory.pages) {
      const newPage = await tx.storyPage.create({
        data: {
          storyId: newStory.id,
          stageId: page.stageId,
          pageKind: page.pageKind,
          pageOrder: page.pageOrder,
          contentText: page.contentText,
          aiOriginalText: page.aiOriginalText,
          origin: page.origin,
          backgroundId: page.backgroundId,
          imageKey: page.imageKey,
          audioKey: page.audioKey,
          imageStatus: 'completed',
          audioStatus: page.audioKey ? 'completed' : 'none',
        },
      });

      if (page.fromChoiceId) {
        createdPagesWithOldChoices.push({
          newPageId: newPage.id,
          oldFromChoiceId: page.fromChoiceId,
        });
      }

      for (const choice of page.choices) {
        const newChoice = await tx.storyChoice.create({
          data: {
            pageId: newPage.id,
            choiceOrder: choice.choiceOrder,
            choiceText: choice.choiceText,
            choiceTypeId: choice.choiceTypeId,
            audioKey: choice.audioKey,
          },
        });
        oldChoiceIdToNewChoiceId.set(choice.id, newChoice.id);
      }
    }

    // Phase B: Link consequence branch points
    for (const item of createdPagesWithOldChoices) {
      const mappedChoiceId = oldChoiceIdToNewChoiceId.get(item.oldFromChoiceId);
      if (mappedChoiceId) {
        await tx.storyPage.update({
          where: { id: item.newPageId },
          data: { fromChoiceId: mappedChoiceId },
        });
      }
    }

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
  getMyOrders,
  getOrderById,
  cancelOrder,
  // Entitlements
  getMyEntitlements,
  personalizeEntitlement,
};
