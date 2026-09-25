import { z } from 'zod';

const REPORT_CATEGORIES = ['scary', 'violent', 'inappropriate_lesson', 'personal_info', 'technical_error', 'other'];
const MODERATION_DECISIONS = ['approved', 'changes_requested', 'rejected', 'taken_down'];
const STRIKE_SOURCES = ['report', 'rejection', 'takedown'];

const createKeyword = z.object({
  body: z.object({
    keyword: z
      .string({ required_error: 'Keyword is required' })
      .trim()
      .min(1, 'Keyword cannot be empty')
      .max(100, 'Keyword must not exceed 100 characters'),
    severity: z.enum(['block', 'warn']).default('block'),
  }),
});

const checkText = z.object({
  body: z.object({
    text: z.string({ required_error: 'Text to check is required' }).min(1, 'Text cannot be empty'),
  }),
});

const claimReview = z.object({
  params: z.object({
    listingId: z.string().uuid('Invalid listing ID format'),
  }),
});

const reviewDecision = z.object({
  params: z.object({
    reviewId: z.string().uuid('Invalid review ID format'),
  }),
  body: z.object({
    decision: z.enum(MODERATION_DECISIONS, {
      errorMap: () => ({ message: 'Invalid moderation decision (allowed: approved, changes_requested, rejected, taken_down)' }),
    }),
    comment: z.string().trim().max(2000, 'Comment must not exceed 2000 characters').optional(),
    checklist: z
      .array(
        z.object({
          checklistItemId: z.string().uuid('Invalid checklist item ID format'),
          passed: z.boolean(),
        }),
      )
      .optional(),
  }),
});

const createReport = z.object({
  body: z.object({
    listingId: z.string().uuid('Invalid listing ID format').optional(),
    pageId: z.string().uuid('Invalid page ID format').optional(),
    productReviewId: z.string().uuid('Invalid product review ID format').optional(),
    category: z.enum(REPORT_CATEGORIES, {
      errorMap: () => ({ message: 'Invalid report category' }),
    }),
    description: z.string().trim().max(1000, 'Report description must not exceed 1000 characters').optional(),
  }),
});

const resolveReport = z.object({
  params: z.object({
    reportId: z.string().uuid('Invalid report ID format'),
  }),
  body: z.object({
    status: z.enum(['resolved', 'dismissed'], {
      errorMap: () => ({ message: 'Status must be either resolved or dismissed' }),
    }),
  }),
});

const issueStrike = z.object({
  body: z.object({
    sellerId: z.string({ required_error: 'Seller ID is required' }).uuid('Invalid seller ID format'),
    source: z.enum(STRIKE_SOURCES),
    sourceId: z.string().uuid('Invalid source ID format').optional(),
    reason: z
      .string({ required_error: 'Strike reason is required' })
      .trim()
      .min(5, 'Reason must be at least 5 characters')
      .max(1000, 'Reason must not exceed 1000 characters'),
  }),
});

export default {
  createKeyword,
  checkText,
  claimReview,
  reviewDecision,
  createReport,
  resolveReport,
  issueStrike,
};
