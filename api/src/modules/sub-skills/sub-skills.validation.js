import { z } from 'zod';

const age = z.number().int().min(1).max(18);

const list = z.object({
  query: z.object({
    skillId: z.string().uuid().optional(),
    search: z.string().max(200).optional(),
    isActive: z.enum(['true', 'false']).optional(),
  }),
});
// Chi cac truong dieu chinh duoc; strict -> gui nang luc / ma / cau goc tieng Anh la 400
const update = z.object({
  params: z.object({ id: z.string().uuid('id không hợp lệ') }),
  body: z
    .object({
      nameVi: z.string().trim().min(3, 'Tên kỹ năng con tối thiểu 3 ký tự').max(200),
      descriptionVi: z.string().trim().min(10, 'Mô tả có ít nhất 10 ký tự').max(4000),
      ageMin: age,
      ageMax: age,
      isActive: z.boolean(),
    })
    .partial()
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Không có gì để sửa'),
});

export default { list, update };
