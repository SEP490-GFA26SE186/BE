import { z } from 'zod';

const getBookshelf = z.object({
  query: z.object({
    childId: z.string().uuid('Invalid child ID format').optional(),
    search: z.string().trim().optional(),
    page: z
      .string()
      .regex(/^\d+$/, 'Page must be an integer')
      .transform(Number)
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/, 'Limit must be an integer')
      .transform(Number)
      .default('10'),
  }),
});

const addToBookshelf = z.object({
  body: z.object({
    childId: z.string({ required_error: 'Child ID is required' }).uuid('Invalid child ID format'),
    storyId: z.string({ required_error: 'Story ID is required' }).uuid('Invalid story ID format'),
  }),
});

const removeFromBookshelf = z.object({
  params: z.object({
    storyId: z.string().uuid('Invalid story ID format'),
  }),
  query: z.object({
    childId: z.string({ required_error: 'Child ID query parameter is required' }).uuid('Invalid child ID format'),
  }),
});

const checkBookshelf = z.object({
  params: z.object({
    storyId: z.string().uuid('Invalid story ID format'),
  }),
  query: z.object({
    childId: z.string().uuid('Invalid child ID format').optional(),
  }),
});

export default {
  getBookshelf,
  addToBookshelf,
  removeFromBookshelf,
  checkBookshelf,
};
