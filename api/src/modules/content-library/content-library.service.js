import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

// =============================================================================
// 1. BACKGROUNDS SERVICE
// =============================================================================

/**
 * Get backgrounds with filtering, tag search and pagination
 * @param {Object} filter
 * @returns {Promise<Object>}
 */
const getBackgrounds = async (filter = {}) => {
  const { tags, search, isActive, page = 1, limit = 20 } = filter;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  const where = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (tags) {
    where.tags = { contains: tags, mode: 'insensitive' };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { tags: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, backgrounds] = await Promise.all([
    prisma.background.count({ where }),
    prisma.background.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
        _count: {
          select: { storyPages: true },
        },
      },
    }),
  ]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    backgrounds: backgrounds.map((bg) => ({
      id: bg.id,
      name: bg.name,
      imageKey: bg.imageKey,
      tags: bg.tags,
      isActive: bg.isActive,
      usageCount: bg._count.storyPages,
      createdBy: bg.createdBy,
      createdAt: bg.createdAt,
    })),
  };
};

/**
 * Get single background by ID
 * @param {string} id
 * @returns {Promise<Object>}
 */
const getBackgroundById = async (id) => {
  const background = await prisma.background.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
      _count: {
        select: { storyPages: true },
      },
    },
  });

  if (!background) {
    throw ApiError.notFound('Background not found');
  }

  return {
    id: background.id,
    name: background.name,
    imageKey: background.imageKey,
    tags: background.tags,
    isActive: background.isActive,
    usageCount: background._count.storyPages,
    createdBy: background.createdBy,
    createdAt: background.createdAt,
  };
};

/**
 * Create a new background
 * @param {string} userId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const createBackground = async (userId, data) => {
  const { name, imageKey, tags, isActive = true } = data;

  const background = await prisma.background.create({
    data: {
      name,
      imageKey,
      tags: tags || null,
      isActive,
      createdById: userId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    },
  });

  return background;
};

/**
 * Update an existing background
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updateBackground = async (id, data) => {
  const existing = await prisma.background.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound('Background not found');
  }

  const updated = await prisma.background.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.imageKey !== undefined && { imageKey: data.imageKey }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  return updated;
};

/**
 * Delete or soft-deactivate background
 * @param {string} id
 * @returns {Promise<Object>}
 */
const deleteBackground = async (id) => {
  const existing = await prisma.background.findUnique({
    where: { id },
    include: {
      _count: {
        select: { storyPages: true },
      },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Background not found');
  }

  if (existing._count.storyPages > 0) {
    await prisma.background.update({
      where: { id },
      data: { isActive: false },
    });
    return {
      message: `Ảnh nền đã được ${existing._count.storyPages} trang truyện sử dụng, đã chuyển sang trạng thái ngưng hoạt động (isActive: false)`,
      deactivated: true,
    };
  }

  await prisma.background.delete({ where: { id } });
  return {
    message: 'Xóa ảnh nền thành công',
    deleted: true,
  };
};

// =============================================================================
// 2. UI AUDIO ASSETS SERVICE
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
// 3. CHECKLIST ITEMS SERVICE
// =============================================================================

/**
 * Get checklist items
 * @param {Object} filter
 * @returns {Promise<Array>}
 */
const getChecklistItems = async (filter = {}) => {
  const where = {};
  if (filter.isActive !== undefined) {
    where.isActive = filter.isActive;
  }

  return prisma.checklistItem.findMany({
    where,
    orderBy: { displayOrder: 'asc' },
    include: {
      _count: {
        select: { reviewResults: true },
      },
    },
  });
};

/**
 * Get checklist item by ID
 * @param {string} id
 * @returns {Promise<Object>}
 */
const getChecklistItemById = async (id) => {
  const item = await prisma.checklistItem.findUnique({
    where: { id },
    include: {
      _count: {
        select: { reviewResults: true },
      },
    },
  });

  if (!item) {
    throw ApiError.notFound('Checklist item not found');
  }

  return item;
};

/**
 * Create a new checklist item
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const createChecklistItem = async (data) => {
  const { code, description, displayOrder = 0, isActive = true } = data;

  const existing = await prisma.checklistItem.findUnique({ where: { code } });
  if (existing) {
    throw ApiError.conflict(`Checklist item with code '${code}' already exists`);
  }

  return prisma.checklistItem.create({
    data: {
      code,
      description,
      displayOrder,
      isActive,
    },
  });
};

/**
 * Update checklist item
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updateChecklistItem = async (id, data) => {
  const existing = await prisma.checklistItem.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound('Checklist item not found');
  }

  if (data.code && data.code !== existing.code) {
    const duplicate = await prisma.checklistItem.findUnique({ where: { code: data.code } });
    if (duplicate && duplicate.id !== id) {
      throw ApiError.conflict(`Checklist item with code '${data.code}' already exists`);
    }
  }

  return prisma.checklistItem.update({
    where: { id },
    data: {
      ...(data.code !== undefined && { code: data.code }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
};

/**
 * Delete or deactivate checklist item
 * @param {string} id
 * @returns {Promise<Object>}
 */
const deleteChecklistItem = async (id) => {
  const existing = await prisma.checklistItem.findUnique({
    where: { id },
    include: {
      _count: {
        select: { reviewResults: true },
      },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Checklist item not found');
  }

  if (existing._count.reviewResults > 0) {
    await prisma.checklistItem.update({
      where: { id },
      data: { isActive: false },
    });
    return {
      message: `Tiêu chí kiểm duyệt đã gắn với ${existing._count.reviewResults} lượt kiểm duyệt, đã chuyển sang ngưng kích hoạt (isActive: false)`,
      deactivated: true,
    };
  }

  await prisma.checklistItem.delete({ where: { id } });
  return { message: 'Xóa tiêu chí kiểm duyệt thành công', deleted: true };
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
  const [
    backgroundTotal,
    backgroundActive,
    audioAssetsCount,
    checklistTotal,
    checklistActive,
    keywordTotal,
    keywordActive,
  ] = await Promise.all([
    prisma.background.count(),
    prisma.background.count({ where: { isActive: true } }),
    prisma.uiAudioAsset.count(),
    prisma.checklistItem.count(),
    prisma.checklistItem.count({ where: { isActive: true } }),
    prisma.blockedKeyword.count(),
    prisma.blockedKeyword.count({ where: { isActive: true } }),
  ]);

  return {
    backgrounds: {
      total: backgroundTotal,
      active: backgroundActive,
      inactive: backgroundTotal - backgroundActive,
    },
    uiAudioAssets: {
      total: audioAssetsCount,
    },
    checklistItems: {
      total: checklistTotal,
      active: checklistActive,
      inactive: checklistTotal - checklistActive,
    },
    blockedKeywords: {
      total: keywordTotal,
      active: keywordActive,
      inactive: keywordTotal - keywordActive,
    },
  };
};

export default {
  // Backgrounds
  getBackgrounds,
  getBackgroundById,
  createBackground,
  updateBackground,
  deleteBackground,

  // UI Audio Assets
  getUiAudioAssets,
  getUiAudioAssetByKey,
  getUiAudioAssetById,
  createUiAudioAsset,
  updateUiAudioAsset,
  deleteUiAudioAsset,

  // Checklist Items
  getChecklistItems,
  getChecklistItemById,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,

  // Blocked Keywords


  // Stats
  getContentLibraryStats,
};
