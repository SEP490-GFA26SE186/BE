// Ky nang con (eq_sub_skills) CHINH LA muc CASEL (1 tang, nguoi dung chot 2026-10-21):
//   - source=casel: 40 muc goc CASEL (seed). Khong sua nang luc / ma / cau goc tieng Anh, khong xoa (chi tat).
//   - source=specialist: Specialist bo sung duoi 1 nang luc, cau goc tieng Anh tuy chon; xoa duoc khi chua dung.
import { StatusCodes } from 'http-status-codes';
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

const assertSkill = async (skillId) => {
  const skill = await prisma.eqSkill.findUnique({ where: { id: skillId }, select: { id: true, caselCode: true } });
  if (!skill) throw ApiError.badRequest('Năng lực CASEL không hợp lệ.');
  return skill;
};

// Tien to ma theo nang luc, cung kieu ma 40 muc goc (sa_, sm_, soa_, rs_, rdm_)
const CODE_PREFIX = {
  self_awareness: 'sa',
  self_management: 'sm',
  social_awareness: 'soa',
  relationship_skills: 'rs',
  responsible_decision_making: 'rdm',
};

/** Sinh code tu nang luc + ten tieng Viet (bo dau); trung thi them _2, _3... */
const generateCode = async (caselCode, nameVi) => {
  const slug = nameVi
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 45)
    .replace(/_+$/, '');
  const root = `${CODE_PREFIX[caselCode] ?? 'sub'}_${slug || 'ky_nang'}`;
  const taken = new Set((await prisma.eqSubSkill.findMany({ where: { code: { startsWith: root } }, select: { code: true } })).map((r) => r.code));
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}_${n}`)) n += 1;
  return `${root}_${n}`;
};

const locked = (message) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message);

const duplicate = (code) => ApiError.conflict(`Mã kỹ năng con "${code}" đã tồn tại.`);

const load = async (id) => {
  const r = await prisma.eqSubSkill.findUnique({ where: { id }, include: MANAGED_INCLUDE });
  const published = await publishedCounts([id]);
  return formatManaged(r, published.get(id) ?? 0);
};

const createSubSkill = async (user, data) => {
  assertAgeRange(data);
  const skill = await assertSkill(data.skillId);
  const code = data.code ?? (await generateCode(skill.caselCode, data.nameVi.trim()));
  if (await prisma.eqSubSkill.findUnique({ where: { code }, select: { id: true } })) throw duplicate(code);
  try {
    const created = await prisma.eqSubSkill.create({
      data: {
        skillId: data.skillId,
        code,
        source: 'specialist', // 40 muc goc CASEL chi den tu seed / migration
        caselTextEn: data.caselTextEn ?? null,
        nameVi: data.nameVi.trim(),
        descriptionVi: data.descriptionVi.trim(),
        ageMin: data.ageMin ?? 5,
        ageMax: data.ageMax ?? 8,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
        createdBy: user.id,
      },
      select: { id: true },
    });
    return load(created.id);
  } catch (e) {
    if (e?.code === 'P2002') throw duplicate(code); // dua nhau tao cung code
    throw e;
  }
};

/**
 * Muc goc CASEL: khong doi nang luc / ma / cau goc tieng Anh (422).
 * Da co diem dung (checkpoint) dung -> khong doi nang luc: se lam lech thong ke da ghi (422).
 */
const updateSubSkill = async (id, data) => {
  const current = await prisma.eqSubSkill.findUnique({ where: { id }, include: { _count: { select: { checkpoints: true } } } });
  if (!current) throw ApiError.notFound('Không tìm thấy kỹ năng con.');
  assertAgeRange({ ageMin: data.ageMin ?? current.ageMin, ageMax: data.ageMax ?? current.ageMax });
  const skillChanges = data.skillId !== undefined && data.skillId !== current.skillId;
  if (current.source === 'casel') {
    if (skillChanges) throw locked('Mục gốc CASEL không đổi được năng lực.');
    if (data.caselTextEn !== undefined && data.caselTextEn !== current.caselTextEn) {
      throw locked('Câu gốc CASEL (tiếng Anh) của mục gốc CASEL không sửa được.');
    }
    if (data.code !== undefined && data.code !== current.code) throw locked('Mục gốc CASEL không đổi được mã.');
  }
  if (skillChanges) {
    await assertSkill(data.skillId);
    if (current._count.checkpoints > 0) {
      throw locked(
        `Kỹ năng con đã có ${current._count.checkpoints} điểm dừng dùng nên không đổi được năng lực. Hãy tạo kỹ năng con mới.`,
      );
    }
  }
  if (data.code !== undefined && data.code !== current.code) {
    if (await prisma.eqSubSkill.findUnique({ where: { code: data.code }, select: { id: true } })) throw duplicate(data.code);
  }
  try {
    await prisma.eqSubSkill.update({
      where: { id },
      data: {
        ...(data.skillId !== undefined && { skillId: data.skillId }),
        ...(data.caselTextEn !== undefined && current.source !== 'casel' && { caselTextEn: data.caselTextEn }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.nameVi !== undefined && { nameVi: data.nameVi.trim() }),
        ...(data.descriptionVi !== undefined && { descriptionVi: data.descriptionVi.trim() }),
        ...(data.ageMin !== undefined && { ageMin: data.ageMin }),
        ...(data.ageMax !== undefined && { ageMax: data.ageMax }),
        ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  } catch (e) {
    if (e?.code === 'P2002') throw duplicate(data.code);
    throw e;
  }
  return load(id);
};

/** Muc goc CASEL khong bao gio xoa (409). Ky nang con chuyen gia: chi xoa khi chua co mau / bai hoc / diem dung dung, nguoc lai 409 (chi tat duoc). */
const deleteSubSkill = async (id) => {
  const s = await prisma.eqSubSkill.findUnique({ where: { id }, include: { _count: { select: { templates: true, topics: true, checkpoints: true } } } });
  if (!s) throw ApiError.notFound('Không tìm thấy kỹ năng con.');
  if (s.source === 'casel') throw ApiError.conflict('Mục gốc CASEL chỉ tắt được, không xoá được.');
  const used = [
    s._count.templates && `${s._count.templates} mẫu câu hỏi`,
    s._count.topics && `${s._count.topics} bài học`,
    s._count.checkpoints && `${s._count.checkpoints} điểm dừng`,
  ].filter(Boolean);
  if (used.length) throw ApiError.conflict(`Kỹ năng con đã có ${used.join(', ')} dùng, chỉ tắt được.`);
  await prisma.eqSubSkill.delete({ where: { id } });
  return { deleted: true, message: 'Đã xoá kỹ năng con.' };
};

export default { listSubSkills, createSubSkill, updateSubSkill, deleteSubSkill };
