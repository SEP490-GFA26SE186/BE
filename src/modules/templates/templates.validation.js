import { z } from 'zod';

const TEMPLATE_STATUSES = ['draft', 'active', 'retired'];
const CHARACTER_ROLES = ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'];

const getTemplates = z.object({
  query: z.object({
    primarySkillId: z.string().uuid('ID kỹ năng EQ không hợp lệ').optional(),
    age: z
      .string()
      .regex(/^\d+$/, 'Độ tuổi phải là số nguyên')
      .transform(Number)
      .optional(),
    status: z.enum(TEMPLATE_STATUSES).optional(),
    search: z.string().trim().optional(),
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .default('10'),
  }),
});

const getTemplate = z.object({
  params: z.object({
    id: z.string().uuid('ID kịch bản mẫu không hợp lệ'),
  }),
});

const createTemplate = z.object({
  body: z.object({
    title: z
      .string({ required_error: 'Tiêu đề kịch bản là bắt buộc' })
      .trim()
      .min(1, 'Tiêu đề không được để trống')
      .max(200, 'Tiêu đề tối đa 200 ký tự'),
    description: z.string().trim().optional(),
    primarySkillId: z.string({ required_error: 'Kỹ năng EQ chính là bắt buộc' }).uuid('ID kỹ năng EQ không hợp lệ'),
    ageMin: z.number().int().min(1).max(18).default(5),
    ageMax: z.number().int().min(1).max(18).default(8),
    status: z.enum(TEMPLATE_STATUSES).default('draft'),
    slots: z
      .array(
        z.object({
          slotKey: z
            .string()
            .trim()
            .min(1)
            .max(30)
            .regex(/^\{?[A-Z0-9_]+\}?$/, 'Slot key phải có định dạng {KEY} hoặc KEY (ví dụ {CON}, {ME})'),
          characterRole: z.enum(CHARACTER_ROLES),
          defaultName: z.string().trim().min(1).max(100),
        }),
      )
      .min(1, 'Kịch bản phải có ít nhất 1 slot nhân vật (nhân vật chính)'),
    stages: z
      .array(
        z.object({
          stageOrder: z.number().int().min(1),
          learningObjective: z.string().trim().min(1, 'Mục tiêu sư phạm không được để trống'),
          emotionToName: z.string().trim().max(50).nullable().optional(),
          leadInPages: z.number().int().min(1).default(1),
          isClimax: z.boolean().default(false),
          choices: z
            .array(
              z.object({
                choiceOrder: z.number().int().min(1),
                typeCode: z.string().trim().max(40),
                description: z.string().trim().min(1),
                isProsocial: z.boolean().default(false),
                signals: z
                  .array(
                    z.object({
                      skillId: z.string().uuid(),
                      delta: z.number().int(),
                    }),
                  )
                  .optional(),
              }),
            )
            .optional(),
        }),
      )
      .optional(),
  }),
});

const updateTemplate = z.object({
  params: z.object({
    id: z.string().uuid('ID kịch bản mẫu không hợp lệ'),
  }),
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().optional(),
    primarySkillId: z.string().uuid('ID kỹ năng EQ không hợp lệ').optional(),
    ageMin: z.number().int().min(1).max(18).optional(),
    ageMax: z.number().int().min(1).max(18).optional(),
    status: z.enum(TEMPLATE_STATUSES).optional(),
  }),
});

const deleteTemplate = z.object({
  params: z.object({
    id: z.string().uuid('ID kịch bản mẫu không hợp lệ'),
  }),
});

export default {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
