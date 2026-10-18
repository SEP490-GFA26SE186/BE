import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';

// 5 nang luc CASEL (eq_skills, seed co dinh). rev8: dem bai hoc (topics) dang dung thay cho template cu.

/**
 * GET /eq-skills -> [{ id, caselCode, nameVi, nameEn, description, displayOrder, activeTopicsCount }]
 * @param {{ search?: string }} [filter]
 */
const getEqSkills = async (filter = {}) => {
  const skills = await prisma.eqSkill.findMany({
    where: filter.search
      ? {
          OR: [
            { nameVi: { contains: filter.search, mode: 'insensitive' } },
            { nameEn: { contains: filter.search, mode: 'insensitive' } },
            { description: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: { displayOrder: 'asc' },
    include: { _count: { select: { topics: { where: { isActive: true } } } } },
  });
  return skills.map((s) => ({
    id: s.id,
    caselCode: s.caselCode,
    nameVi: s.nameVi,
    nameEn: s.nameEn,
    description: s.description,
    displayOrder: s.displayOrder,
    activeTopicsCount: s._count.topics,
  }));
};

/** GET /eq-skills/:idOrCode — chi tiet + bai hoc dang dung cua nang luc. */
const getEqSkillById = async (idOrCode) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
  const skill = await prisma.eqSkill.findFirst({
    where: isUuid ? { id: idOrCode } : { caselCode: idOrCode },
    include: {
      topics: {
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true, ageMin: true, ageMax: true },
      },
    },
  });
  if (!skill) throw ApiError.notFound('Không tìm thấy năng lực CASEL.');
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

export default { getEqSkills, getEqSkillById };
