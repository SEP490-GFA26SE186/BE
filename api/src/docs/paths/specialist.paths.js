// Bai hoc (topics) + tu khoa bi chan (blocked_keywords) — Specialist quan ly (rev8).
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

const subSkillBody = (required) => ({
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        ...(required && { required: ['skillId', 'caselReferenceId', 'nameVi', 'descriptionVi'] }),
        properties: {
          skillId: { type: 'string', format: 'uuid', description: 'Năng lực CASEL.' },
          caselReferenceId: { type: 'string', format: 'uuid', description: 'Mục CASEL (cùng năng lực), lấy từ GET /eq-skills/casel-references.' },
          code: { type: 'string', example: 'sm_stress_strategies', description: 'Chữ thường + gạch dưới; bỏ trống để tự sinh.' },
          nameVi: { type: 'string', example: 'Hít thở khi giận' },
          descriptionVi: { type: 'string' },
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
  '/eq-skills/casel-references': {
    get: {
      tags: ['EQ Skills'],
      summary: 'Danh sách 40 mục tham chiếu CASEL',
      description: 'Mọi người dùng đã đăng nhập. Lọc theo `skillId` (năng lực CASEL). Kỹ năng con phải trỏ về một mục cùng năng lực.',
      security: bearer,
      parameters: [{ name: 'skillId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
      responses: { 200: { description: 'Mảng `[{ id, skillId, code, textEn, displayOrder }]` trong `data`' }, 401: { description: 'Chưa đăng nhập' } },
    },
  },
  '/sub-skills': {
    get: {
      tags: ['Sub-skills'],
      summary: 'Danh sách kỹ năng con',
      description:
        '**Phụ huynh:** chỉ kỹ năng con đang dùng, không kèm số đếm.\n**Specialist / Admin:** tất cả + `templatesCount`, `publishedTemplatesCount`, `topicsCount`, `checkpointsCount`; lọc `skillId`, `search`, `isActive`.',
      security: bearer,
      parameters: [
        { name: 'skillId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: { description: 'Mảng kỹ năng con trong `data`' } },
    },
    post: {
      tags: ['Sub-skills'],
      summary: '[Specialist | Admin] Tạo kỹ năng con',
      description: '`caselReferenceId` phải thuộc cùng `skillId` (400). `code` thiếu thì sinh từ mã mục CASEL (thêm `_2`, `_3` nếu trùng).',
      security: bearer,
      requestBody: subSkillBody(true),
      responses: { 201: { description: 'Đã tạo' }, 400: { description: 'Mục CASEL khác năng lực / tuổi sai' }, 403: { description: 'Không phải Specialist / Admin' }, 409: { description: 'Mã trùng' } },
    },
  },
  '/sub-skills/{id}': {
    put: {
      tags: ['Sub-skills'],
      summary: '[Specialist | Admin] Sửa kỹ năng con',
      description: 'Đã có điểm dừng (checkpoint) dùng thì **khoá** `skillId` / `caselReferenceId` (422).',
      security: bearer,
      parameters: [idParam],
      requestBody: subSkillBody(false),
      responses: { 200: { description: 'Đã sửa' }, 400: { description: 'Dữ liệu sai' }, 404: { description: 'Không tìm thấy' }, 409: { description: 'Mã trùng' }, 422: { description: 'Đổi năng lực / mục CASEL khi đã có điểm dừng dùng' } },
    },
    delete: {
      tags: ['Sub-skills'],
      summary: '[Specialist | Admin] Xoá kỹ năng con',
      description: 'Chưa có mẫu / bài học / điểm dừng nào dùng thì xoá hẳn; ngược lại 409 "chỉ tắt được" (dùng PUT `isActive: false`).',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: '`{ deleted, message }`' }, 404: { description: 'Không tìm thấy' }, 409: { description: 'Đã có mẫu / bài học / điểm dừng dùng' } },
    },
  },
  '/question-templates': {
    get: {
      tags: ['Question Templates'],
      summary: '[Specialist | Admin] Danh sách mẫu câu hỏi',
      description: 'Mỗi mẫu kèm `subSkill { id, nameVi, skillId }`, `answerFormat`, `latestPublished` (bản ban hành cao nhất hoặc null) và `draft` (bản nháp hoặc null).',
      security: bearer,
      parameters: [
        { name: 'subSkillId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'skillId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: { description: 'Mảng mẫu trong `data`' }, 403: { description: 'Không phải Specialist / Admin' } },
    },
    post: {
      tags: ['Question Templates'],
      summary: '[Specialist | Admin] Tạo mẫu + phiên bản 1 nháp rỗng',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['subSkillId', 'title', 'answerFormat'],
              properties: {
                subSkillId: { type: 'string', format: 'uuid' },
                title: { type: 'string' },
                answerFormat: { type: 'string', enum: ['emotion_pick', 'single_correct', 'role_choice'] },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Đã tạo' }, 400: { description: 'Dữ liệu / kỹ năng con sai' }, 403: { description: 'Không phải Specialist / Admin' } },
    },
  },
  '/question-templates/{id}': {
    put: {
      tags: ['Question Templates'],
      summary: '[Specialist | Admin] Đổi tên / bật tắt mẫu',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, isActive: { type: 'boolean' } } } } },
      },
      responses: { 200: { description: 'Đã sửa' }, 404: { description: 'Không tìm thấy' } },
    },
    delete: {
      tags: ['Question Templates'],
      summary: '[Specialist | Admin] Xoá mẫu',
      description: 'Chưa có điểm dừng (checkpoint) nào dùng phiên bản nào của mẫu thì xoá hẳn (cả các phiên bản); ngược lại 409 (dùng `isActive: false`).',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: '`{ deleted, message }`' }, 404: { description: 'Không tìm thấy' }, 409: { description: 'Đã có điểm dừng dùng' } },
    },
  },
  '/question-templates/{id}/draft': {
    put: {
      tags: ['Question Templates'],
      summary: '[Specialist | Admin] Lưu bản nháp',
      description:
        'Bản ban hành bất biến: chưa có nháp thì tạo phiên bản mới (= số lớn nhất + 1) sao nội dung từ bản ban hành gần nhất rồi áp body. Mọi trường tuỳ chọn: `questionFrame`, `pageSetup`, `needsTarget`, `allowedEmotions`, `correctDesc`, `distractorDesc`, `constructiveDesc`, `avoidantDesc`, `impulsiveDesc`, `constructiveScore`, `avoidantScore`, `impulsiveScore` (0-1), `hintGuidance`, `parentPrompts`, `rationale`, `referenceUrl`.',
      security: bearer,
      parameters: [idParam],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
      responses: { 200: { description: 'Mẫu với `draft` đã cập nhật' }, 400: { description: 'Dữ liệu sai' }, 404: { description: 'Không tìm thấy' }, 409: { description: 'Đua nhau tạo nháp' } },
    },
  },
  '/question-templates/{id}/publish': {
    post: {
      tags: ['Question Templates'],
      summary: '[Specialist | Admin] Ban hành bản nháp',
      description: 'Kiểm đủ trường theo dạng trả lời (422 liệt kê trường thiếu), rồi chuyển nháp thành `published`, ghi `publishedBy/At`.',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: 'Mẫu với `latestPublished` mới' }, 404: { description: 'Không tìm thấy' }, 409: { description: 'Không có bản nháp' }, 422: { description: 'Thiếu / sai trường' } },
    },
  },
  '/topics': {
    get: {
      tags: ['Topics'],
      summary: 'Danh sách bài học',
      description:
        '**Phụ huynh:** chỉ bài học đang dùng, không kèm `guidance`.\n**Specialist / Admin:** mọi bài học + `guidance`, `storiesCount`, `creator`; lọc `skillId`, `search`, `isActive`.',
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
      summary: '[Specialist | Admin] Tạo bài học',
      security: bearer,
      requestBody: topicBody(true),
      responses: { 201: { description: 'Đã tạo' }, 400: { description: 'Dữ liệu sai (vd. ageMin > ageMax)' }, 403: { description: 'Không phải Specialist / Admin' } },
    },
  },
  '/topics/{id}': {
    put: {
      tags: ['Topics'],
      summary: '[Specialist | Admin] Sửa bài học',
      description: 'Một bài học dùng cho nhiều truyện. Đã có truyện dùng thì **khoá năng lực CASEL** (điểm năng lực của truyện cũ phải giữ nguyên ý nghĩa).',
      security: bearer,
      parameters: [idParam],
      requestBody: topicBody(false),
      responses: { 200: { description: 'Đã sửa' }, 404: { description: 'Không tìm thấy' }, 422: { description: 'Đổi năng lực khi đã có truyện dùng' } },
    },
    delete: {
      tags: ['Topics'],
      summary: '[Specialist | Admin] Xoá bài học',
      description: 'Chưa có truyện dùng → xoá hẳn (`deleted: true`). Đã có truyện → chuyển **ngưng dùng** (`deactivated: true`), truyện cũ vẫn đọc / bán bình thường.',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: '`{ deleted, deactivated, message }`' }, 404: { description: 'Không tìm thấy' } },
    },
  },

  '/moderation/keywords': {
    get: {
      tags: ['Moderation'],
      summary: '[Specialist | Admin] Danh sách từ khoá bị chặn',
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
      summary: '[Specialist | Admin] Thêm từ khoá',
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
      summary: '[Specialist | Admin] Thêm nhiều từ khoá',
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
      summary: '[Specialist | Admin] Đổi mức độ / bật tắt từ khoá',
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
      summary: '[Specialist | Admin] Xoá từ khoá',
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: 'Đã xoá' }, 404: { description: 'Không tìm thấy' } },
    },
  },
};
