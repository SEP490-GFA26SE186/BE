import prisma from '../../config/prisma.js';
import ApiError from '../../utils/ApiError.js';

/**
 * List topics with filtering and pagination
 * @param {Object} query
 */
const getTopics = async (query = {}) => {
  const {
    skillId,
    search,
    ageMin,
    ageMax,
    isActive,
    page = 1,
    limit = 20,
  } = query;

  const where = {};

  if (skillId) {
    where.skillId = skillId;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { guidance: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (ageMin !== undefined) {
    where.ageMax = { gte: ageMin };
  }
  if (ageMax !== undefined) {
    where.ageMin = { lte: ageMax };
  }

  const skip = (page - 1) * limit;

  const [total, topics] = await Promise.all([
    prisma.topic.count({ where }),
    prisma.topic.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        skill: {
          select: {
            id: true,
            caselCode: true,
            nameVi: true,
            nameEn: true,
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        _count: {
          select: {
            stories: true,
          },
        },
      },
    }),
  ]);

  return {
    items: topics.map((t) => ({
      ...t,
      storiesCount: t._count.stories,
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get topic details by ID
 * @param {string} id
 */
const getTopicById = async (id) => {
  const topic = await prisma.topic.findUnique({
    where: { id },
    include: {
      skill: true,
      creator: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      _count: {
        select: {
          stories: true,
        },
      },
    },
  });

  if (!topic) {
    throw ApiError.notFound('Chủ đề bài học không tồn tại');
  }

  return {
    ...topic,
    storiesCount: topic._count.stories,
  };
};

/**
 * Create a new topic (Moderator/Admin)
 * @param {string} userId
 * @param {Object} data
 */
const createTopic = async (userId, data) => {
  const skill = await prisma.eqSkill.findUnique({
    where: { id: data.skillId },
  });

  if (!skill) {
    throw ApiError.badRequest('Kỹ năng EQ (skillId) không tồn tại');
  }

  return prisma.topic.create({
    data: {
      title: data.title.trim(),
      skillId: data.skillId,
      guidance: data.guidance.trim(),
      ageMin: data.ageMin ?? 5,
      ageMax: data.ageMax ?? 8,
      displayOrder: data.displayOrder ?? 0,
      isActive: data.isActive ?? true,
      createdBy: userId,
    },
    include: {
      skill: true,
      creator: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    },
  });
};

/**
 * Update an existing topic (Moderator/Admin)
 * @param {string} id
 * @param {Object} data
 */
const updateTopic = async (id, data) => {
  const existing = await prisma.topic.findUnique({
    where: { id },
  });

  if (!existing) {
    throw ApiError.notFound('Chủ đề bài học không tồn tại');
  }

  if (data.skillId) {
    const skill = await prisma.eqSkill.findUnique({
      where: { id: data.skillId },
    });
    if (!skill) {
      throw ApiError.badRequest('Kỹ năng EQ (skillId) không tồn tại');
    }
  }

  const ageMin = data.ageMin ?? existing.ageMin;
  const ageMax = data.ageMax ?? existing.ageMax;
  if (ageMin > ageMax) {
    throw ApiError.badRequest('ageMin phải nhỏ hơn hoặc bằng ageMax');
  }

  return prisma.topic.update({
    where: { id },
    data: {
      ...(data.title && { title: data.title.trim() }),
      ...(data.skillId && { skillId: data.skillId }),
      ...(data.guidance && { guidance: data.guidance.trim() }),
      ...(data.ageMin !== undefined && { ageMin: data.ageMin }),
      ...(data.ageMax !== undefined && { ageMax: data.ageMax }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    include: {
      skill: true,
    },
  });
};

/**
 * Delete a topic (Soft or restrict if stories exist)
 * @param {string} id
 */
const deleteTopic = async (id) => {
  const existing = await prisma.topic.findUnique({
    where: { id },
    include: {
      _count: {
        select: { stories: true },
      },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Chủ đề bài học không tồn tại');
  }

  if (existing._count.stories > 0) {
    // If stories are linked, deactivate instead of hard delete to preserve referential integrity
    await prisma.topic.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Chủ đề đã có truyện liên kết nên đã được chuyển sang trạng thái ngưng kích hoạt (inactive)' };
  }

  await prisma.topic.delete({
    where: { id },
  });

  return { message: 'Đã xóa chủ đề bài học thành công' };
};

export default {
  getTopics,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
};
