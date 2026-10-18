import { z } from 'zod';

// Rev8: characters khong con cot role — vai cua nhan vat trong truyen do story_characters.is_main quyet.

const createCharacter = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Nhập tên nhân vật' })
      .trim()
      .min(1, 'Nhập tên nhân vật')
      .max(100, 'Tên nhân vật tối đa 100 ký tự'),
    appearance: z
      .string({ required_error: 'Mô tả nhân vật (ngoại hình, tính cách) để AI viết đúng' })
      .trim()
      .min(3, 'Mô tả nhân vật tối thiểu 3 ký tự')
      .max(1000, 'Mô tả nhân vật tối đa 1000 ký tự'),
    childId: z
      .string()
      .uuid('Invalid child ID format')
      .nullable()
      .optional(),
    portraitImageKey: z
      .string()
      .max(300, 'Portrait image key must not exceed 300 characters')
      .nullable()
      .optional(),
    genPrompt: z
      .string()
      .max(1000, 'Generation prompt must not exceed 1000 characters')
      .nullable()
      .optional(),
  }),
});

const updateCharacter = z.object({
  params: z.object({
    id: z.string().uuid('Mã nhân vật không hợp lệ'),
  }),
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Nhập tên nhân vật')
      .max(100, 'Tên nhân vật tối đa 100 ký tự')
      .optional(),
    appearance: z
      .string()
      .trim()
      .min(3, 'Mô tả nhân vật tối thiểu 3 ký tự')
      .max(1000, 'Mô tả nhân vật tối đa 1000 ký tự')
      .optional(),
    childId: z
      .string()
      .uuid('Invalid child ID format')
      .nullable()
      .optional(),
    portraitImageKey: z
      .string()
      .max(300, 'Portrait image key must not exceed 300 characters')
      .nullable()
      .optional(),
    genPrompt: z
      .string()
      .max(1000, 'Generation prompt must not exceed 1000 characters')
      .nullable()
      .optional(),
  }),
});

const getCharacters = z.object({
  query: z.object({
    childId: z
      .string()
      .uuid('Invalid child ID format')
      .optional(),
  }),
});

const getCharacter = z.object({
  params: z.object({
    id: z.string().uuid('Mã nhân vật không hợp lệ'),
  }),
});

const deleteCharacter = z.object({
  params: z.object({
    id: z.string().uuid('Mã nhân vật không hợp lệ'),
  }),
});

const generatePortrait = z.object({
  params: z.object({
    id: z.string().uuid('Mã nhân vật không hợp lệ'),
  }),
  body: z.object({
    style: z
      .enum(['pixar_3d', 'watercolor', 'anime', 'storybook_illustration', 'claymation'], {
        errorMap: () => ({
          message: 'Invalid art style (allowed: pixar_3d, watercolor, anime, storybook_illustration, claymation)',
        }),
      })
      .optional(),
    customPrompt: z
      .string()
      .max(500, 'Custom prompt must not exceed 500 characters')
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
