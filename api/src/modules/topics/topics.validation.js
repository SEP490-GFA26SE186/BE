import { z } from 'zod';

const age = z.number().int().min(1).max(18);
const body = {
  title: z.string().trim().min(3, 'Tên bài học tối thiểu 3 ký tự').max(200),
  skillId: z.string().uuid('Năng lực CASEL không hợp lệ'),
  guidance: z.string().trim().min(10, 'Hướng dẫn sư phạm có ít nhất 10 ký tự').max(4000),
  ageMin: age,
  ageMax: age,
  displayOrder: z.number().int().min(0).max(10000),
  isActive: z.boolean(),
};

const subSkillIds = z
  .array(z.string().uuid('Kỹ năng con không hợp lệ'))
  .min(1, 'Chọn ít nhất 1 kỹ năng con')
  .max(3, 'Chọn tối đa 3 kỹ năng con')
  .refine((a) => new Set(a).size === a.length, 'Kỹ năng con bị trùng');

const list = z.object({
  query: z.object({
    skillId: z.string().uuid().optional(),
    search: z.string().max(200).optional(),
    isActive: z.enum(['true', 'false']).optional(),
    limit: z.string().optional(),
  }),
});
const id = z.object({ id: z.string().uuid('id không hợp lệ') });
const create = z.object({
  body: z.object({
    ...body,
    subSkillIds,
    ageMin: age.optional(),
    ageMax: age.optional(),
    displayOrder: body.displayOrder.optional(),
    isActive: body.isActive.optional(),
  }),
});
const update = z.object({
  params: id,
  body: z
    .object(
      Object.fromEntries(
        Object.entries({ ...body, subSkillIds }).map(([k, v]) => [k, v.optional()]),
      ),
    )
    .refine((b) => Object.keys(b).length > 0, 'Không có gì để sửa'),
});
const remove = z.object({ params: id });

export default { list, create, update, remove };
