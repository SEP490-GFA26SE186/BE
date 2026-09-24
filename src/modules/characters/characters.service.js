import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';

// Default free quota if user has no paid subscription
const DEFAULT_FREE_MAX_CHARACTERS = 5;

/**
 * Helper: Format character database record for client response
 * Handles BigInt genSeed conversion and child profile normalization
 * @param {Object} character
 * @returns {Object}
 */
const formatCharacterResponse = (character) => {
  return {
    id: character.id,
    parentId: character.parentId,
    childId: character.childId,
    name: character.name,
    role: character.role,
    appearance: character.appearance,
    portraitImageKey: character.portraitImageKey,
    genPrompt: character.genPrompt,
    genSeed: character.genSeed !== null && character.genSeed !== undefined ? character.genSeed.toString() : null,
    portraitStatus: character.portraitStatus,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
    child: character.child
      ? {
          id: character.child.id,
          name: character.child.name,
          birthDate: character.child.birthDate
            ? character.child.birthDate.toISOString().split('T')[0]
            : null,
        }
      : null,
  };
};

/**
 * Get maximum characters allowed based on parent active subscription
 * @param {string} parentId
 * @returns {Promise<number>}
 */
const getMaxCharactersQuota = async (parentId) => {
  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      parentId,
      status: 'active',
      periodEnd: { gt: new Date() },
    },
    include: {
      plan: true,
    },
  });

  if (activeSubscription && activeSubscription.plan) {
    return activeSubscription.plan.maxCharacters;
  }

  return DEFAULT_FREE_MAX_CHARACTERS;
};

/**
 * Create a new family character
 * @param {string} parentId
 * @param {Object} characterData
 * @returns {Promise<Object>} Formatted character
 */
const createCharacter = async (parentId, characterData) => {
  const { name, role, appearance, childId, portraitImageKey, genPrompt } = characterData;

  // 1. If childId provided, verify it belongs to this parent and is active
  if (childId) {
    const child = await prisma.childProfile.findFirst({
      where: {
        id: childId,
        parentId,
        deletedAt: null,
      },
    });

    if (!child) {
      throw ApiError.badRequest('Hồ sơ bé được liên kết không tồn tại hoặc đã bị xóa');
    }
  }

  // 2. Check character quota for current subscription
  const maxQuota = await getMaxCharactersQuota(parentId);
  const currentCount = await prisma.character.count({
    where: {
      parentId,
      deletedAt: null,
    },
  });

  if (currentCount >= maxQuota) {
    throw ApiError.forbidden(
      `Bạn đã đạt giới hạn tối đa ${maxQuota} nhân vật theo gói dịch vụ hiện tại. Vui lòng nâng cấp gói để tạo thêm nhân vật.`,
    );
  }

  // 3. Insert character
  const character = await prisma.character.create({
    data: {
      parentId,
      name,
      role,
      appearance,
      childId: childId || null,
      portraitImageKey: portraitImageKey || null,
      genPrompt: genPrompt || null,
      portraitStatus: portraitImageKey ? 'ready' : 'none',
    },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          birthDate: true,
        },
      },
    },
  });

  return formatCharacterResponse(character);
};

/**
 * Get all active characters for a parent
 * @param {string} parentId
 * @param {Object} [filter]
 * @returns {Promise<Array>} List of formatted characters
 */
const getCharacters = async (parentId, filter = {}) => {
  const where = {
    parentId,
    deletedAt: null,
  };

  if (filter.role) {
    where.role = filter.role;
  }

  if (filter.childId) {
    where.childId = filter.childId;
  }

  const characters = await prisma.character.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          birthDate: true,
        },
      },
    },
  });

  return characters.map(formatCharacterResponse);
};

/**
 * Get character detail by ID
 * @param {string} parentId
 * @param {string} characterId
 * @returns {Promise<Object>} Formatted character
 */
const getCharacterById = async (parentId, characterId) => {
  const character = await prisma.character.findFirst({
    where: {
      id: characterId,
      parentId,
      deletedAt: null,
    },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          birthDate: true,
        },
      },
    },
  });

  if (!character) {
    throw ApiError.notFound('Không tìm thấy nhân vật');
  }

  return formatCharacterResponse(character);
};

