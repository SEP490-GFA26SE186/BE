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

const bulkImportKeywords = z.object({
  body: z.object({
    keywords: z
      .array(
        z.object({
          keyword: z
            .string({ required_error: 'Keyword cannot be empty' })
            .trim()
            .min(1)
            .max(100),
          severity: z.enum(KEYWORD_SEVERITIES).default('block'),
        })
      )
      .min(1, 'Must provide at least one keyword')
      .max(500, 'Cannot import more than 500 keywords in a single request'),
  }),
});

const updateKeyword = z.object({
  params: z.object({
    id: z.string().uuid('Invalid keyword ID format'),
  }),
  body: z.object({
    keyword: z.string().trim().min(1).max(100).optional(),
    severity: z.enum(KEYWORD_SEVERITIES).optional(),
    isActive: z.boolean().optional(),
  }),
});

// =============================================================================
// Granular Template Management Validations (Stages, Slots, Choices)
// =============================================================================

const addTemplateStage = z.object({
  params: z.object({
    id: z.string().uuid('Invalid template ID format'),
  }),
  body: z.object({
    stageOrder: z.number().int().positive('Stage order must be positive'),
    learningObjective: z.string().trim().min(1, 'Learning objective is required'),
    emotionToName: z.string().trim().max(50).nullable().optional(),
    leadInPages: z.number().int().min(1).default(1),
    isClimax: z.boolean().default(false),
  }),
});

const updateTemplateStage = z.object({
  params: z.object({
    stageId: z.string().uuid('Invalid stage ID format'),
  }),
  body: z.object({
    stageOrder: z.number().int().positive().optional(),
    learningObjective: z.string().trim().min(1).optional(),
    emotionToName: z.string().trim().max(50).nullable().optional(),
    leadInPages: z.number().int().min(1).optional(),
    isClimax: z.boolean().optional(),
  }),
});

const deleteTemplateStage = z.object({
  params: z.object({
    stageId: z.string().uuid('Invalid stage ID format'),
  }),
});

const addOrUpdateTemplateSlots = z.object({
  params: z.object({
    id: z.string().uuid('Invalid template ID format'),
  }),
  body: z.object({
    slots: z
      .array(
        z.object({
          slotKey: z
            .string()
            .trim()
            .min(1)
            .max(30)
            .regex(/^\{?[A-Z0-9_]+\}?$/, 'Slot key must follow format {KEY} or KEY'),
          characterRole: z.enum(CHARACTER_ROLES),
          defaultName: z.string().trim().min(1).max(100),
        })
      )
      .min(1, 'Must provide at least one slot'),
  }),
});

const deleteTemplateSlot = z.object({
  params: z.object({
    id: z.string().uuid('Invalid template ID format'),
    slotKey: z.string().trim().min(1).max(30),
  }),
});

const addTemplateChoice = z.object({
  params: z.object({
    stageId: z.string().uuid('Invalid stage ID format'),
  }),
  body: z.object({
    choiceOrder: z.number().int().positive('Choice order must be positive'),
    typeCode: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Z0-9_]+$/, 'Type code must be UPPERCASE letters/numbers/underscores (e.g. BUNG_NO, DUNG_LAI)'),
    description: z.string().trim().min(1, 'Choice description is required'),
    isProsocial: z.boolean().default(false),
    signals: z
      .array(
        z.object({
          skillId: z.string().uuid('Invalid EQ skill ID format'),
          delta: z.number().int().min(-10).max(10),
        })
      )
      .optional()
      .default([]),
  }),
});

const updateTemplateChoice = z.object({
  params: z.object({
    choiceId: z.string().uuid('Invalid choice ID format'),
  }),
  body: z.object({
    choiceOrder: z.number().int().positive().optional(),
    typeCode: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Z0-9_]+$/)
      .optional(),
    description: z.string().trim().min(1).optional(),
    isProsocial: z.boolean().optional(),
    signals: z
      .array(
        z.object({
          skillId: z.string().uuid('Invalid EQ skill ID format'),
          delta: z.number().int().min(-10).max(10),
        })
      )
      .optional(),
  }),
});

const deleteTemplateChoice = z.object({
  params: z.object({
    choiceId: z.string().uuid('Invalid choice ID format'),
  }),
});

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
  bulkImportKeywords,
  updateKeyword,
  addTemplateStage,
  updateTemplateStage,
  deleteTemplateStage,
  addOrUpdateTemplateSlots,
  deleteTemplateSlot,
  addTemplateChoice,
  updateTemplateChoice,
  deleteTemplateChoice,
};
