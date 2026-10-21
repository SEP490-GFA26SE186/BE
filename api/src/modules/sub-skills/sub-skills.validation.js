import { z } from 'zod';

const age = z.number().int().min(1).max(18);
const body = {
  skillId: z.string().uuid('Năng lực CASEL không hợp lệ'),
  caselReferenceId: z.string().uuid('Mục CASEL không hợp lệ'),
  code: z.string().trim().min(3).max(60).regex(/^[a-z0-9_]+$/, 'Mã chỉ gồm chữ thường, số và dấu gạch dưới'),
  nameVi: z.string().trim().min(3, 'Tên kỹ năng con tối thiểu 3 ký tự').max(200),
  descriptionVi: z.string().trim().min(10, 'Mô tả có ít nhất 10 ký tự').max(4000),
  ageMin: age,
  ageMax: age,
  displayOrder: z.number().int().min(0).max(10000),
  isActive: z.boolean(),
};
const optionalOnCreate = ['code', 'ageMin', 'ageMax', 'displayOrder', 'isActive'];

const list = z.object({
  query: z.object({
    skillId: z.string().uuid().optional(),
    search: z.string().max(200).optional(),
    isActive: z.enum(['true', 'false']).optional(),
  }),
});
const id = z.object({ id: z.string().uuid('id không hợp lệ') });
const create = z.object({
  body: z.object(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, optionalOnCreate.includes(k) ? v.optional() : v]))),
});
const update = z.object({
  params: id,
  body: z.object(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v.optional()]))).refine((b) => Object.keys(b).length > 0, 'Không có gì để sửa'),
});
const remove = z.object({ params: id });

export default { list, create, update, remove };
