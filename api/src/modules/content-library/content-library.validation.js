import { z } from 'zod';

const KEYWORD_SEVERITIES = ['block', 'warn'];
const CHARACTER_ROLES = ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'];

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
// Blocked Keywords Enhancements (Bulk & Update)
// =============================================================================

export default {
  getUiAudioAssets,
  getUiAudioAssetByKey,
  getUiAudioAssetById,
  createUiAudioAsset,
  updateUiAudioAsset,
  deleteUiAudioAsset,
};
