import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

// =============================================================================
// 1. UI AUDIO ASSETS SERVICE
// =============================================================================

/**
 * Get UI audio assets with pagination, language and search filtering
 * @param {Object} filter
 * @returns {Promise<Object>}
 */
const getUiAudioAssets = async (filter = {}) => {
  const { lang, search, page = 1, limit = 20 } = filter;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  const where = {};
  if (lang) {
    where.lang = lang;
  }
  if (search) {
    where.OR = [
      { key: { contains: search, mode: 'insensitive' } },
      { textContent: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, assets] = await Promise.all([
    prisma.uiAudioAsset.count({ where }),
    prisma.uiAudioAsset.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { key: 'asc' },
    }),
  ]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    assets,
  };
};

/**
 * Get UI audio asset by key and language
 * @param {string} key
 * @param {string} lang
 * @returns {Promise<Object>}
 */
const getUiAudioAssetByKey = async (key, lang = 'vi') => {
  const asset = await prisma.uiAudioAsset.findUnique({
    where: {
      key_lang: { key, lang },
    },
  });

  if (!asset) {
    throw ApiError.notFound(`UI Audio asset with key '${key}' and lang '${lang}' not found`);
  }

  return asset;
};

/**
 * Get UI audio asset by ID
 * @param {string} id
 * @returns {Promise<Object>}
 */
const getUiAudioAssetById = async (id) => {
  const asset = await prisma.uiAudioAsset.findUnique({ where: { id } });
  if (!asset) {
    throw ApiError.notFound('UI Audio asset not found');
  }
  return asset;
};

/**
 * Create a new UI audio asset
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const createUiAudioAsset = async (data) => {
  const { key, lang = 'vi', textContent, audioKey } = data;

  const existing = await prisma.uiAudioAsset.findUnique({
    where: {
      key_lang: { key, lang },
    },
  });

  if (existing) {
    throw ApiError.conflict(`UI Audio asset with key '${key}' and language '${lang}' already exists`);
  }

  return prisma.uiAudioAsset.create({
    data: {
      key,
      lang,
      textContent,
      audioKey,
    },
  });
};

/**
 * Update an existing UI audio asset
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updateUiAudioAsset = async (id, data) => {
  const existing = await prisma.uiAudioAsset.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound('UI Audio asset not found');
  }

  if ((data.key && data.key !== existing.key) || (data.lang && data.lang !== existing.lang)) {
    const nextKey = data.key || existing.key;
    const nextLang = data.lang || existing.lang;
    const duplicate = await prisma.uiAudioAsset.findUnique({
      where: {
        key_lang: { key: nextKey, lang: nextLang },
      },
    });
    if (duplicate && duplicate.id !== id) {
      throw ApiError.conflict(`UI Audio asset with key '${nextKey}' and language '${nextLang}' already exists`);
    }
  }

  return prisma.uiAudioAsset.update({
    where: { id },
    data: {
      ...(data.key !== undefined && { key: data.key }),
      ...(data.lang !== undefined && { lang: data.lang }),
      ...(data.textContent !== undefined && { textContent: data.textContent }),
      ...(data.audioKey !== undefined && { audioKey: data.audioKey }),
    },
  });
};

/**
 * Delete UI audio asset
 * @param {string} id
 * @returns {Promise<Object>}
 */
const deleteUiAudioAsset = async (id) => {
  const existing = await prisma.uiAudioAsset.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound('UI Audio asset not found');
  }

  await prisma.uiAudioAsset.delete({ where: { id } });
  return { message: 'Xóa tài nguyên âm thanh giao diện thành công' };
};

// =============================================================================
// 4. BLOCKED KEYWORDS BULK & UPDATE SERVICE
// =============================================================================

// =============================================================================
// 6. CONTENT LIBRARY STATS SERVICE
// =============================================================================

/**
 * Get aggregated statistics for the Content Library
 * @returns {Promise<Object>}
 */
const getContentLibraryStats = async () => {
  const [audioAssetsCount, keywordTotal, keywordActive] = await Promise.all([
    prisma.uiAudioAsset.count(),
    prisma.blockedKeyword.count(),
    prisma.blockedKeyword.count({ where: { isActive: true } }),
  ]);

  return {
    uiAudioAssets: {
      total: audioAssetsCount,
    },
    blockedKeywords: {
      total: keywordTotal,
      active: keywordActive,
      inactive: keywordTotal - keywordActive,
    },
  };
};

export default {
  // UI Audio Assets
  getUiAudioAssets,
  getUiAudioAssetByKey,
  getUiAudioAssetById,
  createUiAudioAsset,
  updateUiAudioAsset,
  deleteUiAudioAsset,

  // Blocked Keywords


  // Stats
  getContentLibraryStats,
};
