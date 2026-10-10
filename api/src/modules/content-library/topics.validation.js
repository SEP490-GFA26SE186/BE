import { z } from 'zod';

const getTopics = z.object({
  query: z.object({
    skillId: z.string().uuid('Invalid skillId format').optional(),
    search: z.string().trim().optional(),
    ageMin: z.coerce.number().int().min(1).optional(),
    ageMax: z.coerce.number().int().max(18).optional(),
    isActive: z
      .string()
      .optional()
      .transform((val) => (val === undefined ? undefined : val === 'true')),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

const getTopicById = z.object({
  params: z.object({
    id: z.string().uuid('Invalid topic ID format'),
  }),
});

const createTopic = z.object({
  body: z.object({
    title: z
      .string({ required_error: 'Tiêu đề bài học là bắt buộc' })
      .trim()
      .min(3, 'Tiêu đề phải từ 3 ký tự trở lên')
      .max(200, 'Tiêu đề không quá 200 ký tự'),
    skillId: z
      .string({ required_error: 'skillId là bắt buộc' })
      .uuid('Invalid skillId format'),
    guidance: z
      .string({ required_error: 'Hướng dẫn sư phạm (guidance) là bắt buộc' })
      .trim()
      .min(10, 'Hướng dẫn sư phạm phải có ít nhất 10 ký tự'),
    ageMin: z.coerce.number().int().min(1).default(5),
    ageMax: z.coerce.number().int().max(18).default(8),
    displayOrder: z.coerce.number().int().default(0),
    isActive: z.boolean().default(true),
  }).refine((data) => data.ageMin <= data.ageMax, {
    message: 'ageMin phải nhỏ hơn hoặc bằng ageMax',
    path: ['ageMin'],
  }),
});

const updateTopic = z.object({
  params: z.object({
    id: z.string().uuid('Invalid topic ID format'),
  }),
  body: z.object({
    title: z.string().trim().min(3).max(200).optional(),
    skillId: z.string().uuid('Invalid skillId format').optional(),
    guidance: z.string().trim().min(10).optional(),
    ageMin: z.coerce.number().int().min(1).optional(),
    ageMax: z.coerce.number().int().max(18).optional(),
    displayOrder: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  }).refine((data) => {
    if (data.ageMin !== undefined && data.ageMax !== undefined) {
      return data.ageMin <= data.ageMax;
    }
    return true;
  }, {
    message: 'ageMin phải nhỏ hơn hoặc bằng ageMax',
    path: ['ageMin'],
  }),
});

export default {
  getTopics,
  getTopicById,
  createTopic,
  updateTopic,
};
