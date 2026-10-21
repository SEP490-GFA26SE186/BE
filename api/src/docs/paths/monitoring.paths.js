// Giam sat noi dung (rev8 luong 7): bao cao, tam go, canh cao + khang nghi, kiem tra ngau nhien.
const bearer = [{ BearerAuth: [] }];
const path = (name) => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const json = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const CATEGORIES = ['scary', 'violent', 'inappropriate_lesson', 'personal_info', 'technical_error', 'other'];

export default {
  '/market/report-categories': {
    get: { tags: ['Market'], summary: 'Loại vi phạm để báo cáo (value + nhãn tiếng Việt)', security: bearer, responses: { 200: { description: '{ categories: [{ value, label }] }' } } },
  },
  '/market/listings/{listingId}/reports': {
    post: {
      tags: ['Market'],
      summary: '[Parent] Báo cáo truyện đang bán',
      description:
        'Mỗi phụ huynh một lần / truyện (409). Không báo cáo truyện của mình (422). `pageId` tuỳ chọn. Đủ `moderation.report_threshold` (mặc định 3) người **khác nhau** trong 24 giờ → tự tạm gỡ (suspended) + tạo lượt hậu kiểm `report_followup`.',
      security: bearer,
      parameters: [path('listingId')],
      requestBody: json({
        type: 'object',
        required: ['category'],
        properties: { category: { type: 'string', enum: CATEGORIES }, description: { type: 'string' }, pageId: { type: 'string', format: 'uuid' } },
      }),
      responses: { 201: { description: '{ reportId, suspended }' }, 404: { description: 'Truyện không còn bán' }, 409: { description: 'Đã báo cáo' } },
    },
  },

  '/moderation/reports': {
    get: {
      tags: ['Moderation'],
      summary: '[Specialist] Báo cáo vi phạm, gom theo truyện',
      security: bearer,
      parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'resolved', 'dismissed', 'all'], default: 'open' } }],
      responses: { 200: { description: '{ groups: [{ listing, openReview, reports: [{ id, category, description, status, reporter, pageOrder, createdAt }] }] }' } },
    },
  },
  '/moderation/reports/{reportId}/dismiss': {
    post: { tags: ['Moderation'], summary: '[Specialist] Bác báo cáo (không vi phạm)', security: bearer, parameters: [path('reportId')], responses: { 200: { description: '{ reportId, status }' }, 409: { description: 'Đã xử lý' } } },
  },
  '/moderation/listings': {
    get: {
      tags: ['Moderation'],
      summary: '[Specialist] Truyện đang tạm gỡ / đã gỡ hẳn',
      security: bearer,
      parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['suspended', 'archived'], default: 'suspended' } }],
      responses: { 200: { description: '{ listings: [{ id, title, seller, reportsCount, buyersCount, review }] }' } },
    },
  },
  '/moderation/listings/{listingId}/suspend': {
    post: {
      tags: ['Moderation'],
      summary: '[Specialist] Tạm gỡ truyện đang bán',
      description: 'Ẩn khỏi chợ, không mua được, bé đã mua tạm không đọc được. Tạo lượt hậu kiểm để quyết giữ / gỡ hẳn trong không gian duyệt.',
      security: bearer,
      parameters: [path('listingId')],
      requestBody: json({ type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } }),
      responses: { 200: { description: '{ listingId, status, reviewId }' }, 409: { description: 'Không phải truyện đang bán' } },
    },
  },
  '/moderation/strikes': {
    get: {
      tags: ['Moderation'],
      summary: '[Specialist] Danh sách cảnh cáo',
      security: bearer,
      parameters: [
        { name: 'sellerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'active', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: { description: '{ strikeLimit, strikes: [{ id, source, reason, issuedAt, expiresAt, active, seller, issuer, appeal }] }' } },
    },
    post: {
      tags: ['Moderation'],
      summary: '[Specialist] Cảnh cáo tác giả',
      description: 'Hiệu lực 90 ngày. Đủ 3 cảnh cáo còn hiệu lực → khoá tài khoản bán (ẩn mọi truyện khỏi chợ, không đăng bán mới).',
      security: bearer,
      requestBody: json({
        type: 'object',
        required: ['sellerId', 'source', 'reason'],
        properties: { sellerId: { type: 'string', format: 'uuid' }, source: { type: 'string', enum: ['report', 'rejection', 'takedown'] }, sourceId: { type: 'string', format: 'uuid' }, reason: { type: 'string' } },
      }),
      responses: { 201: { description: '{ strikeId, activeStrikes, strikeLimit, sellerSuspended }' } },
    },
  },
  '/moderation/audits': {
    get: {
      tags: ['Moderation'],
      summary: '[Specialist] Lượt kiểm tra ngẫu nhiên',
      security: bearer,
      parameters: [{ name: 'open', in: 'query', schema: { type: 'boolean' } }],
      responses: { 200: { description: '{ audits: [{ reviewId, listing, createdAt, decidedAt, decision, moderator }] }' } },
    },
  },
  '/moderation/audits/run': {
    post: {
      tags: ['Moderation'],
      summary: '[Specialist] Chọn ngay một đợt kiểm tra ngẫu nhiên',
      description: 'Worker tự chọn mỗi tuần `moderation.audit_per_week` truyện; nút này chọn ngay. Ưu tiên truyện lâu chưa kiểm, bỏ truyện đang có lượt duyệt mở.',
      security: bearer,
      requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 20 } } } } } },
      responses: { 201: { description: '{ created, reviewIds }' } },
    },
  },

  '/moderation/ai-flags': {
    get: {
      tags: ['Moderation'],
      summary: '[Specialist] Cảnh báo AI: phụ huynh có nhiều lượt AI bị chặn',
      description: 'Luồng 7.6. Bị chặn = ai_requests.status blocked (guardrail). Kèm phụ huynh đang bị khoá quyền dùng AI.',
      security: bearer,
      parameters: [
        { name: 'days', in: 'query', schema: { type: 'integer', default: 7 } },
        { name: 'min', in: 'query', schema: { type: 'integer', default: 2 } },
      ],
      responses: { 200: { description: '{ days, min, flags: [{ userId, fullName, email, total, blocked, failed, blockedRate, lastBlocked, aiBlockedUntil }] }' } },
    },
  },
  '/moderation/ai-flags/{userId}/block': {
    post: {
      tags: ['Moderation'],
      summary: '[Specialist] Tạm khoá / mở khoá quyền dùng AI',
      description: 'days > 0: khoá đến now + days (sinh truyện bằng AI trả 403; vẫn đọc / tự viết được). days = 0: mở khoá. Ghi nhật ký.',
      security: bearer,
      parameters: [path('userId')],
      requestBody: json({ type: 'object', required: ['days'], properties: { days: { type: 'integer', minimum: 0, maximum: 90 }, reason: { type: 'string' } } }),
      responses: { 200: { description: '{ userId, aiBlockedUntil }' } },
    },
  },

  '/sellers/me/strikes': {
    get: { tags: ['Publishing'], summary: '[Seller] Cảnh cáo của tôi', security: bearer, responses: { 200: { description: '{ sellerStatus, strikeLimit, activeStrikes, strikes }' } } },
  },
  '/sellers/me/strikes/{strikeId}/appeal': {
    post: {
      tags: ['Publishing'],
      summary: '[Seller] Kháng nghị cảnh cáo',
      description: 'Chỉ cảnh cáo còn hiệu lực, mỗi cảnh cáo một lần (409).',
      security: bearer,
      parameters: [path('strikeId')],
      requestBody: json({ type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 20 } } }),
      responses: { 201: { description: '{ appealId, status }' } },
    },
  },
  '/admin/appeals': {
    get: {
      tags: ['Admin'],
      summary: '[Admin] Kháng nghị cảnh cáo',
      security: bearer,
      parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'], default: 'pending' } }],
      responses: { 200: { description: '{ appeals }' } },
    },
  },
  '/admin/appeals/{appealId}/decision': {
    post: {
      tags: ['Admin'],
      summary: '[Admin] Xét kháng nghị',
      description: 'Người ra cảnh cáo không tự xét (403). Chấp thuận → thu hồi cảnh cáo; còn dưới ngưỡng thì mở lại tài khoản bán. Từ chối phải có lý do.',
      security: bearer,
      parameters: [path('appealId')],
      requestBody: json({ type: 'object', required: ['approve'], properties: { approve: { type: 'boolean' }, note: { type: 'string' } } }),
      responses: { 200: { description: '{ appealId, status, strikeRevoked, sellerReinstated }' } },
    },
  },
};
