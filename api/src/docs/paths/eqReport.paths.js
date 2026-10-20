// Bao cao EQ theo muc do ky nang con (spec su pham CASEL §7, §9b) + tham so do Specialist dat.
const bearer = [{ BearerAuth: [] }];
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID hồ sơ bé' };
const LEVEL = { type: 'string', nullable: true, enum: ['emerging', 'developing', 'secure', null], description: 'Đang làm quen / Đang phát triển / Vững; null = chưa đủ dữ liệu' };

const settingsSchema = {
  type: 'object',
  required: ['window', 'minItems', 'developingFrom', 'secureFrom'],
  properties: {
    window: { type: 'integer', minimum: 1, maximum: 20, example: 5, description: 'Số câu chấm gần nhất của kỹ năng con được xét' },
    minItems: { type: 'integer', minimum: 1, example: 3, description: 'Tối thiểu bao nhiêu câu mới xếp mức (≤ window)' },
    developingFrom: { type: 'number', exclusiveMinimum: 0, example: 0.5, description: 'Tỉ lệ từ đây là "Đang phát triển" (dưới là "Đang làm quen")' },
    secureFrom: { type: 'number', maximum: 1, example: 0.8, description: 'Tỉ lệ từ đây là "Vững" (> developingFrom)' },
  },
};

const competencySchema = {
  type: 'object',
  properties: {
    caselCode: { type: 'string', example: 'self_awareness' },
    nameVi: { type: 'string', example: 'Tự nhận thức' },
    level: { ...LEVEL, description: 'Mức thấp nhất trong các kỹ năng con đã có mức; null = chưa có dữ liệu (radar để trống trục)' },
    subSkills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nameVi: { type: 'string' },
          caselTextEn: { type: 'string', description: 'Câu gốc CASEL (tiếng Anh) của kỹ năng con' },
          level: LEVEL,
          items: { type: 'integer', description: 'Số câu chấm trong cửa sổ (≤ window)' },
        },
      },
    },
  },
};

const reportSchema = {
  type: 'object',
  properties: {
    childId: { type: 'string', format: 'uuid' },
    childName: { type: 'string' },
    settings: settingsSchema,
    competencies: { type: 'array', items: competencySchema, description: '5 năng lực CASEL theo display_order' },
    recommendations: {
      type: 'array',
      description: '1–3 topic đang bật, hợp tuổi; ưu tiên năng lực chưa có dữ liệu → kỹ năng con đang làm quen / chưa đủ dữ liệu → đang phát triển; bỏ topic của 3 truyện đọc gần nhất',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          skill: { type: 'object', properties: { caselCode: { type: 'string' }, nameVi: { type: 'string' } } },
          subSkills: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nameVi: { type: 'string' } } } },
        },
      },
    },
  },
};

const RULES = 'Chỉ câu chấm ở lượt đọc đầu, điểm dừng không bị Specialist gắn cờ, có kỹ năng con (câu cũ không có `subSkillId` không tính). Không trả điểm / %: chỉ mức độ. Báo cáo phản ánh mức hiểu qua tình huống trong truyện, không phải đánh giá hành vi.';

export default {
  '/children/{id}/eq-report': {
    get: {
      tags: ['Children'],
      summary: '[Parent] Báo cáo EQ theo mức độ (radar 5 năng lực + kỹ năng con + topic gợi ý)',
      description: `Mức kỹ năng con tính trên \`window\` câu chấm gần nhất; dưới \`minItems\` câu → null. ${RULES}`,
      security: bearer,
      parameters: [id],
      responses: {
        200: { description: '{ childId, childName, settings, competencies, recommendations }', content: { 'application/json': { schema: reportSchema } } },
        404: { description: 'Không tìm thấy hồ sơ bé' },
      },
    },
  },
  '/children/{id}/eq-journey': {
    get: {
      tags: ['Children'],
      summary: '[Parent] Báo cáo EQ chi tiết: bằng chứng, gợi ý trò chuyện, xu hướng theo tuần',
      description: `Gồm mọi trường của \`/eq-report\`, thêm:\n- \`evidence\`: tối đa 5 câu mới nhất mỗi kỹ năng con { subSkillId, answeredAt, storyTitle, question (tên thật), firstChoiceText, correctFirstTry, usedHint, source: "ai_template" };\n- \`conversation\`: 3 truyện bé đọc gần nhất { storyId, storyTitle, subSkillId, prompts (parent_prompts của mẫu, tối đa 3; truyện tự viết: câu hỏi của truyện), reflection?: { question, answered } };\n- \`trend\`: { weekStart, competencies: { [caselCode]: { items, level } } } — số câu chấm trong tuần và mức cuối tuần.\n${RULES}`,
      security: bearer,
      parameters: [id, { name: 'weeks', in: 'query', schema: { type: 'integer', minimum: 4, maximum: 26, default: 8 } }],
      responses: {
        200: { description: '{ childId, childName, settings, competencies, recommendations, evidence, conversation, trend }' },
        404: { description: 'Không tìm thấy hồ sơ bé' },
      },
    },
  },
  '/pedagogy/report-settings': {
    get: {
      tags: ['Pedagogy'],
      summary: '[Specialist/Admin] Tham số báo cáo EQ',
      description: 'Đọc từ platform_settings `eq_report.*` (thiếu → mặc định 5 / 3 / 0,5 / 0,8). Phụ huynh nhận tham số trong `/children/{id}/eq-report`.',
      security: bearer,
      responses: { 200: { description: 'Tham số hiện tại', content: { 'application/json': { schema: settingsSchema } } }, 403: { description: 'Không phải Specialist / Admin' } },
    },
    put: {
      tags: ['Pedagogy'],
      summary: '[Specialist/Admin] Sửa tham số báo cáo EQ',
      description: 'Ràng buộc: 1 ≤ minItems ≤ window ≤ 20; 0 < developingFrom < secureFrom ≤ 1. Gửi đủ 4 trường.',
      security: bearer,
      requestBody: { required: true, content: { 'application/json': { schema: settingsSchema } } },
      responses: { 200: { description: 'Tham số đã lưu' }, 400: { description: 'Sai ràng buộc (thông báo tiếng Việt theo trường)' }, 403: { description: 'Không phải Specialist / Admin' } },
    },
  },
};
