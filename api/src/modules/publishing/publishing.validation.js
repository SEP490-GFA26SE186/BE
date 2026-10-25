import { z } from 'zod';
import { PRICE_RULE_MESSAGE, validPriceVnd } from './lib/publish.js';

const uuid = (label) => z.string({ required_error: `Thiếu ${label}` }).uuid(`${label} không hợp lệ`);

const applySeller = z.object({
  body: z.object({
    displayName: z.string().trim().min(2, 'Biệt danh tối thiểu 2 ký tự').max(100),
    bio: z.string().max(2000).optional(),
    expertise: z.string().max(1000).optional(),
  }),
});
// Sua ho so ban (biet danh / gioi thieu / kinh nghiem); de trong bio / expertise = xoa.
const updateSeller = z.object({
  body: z
    .object({
      displayName: z.string().trim().min(2, 'Biệt danh tối thiểu 2 ký tự').max(100).optional(),
      bio: z.string().max(2000).optional(),
      expertise: z.string().max(1000).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: 'Không có gì để cập nhật' }),
});
const sellerDecision = z.object({ params: z.object({ userId: uuid('userId') }), body: z.object({ approve: z.boolean() }) });
const sellerList = z.object({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected', 'suspended']).default('pending') }) });

// 0 = mien phi (don 0d) hoac 5.000-500.000, boi 1.000.
const priceVnd = z
  .number({ error: 'Thiếu giá bán (priceVnd)' })
  .int('Giá bán phải là số nguyên')
  .refine(validPriceVnd, PRICE_RULE_MESSAGE);

const createListing = z.object({
  body: z.object({
    storyId: uuid('storyId'),
    title: z.string().trim().min(3, 'Tên truyện tối thiểu 3 ký tự').max(200),
    description: z.string().max(2000).optional(),
    priceVnd,
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
    decision: z.enum(['approved', 'changes_requested', 'rejected', 'taken_down']),
    comment: z.string().max(4000).optional(),
    issueStrike: z.boolean().optional(),
  })
    // Checklist su pham chi tren web: gui kem `checklist` (hay truong la) -> 400, khong lang le bo qua.
    .strict(),
});

export default { applySeller, updateSeller, sellerDecision, sellerList, createListing, review, viewPage, decide };
