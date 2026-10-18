import { z } from 'zod';

const ORDER_STATUSES = ['pending', 'paid', 'cancelled', 'expired'];
const ORDER_ITEM_TYPES = ['listing', 'plan'];

// =============================================================================
// Cart Validations
// =============================================================================

const addToCart = z.object({
  body: z.object({
    listingId: z.string({ required_error: 'Listing ID is required' }).uuid('Invalid listing ID format'),
  }),
});

const removeFromCart = z.object({
  params: z.object({
    listingId: z.string().uuid('Invalid listing ID format'),
  }),
});

// =============================================================================
// Order Validations
// =============================================================================

const createOrder = z.object({
  body: z
    .object({
      fromCart: z.boolean().optional(),
      itemType: z.enum(ORDER_ITEM_TYPES).optional(),
      itemId: z.string().uuid('Invalid item ID format').optional(),
    })
    .refine(
      (data) => data.fromCart || (data.itemType && data.itemId),
      'Must either order from cart (fromCart: true) or specify direct item (itemType and itemId)'
    ),
});

const getOrder = z.object({
  params: z.object({
    id: z.string().uuid('Invalid order ID format'),
  }),
});

const cancelOrder = z.object({
  params: z.object({
    id: z.string().uuid('Invalid order ID format'),
  }),
});

const getMyOrders = z.object({
  query: z.object({
    status: z.enum(ORDER_STATUSES).optional(),
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
  }),
});

// =============================================================================
// Entitlement Personalization Validations
// =============================================================================

const personalizeEntitlement = z.object({
  params: z.object({
    id: z.string().uuid('Invalid entitlement ID format'),
  }),
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    childId: z.string().uuid('Invalid child ID format').optional(),
    characters: z
      .array(
        z
          .object({
            token: z.string().trim().min(1).max(10).optional(),
            // Ten cu, giu de tuong thich FE
            slotKey: z.string().trim().min(1).max(10).optional(),
            characterId: z.string().uuid('Invalid character ID format').nullable().optional(),
          })
          .refine((c) => c.token || c.slotKey, 'token is required')
      )
      .default([]),
  }),
});

export default {
  addToCart,
  removeFromCart,
  createOrder,
  getOrder,
  cancelOrder,
  getMyOrders,
  personalizeEntitlement,
};
