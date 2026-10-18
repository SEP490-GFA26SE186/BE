// Danh gia truyen (luong 4.6, 7.3) + bao cao EQ chi tiet (luong 5.6).
const bearer = [{ BearerAuth: [] }];
const path = (name) => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const json = (properties, required) => ({ required: true, content: { 'application/json': { schema: { type: 'object', required, properties } } } });

export default {
  '/market/listings/{listingId}/reviews': {
    get: {
      tags: ['Market'],
      summary: 'Đánh giá của truyện + quyền đánh giá của người xem',
      security: bearer,
      parameters: [path('listingId'), { name: 'page', in: 'query', schema: { type: 'integer' } }],
      responses: { 200: { description: '{ reviews, distribution, pagination, myReview, canReview, reason: not_owned|not_finished|null, isSeller, tags }' } },
    },
  },
  '/market/listings/{listingId}/review': {
    put: {
      tags: ['Market'],
      summary: '[Parent] Tạo / sửa đánh giá của mình',
      description: 'Chỉ khi đang có quyền đọc VÀ có bé đã đọc hết truyện. Mỗi phụ huynh một đánh giá / truyện. Điểm truyện và người bán tính lại từ đánh giá chưa bị ẩn.',
      security: bearer,
      parameters: [path('listingId')],
      requestBody: json({ rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string' }, tags: { type: 'array', items: { type: 'string', enum: ['child_liked', 'age_appropriate', 'clear_lesson', 'good_narration'] } } }, ['rating']),
      responses: { 200: { description: '{ review, created }' }, 422: { description: 'Chưa mua / bé chưa đọc hết / tự đánh giá' }, 403: { description: 'Đánh giá đã bị ẩn' } },
    },
  },
  '/market/reviews/{reviewId}/reply': {
    post: { tags: ['Market'], summary: '[Seller] Trả lời đánh giá (một lần)', security: bearer, parameters: [path('reviewId')], requestBody: json({ reply: { type: 'string' } }, ['reply']), responses: { 200: { description: '{ review }' }, 409: { description: 'Đã trả lời' } } },
  },
  '/market/reviews/{reviewId}/reports': {
    post: { tags: ['Market'], summary: '[Parent] Báo cáo đánh giá', security: bearer, parameters: [path('reviewId')], requestBody: json({ category: { type: 'string' }, description: { type: 'string' } }, ['category']), responses: { 201: { description: '{ reportId }' }, 409: { description: 'Đã báo cáo' } } },
  },
  '/moderation/product-reviews/{reviewId}/hide': {
    post: { tags: ['Moderation'], summary: '[Moderator] Ẩn đánh giá vi phạm', description: 'Đóng các báo cáo đang mở của đánh giá, tính lại điểm truyện và người bán.', security: bearer, parameters: [path('reviewId')], responses: { 200: { description: '{ reviewId, hidden, reportsResolved }' } } },
  },
  '/children/{id}/eq-journey': {
    get: {
      tags: ['Children'],
      summary: '[Parent] Báo cáo EQ chi tiết của bé',
      description: 'Chỉ câu trả lời ở lượt đọc đầu. Điểm 0–100; mỗi năng lực cần ≥ 5 câu mới có điểm cộng dồn.',
      security: bearer,
      parameters: [path('id'), { name: 'weeks', in: 'query', schema: { type: 'integer', minimum: 4, maximum: 26, default: 8 } }],
      responses: { 200: { description: '{ skills, strongest, focus, totals, trend: [{ weekStart, skills }], byType, recent }' } },
    },
  },
};
