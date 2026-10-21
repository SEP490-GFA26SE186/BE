import { z } from 'zod';

const uuid = (label) => z.string().uuid(`${label} không hợp lệ`);
const list = z.object({
  query: z.object({
    status: z.enum(['pending', 'ok', 'flagged']).optional(),
    skillId: uuid('skillId').optional(),
    subSkillId: uuid('subSkillId').optional(),
    templateId: uuid('templateId').optional(),
    cursor: uuid('cursor').optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
const id = z.object({ params: z.object({ checkpointId: uuid('checkpointId') }) });
const flag = z.object({
  params: id.shape.params,
  body: z.object({
    reason: z.string({ required_error: 'Nhập lý do loại câu hỏi' }).trim().min(5, 'Lý do có ít nhất 5 ký tự').max(500, 'Lý do tối đa 500 ký tự'),
  }),
});

export default { list, id, flag };
