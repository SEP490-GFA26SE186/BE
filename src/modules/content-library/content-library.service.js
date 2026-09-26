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

/**
 * Bulk import or upsert blocked keywords
 * @param {Object} user
 * @param {Array<{ keyword: string, severity?: string }>} keywords
 * @returns {Promise<Object>}
 */
const bulkImportKeywords = async (user, keywords) => {
  let createdCount = 0;
  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of keywords) {
      const normalized = item.keyword.trim().toLowerCase();
      const severity = item.severity || 'block';

      const existing = await tx.blockedKeyword.findUnique({
        where: { keyword: normalized },
      });

      if (existing) {
        await tx.blockedKeyword.update({
          where: { id: existing.id },
          data: {
            severity,
            isActive: true,
          },
        });
        updatedCount++;
      } else {
        await tx.blockedKeyword.create({
          data: {
            keyword: normalized,
            severity,
            isActive: true,
            createdById: user.id,
          },
        });
        createdCount++;
      }
    }
  });

  return {
    totalProcessed: keywords.length,
    createdCount,
    updatedCount,
    message: `Đã xử lý ${keywords.length} từ khóa (${createdCount} thêm mới, ${updatedCount} cập nhật)`,
  };
};

/**
 * Update single keyword
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updateKeyword = async (id, data) => {
  const existing = await prisma.blockedKeyword.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound('Blocked keyword not found');
  }

  if (data.keyword && data.keyword.trim().toLowerCase() !== existing.keyword) {
    const normalized = data.keyword.trim().toLowerCase();
    const duplicate = await prisma.blockedKeyword.findUnique({ where: { keyword: normalized } });
    if (duplicate && duplicate.id !== id) {
      throw ApiError.conflict(`Keyword '${normalized}' already exists`);
    }
    data.keyword = normalized;
  }

  return prisma.blockedKeyword.update({
    where: { id },
    data: {
      ...(data.keyword !== undefined && { keyword: data.keyword }),
      ...(data.severity !== undefined && { severity: data.severity }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
};

// =============================================================================
// 5. GRANULAR TEMPLATE PEDAGOGY MANAGEMENT (Stages, Slots, Choices, Signals)
// =============================================================================

/**
 * Add a stage to an existing template
 * @param {string} templateId
 * @param {Object} stageData
 * @returns {Promise<Object>}
 */
const addTemplateStage = async (templateId, stageData) => {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: { stages: true },
  });

  if (!template) {
    throw ApiError.notFound('Template not found');
  }

  if (template.status === 'retired') {
    throw ApiError.badRequest('Cannot add stages to a retired template');
  }

  const existingStage = template.stages.find((s) => s.stageOrder === stageData.stageOrder);
  if (existingStage) {
    throw ApiError.conflict(`Stage with order ${stageData.stageOrder} already exists in this template`);
  }

  const stage = await prisma.templateStage.create({
    data: {
      templateId,
      stageOrder: stageData.stageOrder,
      learningObjective: stageData.learningObjective,
      emotionToName: stageData.emotionToName || null,
      leadInPages: stageData.leadInPages || 1,
      isClimax: stageData.isClimax || false,
    },
  });

  return stage;
};

/**
 * Update an existing template stage
 * @param {string} stageId
 * @param {Object} stageData
 * @returns {Promise<Object>}
 */
const updateTemplateStage = async (stageId, stageData) => {
  const existing = await prisma.templateStage.findUnique({
    where: { id: stageId },
    include: { template: true },
  });

  if (!existing) {
    throw ApiError.notFound('Template stage not found');
  }

  if (existing.template.status === 'retired') {
    throw ApiError.badRequest('Cannot update stages of a retired template');
  }

  if (stageData.stageOrder && stageData.stageOrder !== existing.stageOrder) {
    const conflict = await prisma.templateStage.findUnique({
      where: {
        templateId_stageOrder: {
          templateId: existing.templateId,
          stageOrder: stageData.stageOrder,
        },
      },
    });
    if (conflict) {
      throw ApiError.conflict(`Stage order ${stageData.stageOrder} already used in this template`);
    }
  }

  return prisma.templateStage.update({
    where: { id: stageId },
    data: {
      ...(stageData.stageOrder !== undefined && { stageOrder: stageData.stageOrder }),
      ...(stageData.learningObjective !== undefined && { learningObjective: stageData.learningObjective }),
      ...(stageData.emotionToName !== undefined && { emotionToName: stageData.emotionToName }),
      ...(stageData.leadInPages !== undefined && { leadInPages: stageData.leadInPages }),
      ...(stageData.isClimax !== undefined && { isClimax: stageData.isClimax }),
    },
  });
};

