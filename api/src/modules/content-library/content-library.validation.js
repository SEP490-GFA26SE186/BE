import { z } from 'zod';

const KEYWORD_SEVERITIES = ['block', 'warn'];
const CHARACTER_ROLES = ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'];

// =============================================================================
// Backgrounds Validations
// =============================================================================

const getBackgrounds = z.object({
  query: z.object({
    tags: z.string().trim().optional(),
    search: z.string().trim().optional(),
    isActive: z
      .string()
      .transform((val) => val === 'true')
      .optional(),
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .default('20'),
  }),
});

const getBackgroundById = z.object({
  params: z.object({
    id: z.string().uuid('Invalid background ID format'),
  }),
});

const createBackground = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Background name is required' })
      .trim()
      .min(1, 'Name cannot be empty')
      .max(120, 'Name must not exceed 120 characters'),
    imageKey: z
      .string({ required_error: 'Image key is required' })
      .trim()
      .min(1, 'Image key cannot be empty')
      .max(300, 'Image key must not exceed 300 characters'),
    tags: z.string().trim().max(200, 'Tags must not exceed 200 characters').optional(),
    isActive: z.boolean().default(true),
  }),
});

const updateBackground = z.object({
  params: z.object({
    id: z.string().uuid('Invalid background ID format'),
  }),
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    imageKey: z.string().trim().min(1).max(300).optional(),
    tags: z.string().trim().max(200).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

const deleteBackground = z.object({
  params: z.object({
    id: z.string().uuid('Invalid background ID format'),
  }),
});

// =============================================================================
// UI Audio Assets Validations
// =============================================================================

const getUiAudioAssets = z.object({
  query: z.object({
    lang: z.string().trim().max(10).default('vi'),
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
      .default('20'),
  }),
});

const getUiAudioAssetByKey = z.object({
  params: z.object({
    key: z.string().trim().min(1).max(80),
  }),
  query: z.object({
    lang: z.string().trim().max(10).default('vi'),
  }),
});

const getUiAudioAssetById = z.object({
  params: z.object({
    id: z.string().uuid('Invalid audio asset ID format'),
  }),
});

const createUiAudioAsset = z.object({
  body: z.object({
    key: z
      .string({ required_error: 'Audio asset key is required' })
      .trim()
      .min(1, 'Key cannot be empty')
      .max(80, 'Key must not exceed 80 characters'),
    lang: z.string().trim().max(10).default('vi'),
    textContent: z.string({ required_error: 'Text content is required' }).min(1),
    audioKey: z
      .string({ required_error: 'Audio storage key is required' })
      .trim()
      .min(1, 'Audio key cannot be empty')
      .max(300, 'Audio key must not exceed 300 characters'),
  }),
});

const updateUiAudioAsset = z.object({
  params: z.object({
    id: z.string().uuid('Invalid audio asset ID format'),
  }),
  body: z.object({
    key: z.string().trim().min(1).max(80).optional(),
    lang: z.string().trim().max(10).optional(),
    textContent: z.string().min(1).optional(),
    audioKey: z.string().trim().min(1).max(300).optional(),
  }),
});

const deleteUiAudioAsset = z.object({
  params: z.object({
    id: z.string().uuid('Invalid audio asset ID format'),
  }),
});

// =============================================================================
// Checklist Items Validations
// =============================================================================

const getChecklistItems = z.object({
  query: z.object({
    isActive: z
      .string()
      .transform((val) => val === 'true')
      .optional(),
  }),
});

const getChecklistItemById = z.object({
  params: z.object({
    id: z.string().uuid('Invalid checklist item ID format'),
  }),
});

const createChecklistItem = z.object({
  body: z.object({
    code: z
      .string({ required_error: 'Checklist item code is required' })
      .trim()
      .min(1, 'Code cannot be empty')
      .max(40, 'Code must not exceed 40 characters')
      .regex(/^[A-Z0-9_]+$/, 'Code must be UPPERCASE letters, numbers, or underscores'),
    description: z.string({ required_error: 'Description is required' }).trim().min(1),
    displayOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
  }),
});

const updateChecklistItem = z.object({
  params: z.object({
    id: z.string().uuid('Invalid checklist item ID format'),
  }),
  body: z.object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Z0-9_]+$/, 'Code must be UPPERCASE letters, numbers, or underscores')
      .optional(),
    description: z.string().trim().min(1).optional(),
    displayOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
});

const deleteChecklistItem = z.object({
  params: z.object({
    id: z.string().uuid('Invalid checklist item ID format'),
  }),
});

// =============================================================================
// Blocked Keywords Enhancements (Bulk & Update)
// =============================================================================

export default {
  getBackgrounds,
  getBackgroundById,
  createBackground,
  updateBackground,
  deleteBackground,
  getUiAudioAssets,
  getUiAudioAssetByKey,
  getUiAudioAssetById,
  createUiAudioAsset,
  updateUiAudioAsset,
  deleteUiAudioAsset,
  getChecklistItems,
  getChecklistItemById,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
};
