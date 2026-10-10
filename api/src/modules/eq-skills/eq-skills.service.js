import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';

/**
 * Get all CASEL EQ skills with active topic counts
 * @param {Object} [filter]
 * @returns {Promise<Array>}
 */
const getEqSkills = async (filter = {}) => {
  const where = {};

  if (filter.search) {
    where.OR = [
      { nameVi: { contains: filter.search, mode: 'insensitive' } },
      { nameEn: { contains: filter.search, mode: 'insensitive' } },
      { description: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const skills = await prisma.eqSkill.findMany({
    where,
    orderBy: {
      displayOrder: 'asc',
    },
    include: {
      _count: {
        select: {
          topics: {
            where: { isActive: true },
          },
        },
      },
    },
  });

  return skills.map((skill) => ({
    id: skill.id,
    caselCode: skill.caselCode,
    nameVi: skill.nameVi,
    nameEn: skill.nameEn,
    description: skill.description,
    displayOrder: skill.displayOrder,
    activeTopicsCount: skill._count.topics,
  }));
};

/**
 * Get single EQ skill details by ID or CASEL code
 * @param {string} idOrCode - UUID or CASEL code (e.g. self_awareness)
 * @returns {Promise<Object>}
 */
const getEqSkillById = async (idOrCode) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);

  const skill = await prisma.eqSkill.findFirst({
    where: isUuid ? { id: idOrCode } : { caselCode: idOrCode },
    include: {
      topics: {
        where: { isActive: true },
        select: {
          id: true,
          title: true,
          guidance: true,
          ageMin: true,
          ageMax: true,
          isActive: true,
          createdAt: true,
        },
      },
    },
  });

  if (!skill) {
    throw ApiError.notFound('EQ skill not found');
  }

  return {
    id: skill.id,
    caselCode: skill.caselCode,
    nameVi: skill.nameVi,
    nameEn: skill.nameEn,
    description: skill.description,
    displayOrder: skill.displayOrder,
    topics: skill.topics,
  };
};

export default {
  getEqSkills,
  getEqSkillById,
};
