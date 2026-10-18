import { z } from 'zod';

const uuid = (label) => z.string({ required_error: `Thiếu ${label}` }).uuid(`${label} không hợp lệ`);

const applySeller = z.object({
  body: z.object({
    displayName: z.string().trim().min(2, 'Biệt danh tối thiểu 2 ký tự').max(100),
    bio: z.string().max(2000).optional(),
    expertise: z.string().max(1000).optional(),
  }),
});
const sellerDecision = z.object({ params: z.object({ userId: uuid('userId') }), body: z.object({ approve: z.boolean() }) });
const sellerList = z.object({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected', 'suspended']).default('pending') }) });

const createListing = z.object({
  body: z.object({
    storyId: uuid('storyId'),
    title: z.string().trim().min(3, 'Tên truyện tối thiểu 3 ký tự').max(200),
    description: z.string().max(2000).optional(),
    priceTierId: uuid('priceTierId'),
    aliases: z.array(z.object({ token: z.string().regex(/^\{NV\d+\}$/), aliasName: z.string().max(100) })).min(1),
  }),
});

const review = z.object({ params: z.object({ reviewId: uuid('reviewId') }) });
const viewPage = z.object({
  params: z.object({ reviewId: uuid('reviewId'), pageId: uuid('pageId') }),
  body: z.object({ comment: z.string().max(2000).optional() }).default({}),
});
const decide = z.object({
  params: z.object({ reviewId: uuid('reviewId') }),
  body: z.object({
    decision: z.enum(['approved', 'changes_requested', 'rejected']),
    comment: z.string().max(4000).optional(),
    checklist: z.array(z.object({ itemId: uuid('itemId'), passed: z.boolean() })).default([]),
  }),
});

export default { applySeller, sellerDecision, sellerList, createListing, review, viewPage, decide };
