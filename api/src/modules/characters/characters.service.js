import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';
import { assetUrl } from '../../clients/assetUrl.js';

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
    appearance: character.appearance,
    portraitImageKey: character.portraitImageKey,
    portraitImageUrl: assetUrl(character.portraitImageKey),
    genPrompt: character.genPrompt,
    genSeed: character.genSeed !== null && character.genSeed !== undefined ? character.genSeed.toString() : null,
    portraitStatus: character.portraitStatus,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
    // So truyen rieng (chua xoa) dang dung nhan vat — doi ten se doi ten trong cac truyen nay.
    storiesCount: character._count?.storyCharacters ?? undefined,
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
 * Moi be chi co mot nhan vat "la be" (characters.child_id unique, ke ca dong da xoa mem). Be da co nhan
 * vat song -> 409 ro rang thay vi loi P2002; dong da xoa mem dang giu cho -> nha ra (child_id = null).
 * (Y tuong tu origin/main assertChildAvatarSlot.)
 */
const claimChildSlot = async (childId, exceptCharacterId = null) => {
  const holder = await prisma.character.findUnique({ where: { childId } });
  if (!holder || holder.id === exceptCharacterId) return;
  if (!holder.deletedAt) {
    throw ApiError.conflict(`Bé đã có nhân vật “${holder.name}” — ba mẹ sửa nhân vật đó thay vì tạo thêm.`);
  }
  await prisma.character.update({ where: { id: holder.id }, data: { childId: null } });
};

/**
 * Create a new family character
 * @param {string} parentId
 * @param {Object} characterData
 * @returns {Promise<Object>} Formatted character
 */
const createCharacter = async (parentId, characterData) => {
  const { name, appearance, childId, portraitImageKey, genPrompt } = characterData;

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
      throw ApiError.badRequest('Hồ sơ bé không tồn tại hoặc đã bị xoá.');
    }
    await claimChildSlot(childId);
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
      `Gói hiện tại cho tối đa ${maxQuota} nhân vật. Ba mẹ xoá bớt nhân vật không dùng hoặc nâng cấp gói nhé.`,
    );
  }

  // 3. Insert character
  const character = await prisma.character.create({
    data: {
      parentId,
      name,
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
      _count: { select: { storyCharacters: { where: { story: { deletedAt: null, kind: 'private' } } } } },
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
    throw ApiError.notFound('Không tìm thấy nhân vật.');
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
    throw ApiError.notFound('Không tìm thấy nhân vật.');
  }
  // Nhan vat cua be: ten di theo ho so be (sua o trang "Be nha minh"), khong sua rieng o day.
  if (existingCharacter.childId && updateData.name && updateData.name.trim() !== existingCharacter.name) {
    throw new ApiError(422, 'Nhân vật này là bé — ba mẹ đổi tên ở trang “Bé nhà mình”.');
  }

  // Nhan vat cua be gan co dinh voi be (go / chuyen sang be khac = xoa ho so be, khong lam o day).
  if (existingCharacter.childId && updateData.childId !== undefined && updateData.childId !== existingCharacter.childId) {
    throw new ApiError(422, 'Nhân vật này là bé — không gỡ hay chuyển sang bé khác được.');
  }

  // If childId is provided/updated, verify validity
  if (updateData.childId !== undefined && updateData.childId !== null && updateData.childId !== existingCharacter.childId) {
    const child = await prisma.childProfile.findFirst({
      where: {
        id: updateData.childId,
        parentId,
        deletedAt: null,
      },
    });

    if (!child) {
      throw ApiError.badRequest('Hồ sơ bé không tồn tại hoặc đã bị xoá.');
    }
    await claimChildSlot(updateData.childId, characterId);
  }

  const updatedCharacter = await prisma.character.update({
    where: { id: characterId },
    data: {
      ...(updateData.name && { name: updateData.name }),
      ...(updateData.appearance !== undefined && { appearance: updateData.appearance }),
      ...(updateData.childId !== undefined && { childId: updateData.childId }),
      // Trang thai chan dung do server suy ra tu anh (client khong tu dat duoc).
      ...(updateData.portraitImageKey !== undefined && {
        portraitImageKey: updateData.portraitImageKey,
        portraitStatus: updateData.portraitImageKey ? 'ready' : 'none',
      }),
      ...(updateData.genPrompt !== undefined && { genPrompt: updateData.genPrompt }),
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
    throw ApiError.notFound('Không tìm thấy nhân vật.');
  }
  if (existingCharacter.childId) {
    throw new ApiError(422, 'Nhân vật này là bé — muốn bỏ thì xoá hồ sơ bé ở trang “Bé nhà mình”.');
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
    throw ApiError.notFound('Không tìm thấy nhân vật.');
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
    `Portrait of a character named ${character.name}`,
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