/**
 * Update a character
 * @param {string} parentId
 * @param {string} characterId
 * @param {Object} updateData
 * @returns {Promise<Object>} Updated character
 */
const updateCharacter = async (parentId, characterId, updateData) => {
  const existingCharacter = await prisma.character.findFirst({
    where: {
      id: characterId,
      parentId,
      deletedAt: null,
    },
  });

  if (!existingCharacter) {
    throw ApiError.notFound('Không tìm thấy nhân vật');
  }

  // If childId is provided/updated, verify validity
  if (updateData.childId !== undefined && updateData.childId !== null) {
    const child = await prisma.childProfile.findFirst({
      where: {
        id: updateData.childId,
        parentId,
        deletedAt: null,
      },
    });

    if (!child) {
      throw ApiError.badRequest('Hồ sơ bé được liên kết không tồn tại hoặc đã bị xóa');
    }
  }

  const updatedCharacter = await prisma.character.update({
    where: { id: characterId },
    data: {
      ...(updateData.name && { name: updateData.name }),
      ...(updateData.role && { role: updateData.role }),
      ...(updateData.appearance !== undefined && { appearance: updateData.appearance }),
      ...(updateData.childId !== undefined && { childId: updateData.childId }),
      ...(updateData.portraitImageKey !== undefined && { portraitImageKey: updateData.portraitImageKey }),
      ...(updateData.genPrompt !== undefined && { genPrompt: updateData.genPrompt }),
      ...(updateData.portraitStatus && { portraitStatus: updateData.portraitStatus }),
    },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          birthDate: true,
        },
      },
    },
  });

  return formatCharacterResponse(updatedCharacter);
};

/**
 * Soft-delete a character
 * @param {string} parentId
 * @param {string} characterId
 * @returns {Promise<Object>}
 */
const deleteCharacter = async (parentId, characterId) => {
  const existingCharacter = await prisma.character.findFirst({
    where: {
      id: characterId,
      parentId,
      deletedAt: null,
    },
  });

  if (!existingCharacter) {
    throw ApiError.notFound('Không tìm thấy nhân vật');
  }

  await prisma.character.update({
    where: { id: characterId },
    data: { deletedAt: new Date() },
  });

  return { message: 'Xóa nhân vật thành công' };
};

/**
 * Request AI portrait generation for character
 * @param {string} parentId
 * @param {string} characterId
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const requestPortraitGeneration = async (parentId, characterId, options = {}) => {
  const character = await prisma.character.findFirst({
    where: {
      id: characterId,
      parentId,
      deletedAt: null,
    },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          birthDate: true,
        },
      },
    },
  });

  if (!character) {
    throw ApiError.notFound('Không tìm thấy nhân vật');
  }

  const styleDescriptions = {
    pixar_3d: '3D animated movie character style, warm vibrant lighting, soft rendering, high detail, adorable Disney Pixar feel',
    watercolor: 'Gentle watercolor children book illustration, soft pastel tones, dreamy aesthetic',
    anime: 'Cute Studio Ghibli inspired anime art style, nostalgic colors, warm cheerful atmosphere',
    storybook_illustration: 'Classic fairytale picture book illustration, rich colors, storybook warmth',
    claymation: 'Cute stop-motion clay style, charming tactile clay textures',
  };

  const selectedStyle = styleDescriptions[options.style] || styleDescriptions.pixar_3d;
  const promptParts = [
    `Portrait of a character named ${character.name}, role: ${character.role}`,
    `Appearance: ${character.appearance}`,
    `Style: ${selectedStyle}`,
  ];

  if (options.customPrompt) {
    promptParts.push(`Extra details: ${options.customPrompt}`);
  }

  promptParts.push('child friendly, safe for all ages, high resolution, centered portrait');
  const synthesizedPrompt = promptParts.join('. ');

  const updatedCharacter = await prisma.character.update({
    where: { id: characterId },
    data: {
      genPrompt: synthesizedPrompt,
      portraitStatus: 'queued',
    },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          birthDate: true,
        },
      },
    },
  });

  return formatCharacterResponse(updatedCharacter);
};

export default {
  createCharacter,
  getCharacters,
  getCharacterById,
  updateCharacter,
  deleteCharacter,
  requestPortraitGeneration,
  getMaxCharactersQuota,
};
