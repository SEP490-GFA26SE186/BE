import { z } from 'zod';

const STORY_KINDS = ['private', 'published'];
const STORY_STATUSES = ['draft', 'generating', 'ready'];
const PAGE_KINDS = ['lead_in', 'situation', 'consequence', 'ending'];
const CONTENT_ORIGINS = ['human', 'ai', 'ai_edited'];

const createStory = z.object({
  body: z
    .object({
      topicId: z.string().uuid('Invalid topic ID format').optional(),
      templateId: z.string().uuid('Invalid template ID format').optional(),
      length: z.enum(['short', 'medium', 'long', 'custom']).default('medium'),
      situation: z.string().trim().max(1000).optional(),
      title: z
        .string({ required_error: 'Story title is required' })
        .trim()
        .min(1, 'Title cannot be empty')
        .max(200, 'Title must not exceed 200 characters'),
      useAiImage: z.boolean().default(false),
      useTts: z.boolean().default(true),
      autoInitializePages: z.boolean().default(true),
      characters: z
        .array(
          z.object({
            token: z.string().trim().min(1).max(30).optional(),
            slotKey: z.string().trim().min(1).max(30).optional(),
            characterId: z.string().uuid('Invalid character ID format').nullable().optional(),
            aliasName: z.string().trim().max(100).nullable().optional(),
            isMain: z.boolean().optional(),
          })
        )
        .optional(),
    })
    .refine((data) => data.topicId || data.templateId, {
      message: 'Topic ID is required',
      path: ['topicId'],
    }),
});

const getStories = z.object({
  query: z.object({
    kind: z.enum(STORY_KINDS).optional(),
    status: z.enum(STORY_STATUSES).optional(),
    topicId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
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

const getStory = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
  }),
});

const updateStory = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
  }),
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    useAiImage: z.boolean().optional(),
    useTts: z.boolean().optional(),
    status: z.enum(STORY_STATUSES).optional(),
  }),
});

const deleteStory = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
  }),
});

const bindCharacters = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
  }),
  body: z.object({
    characters: z
      .array(
        z.object({
          slotKey: z.string().trim().min(1).max(30),
          characterId: z.string().uuid('Invalid character ID format').nullable().optional(),
        })
      )
      .min(1, 'At least one character slot mapping must be provided'),
  }),
});

const updatePage = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
    pageId: z.string().uuid('Invalid page ID format'),
  }),
  body: z.object({
    contentText: z.string().trim().nullable().optional(),
    backgroundId: z.string().uuid('Invalid background ID format').nullable().optional(),
    imageKey: z.string().trim().max(300).nullable().optional(),
    audioKey: z.string().trim().max(300).nullable().optional(),
    origin: z.enum(CONTENT_ORIGINS).optional(),
  }),
});

const createPage = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
  }),
  body: z.object({
    stageId: z.string().uuid('Invalid stage ID format'),
    pageKind: z.enum(PAGE_KINDS),
    pageOrder: z.number().int().positive().optional(),
    fromChoiceId: z.string().uuid('Invalid choice ID format').nullable().optional(),
    contentText: z.string().trim().optional(),
    backgroundId: z.string().uuid('Invalid background ID format').nullable().optional(),
    origin: z.enum(CONTENT_ORIGINS).default('human'),
  }),
});

const deletePage = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
    pageId: z.string().uuid('Invalid page ID format'),
  }),
});

const updateChoice = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
    pageId: z.string().uuid('Invalid page ID format'),
    choiceId: z.string().uuid('Invalid choice ID format'),
  }),
  body: z.object({
    choiceText: z.string().trim().min(1, 'Choice text cannot be empty'),
    audioKey: z.string().trim().max(300).nullable().optional(),
  }),
});

const reviewStory = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
  }),
});

const publishStoryVersion = z.object({
  params: z.object({
    id: z.string().uuid('Invalid story ID format'),
  }),
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      nameReplacements: z
        .array(
          z.object({
            slotKey: z.string().trim().min(1).max(30).optional(),
            fromName: z.string().trim().min(1).max(100).optional(),
            customName: z
              .string({ required_error: 'Tên thay thế là bắt buộc' })
              .trim()
              .min(1, 'Tên thay thế không được để trống')
              .max(100, 'Tên không quá 100 ký tự'),
          })
        )
        .optional(),
    })
    .optional(),
});

export default {
  createStory,
  getStories,
  getStory,
  updateStory,
  deleteStory,
  bindCharacters,
  updatePage,
  createPage,
  deletePage,
  updateChoice,
  reviewStory,
  publishStoryVersion,
};
