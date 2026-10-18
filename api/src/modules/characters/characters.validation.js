import { z } from 'zod';


const createCharacter = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Character name is required' })
      .trim()
      .min(1, 'Character name cannot be empty')
      .max(100, 'Character name must not exceed 100 characters'),
    appearance: z
      .string({ required_error: 'Character appearance description is required' })
      .trim()
      .min(3, 'Appearance description must be at least 3 characters')
      .max(1000, 'Appearance description must not exceed 1000 characters'),
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
    id: z.string().uuid('Invalid character ID format'),
  }),
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Character name cannot be empty')
      .max(100, 'Character name must not exceed 100 characters')
      .optional(),
    appearance: z
      .string()
      .trim()
      .min(3, 'Appearance description must be at least 3 characters')
      .max(1000, 'Appearance description must not exceed 1000 characters')
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
    id: z.string().uuid('Invalid character ID format'),
  }),
});

const deleteCharacter = z.object({
  params: z.object({
    id: z.string().uuid('Invalid character ID format'),
  }),
});

const generatePortrait = z.object({
  params: z.object({
    id: z.string().uuid('Invalid character ID format'),
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