/**
 * Delete a template stage
 * @param {string} stageId
 * @returns {Promise<Object>}
 */
const deleteTemplateStage = async (stageId) => {
  const existing = await prisma.templateStage.findUnique({
    where: { id: stageId },
    include: {
      _count: { select: { storyPages: true } },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Template stage not found');
  }

  if (existing._count.storyPages > 0) {
    throw ApiError.badRequest('Không thể xóa phân đoạn mẫu vì đã có trang truyện đang sử dụng phân đoạn này');
  }

  await prisma.templateStage.delete({ where: { id: stageId } });
  return { message: 'Xóa phân đoạn mẫu thành công' };
};

/**
 * Add or update character slots in template
 * @param {string} templateId
 * @param {Array<Object>} slots
 * @returns {Promise<Array>}
 */
const addOrUpdateTemplateSlots = async (templateId, slots) => {
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) {
    throw ApiError.notFound('Template not found');
  }

  if (template.status === 'retired') {
    throw ApiError.badRequest('Cannot modify slots of a retired template');
  }

  const results = [];
  await prisma.$transaction(async (tx) => {
    for (const slot of slots) {
      const normalizedKey = slot.slotKey.startsWith('{') ? slot.slotKey : `{${slot.slotKey}}`;
      const savedSlot = await tx.templateSlot.upsert({
        where: {
          templateId_slotKey: {
            templateId,
            slotKey: normalizedKey,
          },
        },
        create: {
          templateId,
          slotKey: normalizedKey,
          characterRole: slot.characterRole,
          defaultName: slot.defaultName,
        },
        update: {
          characterRole: slot.characterRole,
          defaultName: slot.defaultName,
        },
      });
      results.push(savedSlot);
    }
  });

  return results;
};

/**
 * Delete a character slot from template
 * @param {string} templateId
 * @param {string} slotKey
 * @returns {Promise<Object>}
 */
const deleteTemplateSlot = async (templateId, slotKey) => {
  const normalizedKey = slotKey.startsWith('{') ? slotKey : `{${slotKey}}`;

  const existing = await prisma.templateSlot.findUnique({
    where: {
      templateId_slotKey: {
        templateId,
        slotKey: normalizedKey,
      },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Template slot not found');
  }

  await prisma.templateSlot.delete({
    where: {
      templateId_slotKey: {
        templateId,
        slotKey: normalizedKey,
      },
    },
  });

  return { message: `Xóa vị trí nhân vật '${normalizedKey}' thành công` };
};

/**
 * Add choice type to stage along with EQ skill signals
 * @param {string} stageId
 * @param {Object} choiceData
 * @returns {Promise<Object>}
 */
const addTemplateChoice = async (stageId, choiceData) => {
  const stage = await prisma.templateStage.findUnique({
    where: { id: stageId },
    include: { template: true },
  });

  if (!stage) {
    throw ApiError.notFound('Template stage not found');
  }

  if (stage.template.status === 'retired') {
    throw ApiError.badRequest('Cannot add choices to a retired template');
  }

  const { choiceOrder, typeCode, description, isProsocial = false, signals = [] } = choiceData;

  const existing = await prisma.templateChoiceType.findUnique({
    where: {
      stageId_choiceOrder: {
        stageId,
        choiceOrder,
      },
    },
  });

  if (existing) {
    throw ApiError.conflict(`Choice with order ${choiceOrder} already exists in this stage`);
  }

  // Validate skill IDs
  if (signals.length > 0) {
    const skillIds = signals.map((s) => s.skillId);
    const existingSkills = await prisma.eqSkill.findMany({
      where: { id: { in: skillIds } },
    });
    if (existingSkills.length !== skillIds.length) {
      throw ApiError.badRequest('One or more EQ skill IDs do not exist');
    }
  }

  return prisma.$transaction(async (tx) => {
    const choice = await tx.templateChoiceType.create({
      data: {
        stageId,
        choiceOrder,
        typeCode,
        description,
        isProsocial,
      },
    });

    if (signals.length > 0) {
      await tx.templateChoiceSignal.createMany({
        data: signals.map((sig) => ({
          choiceTypeId: choice.id,
          skillId: sig.skillId,
          delta: sig.delta,
        })),
      });
    }

    return tx.templateChoiceType.findUnique({
      where: { id: choice.id },
      include: {
        choiceSignals: {
          include: {
            skill: {
              select: {
                id: true,
                caselCode: true,
                nameVi: true,
                nameEn: true,
              },
            },
          },
        },
      },
    });
  });
};

/**
 * Update choice type and replace/synchronize EQ signals
 * @param {string} choiceId
 * @param {Object} choiceData
 * @returns {Promise<Object>}
 */
const updateTemplateChoice = async (choiceId, choiceData) => {
  const existing = await prisma.templateChoiceType.findUnique({
    where: { id: choiceId },
    include: { stage: { include: { template: true } } },
  });

  if (!existing) {
    throw ApiError.notFound('Template choice not found');
  }

  if (existing.stage.template.status === 'retired') {
    throw ApiError.badRequest('Cannot update choices of a retired template');
  }

  const { choiceOrder, typeCode, description, isProsocial, signals } = choiceData;

  if (choiceOrder && choiceOrder !== existing.choiceOrder) {
    const duplicate = await prisma.templateChoiceType.findUnique({
      where: {
        stageId_choiceOrder: {
          stageId: existing.stageId,
          choiceOrder,
        },
      },
    });
    if (duplicate && duplicate.id !== choiceId) {
      throw ApiError.conflict(`Choice order ${choiceOrder} already used in this stage`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.templateChoiceType.update({
      where: { id: choiceId },
      data: {
        ...(choiceOrder !== undefined && { choiceOrder }),
        ...(typeCode !== undefined && { typeCode }),
        ...(description !== undefined && { description }),
        ...(isProsocial !== undefined && { isProsocial }),
      },
    });

    if (signals !== undefined) {
      // Validate skills
      if (signals.length > 0) {
        const skillIds = signals.map((s) => s.skillId);
        const existingSkills = await tx.eqSkill.findMany({
          where: { id: { in: skillIds } },
        });
        if (existingSkills.length !== skillIds.length) {
          throw ApiError.badRequest('One or more EQ skill IDs do not exist');
        }
      }

      await tx.templateChoiceSignal.deleteMany({ where: { choiceTypeId: choiceId } });

      if (signals.length > 0) {
        await tx.templateChoiceSignal.createMany({
          data: signals.map((sig) => ({
            choiceTypeId: choiceId,
            skillId: sig.skillId,
            delta: sig.delta,
          })),
        });
      }
    }

    return tx.templateChoiceType.findUnique({
      where: { id: choiceId },
      include: {
        choiceSignals: {
          include: {
            skill: {
              select: {
                id: true,
                caselCode: true,
                nameVi: true,
                nameEn: true,
              },
            },
          },
        },
      },
    });
  });
};

/**
 * Delete a template choice
 * @param {string} choiceId
 * @returns {Promise<Object>}
 */
const deleteTemplateChoice = async (choiceId) => {
  const existing = await prisma.templateChoiceType.findUnique({
    where: { id: choiceId },
    include: {
      _count: { select: { storyChoices: true } },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Template choice not found');
  }

  if (existing._count.storyChoices > 0) {
    throw ApiError.badRequest('Không thể xóa lựa chọn này vì đã có truyện đang gắn với lựa chọn này');
  }

  await prisma.templateChoiceType.delete({ where: { id: choiceId } });
  return { message: 'Xóa lựa chọn rẽ nhánh mẫu thành công' };
};

// =============================================================================
// 6. CONTENT LIBRARY STATS SERVICE
// =============================================================================

/**
 * Get aggregated statistics for the Content Library
 * @returns {Promise<Object>}
 */
const getContentLibraryStats = async () => {
  const [
    templateCounts,
    backgroundTotal,
    backgroundActive,
    audioAssetsCount,
    checklistTotal,
    checklistActive,
    keywordTotal,
    keywordActive,
  ] = await Promise.all([
    prisma.template.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.background.count(),
    prisma.background.count({ where: { isActive: true } }),
    prisma.uiAudioAsset.count(),
    prisma.checklistItem.count(),
    prisma.checklistItem.count({ where: { isActive: true } }),
    prisma.blockedKeyword.count(),
    prisma.blockedKeyword.count({ where: { isActive: true } }),
  ]);

  const templatesByStatus = {
    draft: 0,
    active: 0,
    retired: 0,
    total: 0,
  };

  templateCounts.forEach((item) => {
    templatesByStatus[item.status] = item._count._all;
    templatesByStatus.total += item._count._all;
  });

  return {
    templates: templatesByStatus,
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
  bulkImportKeywords,
  updateKeyword,

  // Granular Template Management
  addTemplateStage,
  updateTemplateStage,
  deleteTemplateStage,
  addOrUpdateTemplateSlots,
  deleteTemplateSlot,
  addTemplateChoice,
  updateTemplateChoice,
  deleteTemplateChoice,

  // Stats
  getContentLibraryStats,
};
