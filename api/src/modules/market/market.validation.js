import { z } from 'zod';

const COMPETENCY = ['all', 'self_awareness', 'self_management', 'social_awareness', 'relationship_skills', 'responsible_decision_making'];

const list = z.object({
  query: z.object({
    search: z.string().max(200).optional(),
    competency: z.enum(COMPETENCY).default('all'),
    age: z.union([z.literal('all'), z.string().regex(/^\d{1,2}$/)]).default('all'),
    // Loc theo khoang gia (VND, gom ca hai dau); 0 = mien phi.
    priceMin: z.coerce.number().int().min(0).optional(),
    priceMax: z.coerce.number().int().min(0).optional(),
    narration: z.enum(['all', 'with', 'without']).default('all'),
    sort: z.enum(['best_selling', 'newest', 'rating', 'price_asc']).default('best_selling'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(8),
  }).refine((q) => q.priceMin === undefined || q.priceMax === undefined || q.priceMin <= q.priceMax, {
    message: 'priceMin phải nhỏ hơn hoặc bằng priceMax',
    path: ['priceMax'],
  }),
});
const one = z.object({ params: z.object({ listingId: z.string().uuid('listingId không hợp lệ') }) });
const checkout = z.object({ body: z.object({ listingId: z.string({ required_error: 'Thiếu listingId' }).uuid('listingId không hợp lệ') }) });

export default { list, one, checkout };
