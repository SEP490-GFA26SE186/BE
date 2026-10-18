// Bai hoc (topics) + tu khoa bi chan (blocked_keywords) — Moderator quan ly (rev8).
const bearer = [{ BearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const topicBody = (required) => ({
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        ...(required && { required: ['title', 'skillId', 'guidance'] }),
        properties: {
          title: { type: 'string', example: 'Khi bé giận em' },
          skillId: { type: 'string', format: 'uuid', description: 'Năng lực CASEL. Bài học đã có truyện dùng thì không đổi được (422).' },
          guidance: { type: 'string', description: 'Hướng dẫn cho AI viết truyện (phụ huynh không thấy).' },
          ageMin: { type: 'integer', minimum: 1, maximum: 18, default: 5 },
          ageMax: { type: 'integer', minimum: 1, maximum: 18, default: 8 },
          displayOrder: { type: 'integer', default: 0 },
          isActive: { type: 'boolean', default: true },
        },
      },
    },
  },
});

export default {
  '/topics': {
    get: {
      tags: ['Topics'],
      summary: 'Danh sách bài học',
      description:
        '**Phụ huynh:** chỉ bài học đang dùng, không kèm `guidance`.\n**Moderator / Admin:** mọi bài học + `guidance`, `storiesCount`, `creator`; lọc `skillId`, `search`, `isActive`.',
      security: bearer,
      parameters: [
        { name: 'skillId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: { description: 'Mảng bài học trong `data`' } },
    },
    post: {
      tags: ['Topics'],
      summary: '[Moderator | Admin] Tạo bài học',
      security: bearer,
      requestBody: topicBody(true),
      responses: { 201: { description: 'Đã tạo' }, 400: { description: 'Dữ liệu sai (vd. ageMin > ageMax)' }, 403: { description: 'Không phải Moderator / Admin' } },
    },
  },
  '/topics/{id}': {
    put: {
      tags: ['Topics'],
      summary: '[Moderator | Admin] Sửa bài học',
      description: 'Một bài học dùng cho nhiều truyện. Đã có truyện dùng thì **khoá năng lực CASEL** (điểm năng lực của truyện cũ phải giữ nguyên ý nghĩa).',
      security: bearer,
      parameters: [idParam],
      requestBody: topicBody(false),
      responses: { 200: { description: 'Đã sửa' }, 404: { description: 'Không tìm thấy' }, 422: { description: 'Đổi năng lực khi đã có truyện dùng' } },
    },
    delete: {
      tags: ['Topics'],
      summary: '[Moderator | Admin] Xoá bài học',
      description: 'Chưa có truyện dùng → xoá hẳn (`deleted: true`). Đã có truyện → chuyển **ngưng dùng** (`deactivated: true`), truyện cũ vẫn đọc / bán bình thường.',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: '`{ deleted, deactivated, message }`' }, 404: { description: 'Không tìm thấy' } },
    },
  },

  '/moderation/keywords': {
    get: {
      tags: ['Moderation'],
      summary: '[Moderator | Admin] Danh sách từ khoá bị chặn',
      description:
        'Dùng ở hai nơi: gửi sang AI mỗi lần sinh truyện, và kiểm chữ phụ huynh tự viết / sửa trong editor. `block` → chặn hẳn (422, không lưu); `warn` → lưu được, trả `keywordWarnings`.',
      security: bearer,
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'severity', in: 'query', schema: { type: 'string', enum: ['block', 'warn'] } },
      ],
      responses: { 200: { description: '`{ keywords: [{ id, keyword, severity, isActive, createdAt, creator }] }`' } },
    },
    post: {
      tags: ['Moderation'],
      summary: '[Moderator | Admin] Thêm từ khoá',
      description: 'Từ khoá được chuẩn hoá chữ thường + NFC. Khớp nguyên tiếng, không phân biệt hoa thường, giữ dấu.',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['keyword'],
              properties: { keyword: { type: 'string', example: 'đánh nhau' }, severity: { type: 'string', enum: ['block', 'warn'], default: 'block' } },
            },
          },
        },
      },
      responses: { 201: { description: 'Đã thêm' }, 409: { description: 'Từ khoá đã có' } },
    },
  },
  '/moderation/keywords/bulk': {
    post: {
      tags: ['Moderation'],
      summary: '[Moderator | Admin] Thêm nhiều từ khoá',
      description: 'Tối đa 500 từ. Từ đã có → cập nhật mức độ và bật lại.',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['keywords'],
              properties: { keywords: { type: 'array', items: { type: 'string' } }, severity: { type: 'string', enum: ['block', 'warn'], default: 'block' } },
            },
          },
        },
      },
      responses: { 200: { description: '`{ count }`' } },
    },
  },
  '/moderation/keywords/{id}': {
    put: {
      tags: ['Moderation'],
      summary: '[Moderator | Admin] Đổi mức độ / bật tắt từ khoá',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { severity: { type: 'string', enum: ['block', 'warn'] }, isActive: { type: 'boolean' } } },
          },
        },
      },
      responses: { 200: { description: 'Đã sửa' }, 404: { description: 'Không tìm thấy' } },
    },
    delete: {
      tags: ['Moderation'],
      summary: '[Moderator | Admin] Xoá từ khoá',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: 'Đã xoá' }, 404: { description: 'Không tìm thấy' } },
    },
  },
};
