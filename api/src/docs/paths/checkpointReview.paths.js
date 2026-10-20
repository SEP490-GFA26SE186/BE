// Soat mau checkpoint cham diem (Specialist). Khong tra ten that / situation: token doi thanh "Bạn A/B...".
const bearer = [{ BearerAuth: [] }];
const cp = { name: 'checkpointId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const q = (name, schema) => ({ name, in: 'query', schema });
const tags = ['Checkpoint Review'];

export default {
  '/checkpoint-review': {
    get: {
      tags,
      summary: '[Specialist] Hàng đợi soát mẫu điểm dừng chấm điểm',
      description: 'Chỉ điểm dừng `scored = true` của truyện AI (kể cả bản đã đăng bán), mới nhất trước. Tên nhân vật thay bằng "Bạn A/B…" (bản đăng bán dùng tên đại diện); không trả tình huống. Phân trang con trỏ: `nextCursor` ở gốc phản hồi.',
      security: bearer,
      parameters: [
        q('status', { type: 'string', enum: ['pending', 'ok', 'flagged'] }),
        q('skillId', { type: 'string', format: 'uuid' }),
        q('subSkillId', { type: 'string', format: 'uuid' }),
        q('templateId', { type: 'string', format: 'uuid' }),
        q('cursor', { type: 'string', format: 'uuid' }),
        q('limit', { type: 'integer', minimum: 1, maximum: 50, default: 20 }),
      ],
      responses: { 200: { description: '{ data: [{ checkpointId, createdAt, skill, subSkill, template:{ id, title, version }, pageBefore, question, options:[{ text, role?, isCorrect? }], answerEmotion?, status, excludedReason? }], nextCursor }' } },
    },
  },
  '/checkpoint-review/stats': {
    get: { tags, summary: '[Specialist] Thống kê soát theo mẫu câu hỏi', security: bearer, responses: { 200: { description: '[{ templateId, title, reviewed, flagged }] (reviewed = ổn + đã loại, gộp mọi phiên bản)' } } },
  },
  '/checkpoint-review/{checkpointId}/ok': {
    post: { tags, summary: '[Specialist] Đánh dấu điểm dừng ổn', security: bearer, parameters: [cp], responses: { 200: { description: '{ checkpointId, status }' }, 404: { description: 'Không có' }, 422: { description: 'Không phải điểm dừng chấm điểm của truyện AI' } } },
  },
  '/checkpoint-review/{checkpointId}/flag': {
    post: {
      tags,
      summary: '[Specialist] Loại điểm dừng khỏi điểm và báo cáo',
      description: 'Đặt `excluded = true` kèm lý do/người/lúc, xoá dấu "ổn". Bé trả lời vẫn được, nhưng không tính điểm.',
      security: bearer,
      parameters: [cp],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5, maxLength: 500 } } } } } },
      responses: { 200: { description: '{ checkpointId, status }' }, 400: { description: 'Thiếu / sai độ dài lý do' }, 404: { description: 'Không có' }, 422: { description: 'Không phải điểm dừng chấm điểm của truyện AI' } },
    },
    delete: { tags, summary: '[Specialist] Gỡ cờ loại', description: 'Xoá excluded*; không tự đánh dấu "ổn".', security: bearer, parameters: [cp], responses: { 200: { description: '{ checkpointId, status: "pending" }' }, 404: { description: 'Không có' } } },
  },
};
