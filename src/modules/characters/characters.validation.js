import { z } from 'zod';

const CHARACTER_ROLES = ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'];
const GENERATION_STATUSES = ['none', 'queued', 'generating', 'ready', 'failed'];

const createCharacter = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Tên nhân vật là bắt buộc' })
      .trim()
      .min(1, 'Tên nhân vật không được để trống')
      .max(100, 'Tên nhân vật tối đa 100 ký tự'),
    role: z.enum(CHARACTER_ROLES, {
      errorMap: () => ({
        message: 'Vai trò nhân vật không hợp lệ (hỗ trợ: self, sibling, parent, relative, pet, toy)',
      }),
    }),
    appearance: z
      .string({ required_error: 'Mô tả ngoại hình nhân vật là bắt buộc' })
      .trim()
      .min(3, 'Mô tả ngoại hình tối thiểu 3 ký tự')
      .max(1000, 'Mô tả ngoại hình tối đa 1000 ký tự'),
    childId: z
      .string()
      .uuid('ID hồ sơ bé không hợp lệ')
      .nullable()
      .optional(),
    portraitImageKey: z
      .string()
      .max(300, 'Đường dẫn ảnh tối đa 300 ký tự')
      .nullable()
      .optional(),
    genPrompt: z
      .string()
      .max(1000, 'Prompt sinh ảnh tối đa 1000 ký tự')
      .nullable()
      .optional(),
  }),
});

const updateCharacter = z.object({
  params: z.object({
    id: z.string().uuid('ID nhân vật không hợp lệ'),
  }),
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Tên nhân vật không được để trống')
      .max(100, 'Tên nhân vật tối đa 100 ký tự')
      .optional(),
    role: z
      .enum(CHARACTER_ROLES, {
        errorMap: () => ({
          message: 'Vai trò nhân vật không hợp lệ (hỗ trợ: self, sibling, parent, relative, pet, toy)',
        }),
      })
      .optional(),
    appearance: z
      .string()
      .trim()
      .min(3, 'Mô tả ngoại hình tối thiểu 3 ký tự')
      .max(1000, 'Mô tả ngoại hình tối đa 1000 ký tự')
      .optional(),
    childId: z
      .string()
      .uuid('ID hồ sơ bé không hợp lệ')
      .nullable()
      .optional(),
    portraitImageKey: z
      .string()
      .max(300, 'Đường dẫn ảnh tối đa 300 ký tự')
      .nullable()
      .optional(),
    genPrompt: z
      .string()
      .max(1000, 'Prompt sinh ảnh tối đa 1000 ký tự')
      .nullable()
      .optional(),
    portraitStatus: z
      .enum(GENERATION_STATUSES, {
        errorMap: () => ({
          message: 'Trạng thái chân dung không hợp lệ (none, queued, generating, ready, failed)',
        }),
      })
      .optional(),
  }),
});

const getCharacters = z.object({
  query: z.object({
    role: z
      .enum(CHARACTER_ROLES, {
        errorMap: () => ({ message: 'Vai trò lọc không hợp lệ' }),
      })
      .optional(),
    childId: z
      .string()
      .uuid('ID hồ sơ bé không hợp lệ')
      .optional(),
  }),
});

const getCharacter = z.object({
  params: z.object({
    id: z.string().uuid('ID nhân vật không hợp lệ'),
  }),
});

const deleteCharacter = z.object({
  params: z.object({
    id: z.string().uuid('ID nhân vật không hợp lệ'),
  }),
});

const generatePortrait = z.object({
  params: z.object({
    id: z.string().uuid('ID nhân vật không hợp lệ'),
  }),
  body: z.object({
    style: z
      .enum(['pixar_3d', 'watercolor', 'anime', 'storybook_illustration', 'claymation'], {
        errorMap: () => ({
          message: 'Phong cách vẽ không hợp lệ (hỗ trợ: pixar_3d, watercolor, anime, storybook_illustration, claymation)',
        }),
      })
      .optional(),
    customPrompt: z
      .string()
      .max(500, 'Prompt bổ sung tối đa 500 ký tự')
      .optional(),
  }),
});

export default {
  createCharacter,
  updateCharacter,
  getCharacters,
  getCharacter,
  deleteCharacter,
  generatePortrait,
};
