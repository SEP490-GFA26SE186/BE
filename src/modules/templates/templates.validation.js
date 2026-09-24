import { z } from 'zod';

const TEMPLATE_STATUSES = ['draft', 'active', 'retired'];
const CHARACTER_ROLES = ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'];

const getTemplates = z.object({
  query: z.object({
    primarySkillId: z.string().uuid('Invalid EQ skill ID format').optional(),
    age: z
      .string()
      .regex(/^\d+$/, 'Age must be an integer')
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
    id: z.string().uuid('Invalid template ID format'),
  }),
});

const createTemplate = z.object({
  body: z.object({
    title: z
      .string({ required_error: 'Template title is required' })
      .trim()
      .min(1, 'Title cannot be empty')
      .max(200, 'Title must not exceed 200 characters'),
    description: z.string().trim().optional(),
    primarySkillId: z.string({ required_error: 'Primary EQ skill is required' }).uuid('Invalid EQ skill ID format'),
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
            .regex(/^\{?[A-Z0-9_]+\}?$/, 'Slot key must follow format {KEY} or KEY (e.g. {CHILD}, {MOM})'),
          characterRole: z.enum(CHARACTER_ROLES),
          defaultName: z.string().trim().min(1).max(100),
        }),
      )
      .min(1, 'Template must have at least 1 character slot (main character)'),
    stages: z
      .array(
        z.object({
          stageOrder: z.number().int().min(1),
          learningObjective: z.string().trim().min(1, 'Learning objective cannot be empty'),
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
    id: z.string().uuid('Invalid template ID format'),
  }),
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().optional(),
    primarySkillId: z.string().uuid('Invalid EQ skill ID format').optional(),
    ageMin: z.number().int().min(1).max(18).optional(),
    ageMax: z.number().int().min(1).max(18).optional(),
    status: z.enum(TEMPLATE_STATUSES).optional(),
  }),
});

const deleteTemplate = z.object({
  params: z.object({
    id: z.string().uuid('Invalid template ID format'),
  }),
});

export default {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
