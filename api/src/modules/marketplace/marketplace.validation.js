import { z } from 'zod';

const REVIEW_TAGS = ['child_liked', 'age_appropriate', 'clear_lesson', 'beautiful_art', 'good_narration'];
const SORT_OPTIONS = ['newest', 'rating', 'popular', 'price_asc', 'price_desc'];

const registerSeller = z.object({
  body: z.object({
    displayName: z
      .string({ required_error: 'Display name is required' })
      .trim()
      .min(2, 'Display name must be at least 2 characters')
      .max(100, 'Display name must not exceed 100 characters'),
    bio: z.string().trim().max(1000, 'Bio must not exceed 1000 characters').optional(),
    expertise: z.string().trim().max(200, 'Expertise must not exceed 200 characters').optional(),
    bankName: z.string().trim().max(100).optional(),
    bankAccountNumber: z.string().trim().max(50).optional(),
    bankAccountHolder: z.string().trim().max(150).optional(),
  }),
});

const updateSeller = z.object({
  body: z.object({
    displayName: z.string().trim().min(2).max(100).optional(),
    bio: z.string().trim().max(1000).optional(),
    expertise: z.string().trim().max(200).optional(),
    bankName: z.string().trim().max(100).optional(),
    bankAccountNumber: z.string().trim().max(50).optional(),
    bankAccountHolder: z.string().trim().max(150).optional(),
  }),
});

const getListings = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    skillId: z.string().uuid('Invalid skill ID format').optional(),
    age: z
      .string()
      .regex(/^\d+$/, 'Age must be an integer')
      .transform(Number)
      .optional(),
    isFree: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .optional(),
    sortBy: z.enum(SORT_OPTIONS).default('newest'),
    page: z
      .string()
      .regex(/^\d+$/, 'Page must be an integer')
      .transform(Number)
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/, 'Limit must be an integer')
      .transform(Number)
      .default('10'),
  }),
});

const getListing = z.object({
  params: z.object({
    id: z.string().uuid('Invalid listing ID format'),
  }),
});

const createListing = z.object({
  body: z.object({
    publishedStoryId: z.string({ required_error: 'Story ID is required' }).uuid('Invalid story ID format'),
    priceTierId: z.string({ required_error: 'Price tier ID is required' }).uuid('Invalid price tier ID format'),
    title: z
      .string({ required_error: 'Listing title is required' })
      .trim()
      .min(2, 'Title must be at least 2 characters')
      .max(200, 'Title must not exceed 200 characters'),
    description: z.string().trim().max(2000, 'Description must not exceed 2000 characters').optional(),
    coverImageKey: z.string().trim().max(300).optional(),
    hasAiContent: z.boolean().default(false),
  }),
});

const claimFreeListing = z.object({
  params: z.object({
    id: z.string().uuid('Invalid listing ID format'),
  }),
});

const createReview = z.object({
  params: z.object({
    id: z.string().uuid('Invalid listing ID format'),
  }),
  body: z.object({
    rating: z
      .number({ required_error: 'Rating is required' })
      .int('Rating must be an integer')
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating must not exceed 5'),
    comment: z.string().trim().max(1000, 'Review comment must not exceed 1000 characters').optional(),
    tags: z.array(z.enum(REVIEW_TAGS)).optional(),
  }),
});

const replyReview = z.object({
  params: z.object({
    reviewId: z.string().uuid('Invalid review ID format'),
  }),
  body: z.object({
    reply: z
      .string({ required_error: 'Seller reply is required' })
      .trim()
      .min(1, 'Reply cannot be empty')
      .max(1000, 'Reply must not exceed 1000 characters'),
  }),
});

export default {
  registerSeller,
  updateSeller,
  getListings,
  getListing,
  createListing,
  claimFreeListing,
  createReview,
  replyReview,
};
