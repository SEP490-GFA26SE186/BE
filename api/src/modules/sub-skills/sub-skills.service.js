// Ky nang con (eq_sub_skills) CHINH LA muc CASEL (1 tang, chot 2026-10-21): 40 muc goc CASEL tu seed.
// La danh muc chuan (chot 2026-10-22): Specialist chi chinh dien giai tieng Viet, do tuoi va bat/tat; khong them / xoa.
// source=specialist chi con de tuong thich du lieu cu, API khong tao moi.
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

const MANAGERS = new Set(['specialist', 'admin']);

const SKILL_SELECT = { select: { id: true, caselCode: true, nameVi: true } };
const MANAGED_INCLUDE = {
  skill: SKILL_SELECT,
  _count: { select: { templates: true, topics: true, checkpoints: true } },
};

const base = (r) => ({
  id: r.id,
  skillId: r.skillId,
  skill: r.skill,
  code: r.code,
  nameVi: r.nameVi,
  descriptionVi: r.descriptionVi,
  caselTextEn: r.caselTextEn,
  source: r.source,
  ageMin: r.ageMin,
  ageMax: r.ageMax,
  isActive: r.isActive,
  displayOrder: r.displayOrder,
});

const formatManaged = (r, publishedTemplatesCount) => ({
  ...base(r),
  templatesCount: r._count.templates,
  publishedTemplatesCount,
  topicsCount: r._count.topics,
  checkpointsCount: r._count.checkpoints,
});

/** Mau "published" = co it nhat 1 phien ban published. */
const publishedCounts = async (ids) => {
  if (!ids.length) return new Map();
  const rows = await prisma.questionTemplate.groupBy({
    by: ['subSkillId'],
    where: { subSkillId: { in: ids }, versions: { some: { status: 'published' } } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.subSkillId, r._count._all]));
};

/** Phu huynh: chi ban dang dung, khong kem so dem. Specialist / Admin: tat ca + so dem, loc skillId / search / isActive / source. */
const listSubSkills = async (user, { skillId, search, isActive, source } = {}) => {
  const manager = MANAGERS.has(user?.role);
  const rows = await prisma.eqSubSkill.findMany({
    where: {
      ...(skillId && { skillId }),
      ...(source && { source }),
      ...(!manager && { isActive: true }),
      ...(manager && isActive !== undefined && { isActive: isActive === true || isActive === 'true' }),
      ...(search?.trim() && { nameVi: { contains: search.trim(), mode: 'insensitive' } }),
    },
    orderBy: [{ displayOrder: 'asc' }, { nameVi: 'asc' }],
    include: manager ? MANAGED_INCLUDE : { skill: SKILL_SELECT },
  });
  if (!manager) return rows.map(base);
  const published = await publishedCounts(rows.map((r) => r.id));
  return rows.map((r) => formatManaged(r, published.get(r.id) ?? 0));
};

const assertAgeRange = ({ ageMin, ageMax }) => {
  if (ageMin != null && ageMax != null && ageMin > ageMax) {
    throw ApiError.badRequest('Tuổi tối thiểu phải nhỏ hơn hoặc bằng tuổi tối đa.');
  }
};

const load = async (id) => {
  const r = await prisma.eqSubSkill.findUnique({ where: { id }, include: MANAGED_INCLUDE });
  const published = await publishedCounts([id]);
  return formatManaged(r, published.get(id) ?? 0);
};

/**
 * Danh muc chuan, chi dieu chinh (chot 2026-10-22): khong them / xoa qua API, khong doi nang luc / ma / cau goc tieng Anh.
 * Chi sua dien giai tieng Viet, do tuoi va bat/tat (validation chan cac truong khac -> 400).
 */
const updateSubSkill = async (id, data) => {
  const current = await prisma.eqSubSkill.findUnique({ where: { id }, select: { ageMin: true, ageMax: true } });
  if (!current) throw ApiError.notFound('Không tìm thấy kỹ năng con.');
  assertAgeRange({ ageMin: data.ageMin ?? current.ageMin, ageMax: data.ageMax ?? current.ageMax });
  await prisma.eqSubSkill.update({
    where: { id },
    data: {
      ...(data.nameVi !== undefined && { nameVi: data.nameVi.trim() }),
      ...(data.descriptionVi !== undefined && { descriptionVi: data.descriptionVi.trim() }),
      ...(data.ageMin !== undefined && { ageMin: data.ageMin }),
      ...(data.ageMax !== undefined && { ageMax: data.ageMax }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
  return load(id);
};

export default { listSubSkills, updateSubSkill };
