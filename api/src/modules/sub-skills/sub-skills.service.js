// Ky nang con (eq_sub_skills) do Specialist soan; moi ky nang con tro ve dung 1 muc CASEL cung nang luc.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

const MANAGERS = new Set(['specialist', 'admin']);

const SKILL_SELECT = { select: { id: true, caselCode: true, nameVi: true } };
const REF_SELECT = { select: { id: true, code: true, textEn: true } };
const MANAGED_INCLUDE = {
  skill: SKILL_SELECT,
  caselReference: REF_SELECT,
  _count: { select: { templates: true, topics: true, checkpoints: true } },
};

const base = (r) => ({
  id: r.id,
  skillId: r.skillId,
  skill: r.skill,
  caselReference: r.caselReference,
  code: r.code,
  nameVi: r.nameVi,
  descriptionVi: r.descriptionVi,
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

/** Phu huynh: chi ban dang dung, khong kem so dem. Specialist / Admin: tat ca + so dem, loc skillId / search / isActive. */
const listSubSkills = async (user, { skillId, search, isActive } = {}) => {
  const manager = MANAGERS.has(user?.role);
  const rows = await prisma.eqSubSkill.findMany({
    where: {
      ...(skillId && { skillId }),
      ...(!manager && { isActive: true }),
      ...(manager && isActive !== undefined && { isActive: isActive === true || isActive === 'true' }),
      ...(search?.trim() && { nameVi: { contains: search.trim(), mode: 'insensitive' } }),
    },
    orderBy: [{ displayOrder: 'asc' }, { nameVi: 'asc' }],
    include: manager ? MANAGED_INCLUDE : { skill: SKILL_SELECT, caselReference: REF_SELECT },
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

/** Muc CASEL phai ton tai va thuoc dung nang luc `skillId`. */
const assertReference = async (skillId, caselReferenceId) => {
  if (!(await prisma.eqSkill.findUnique({ where: { id: skillId }, select: { id: true } }))) {
    throw ApiError.badRequest('Năng lực CASEL không hợp lệ.');
  }
  const ref = await prisma.caselReference.findUnique({ where: { id: caselReferenceId }, select: { skillId: true, code: true } });
  if (!ref) throw ApiError.badRequest('Mục CASEL không hợp lệ.');
  if (ref.skillId !== skillId) throw ApiError.badRequest('Mục CASEL phải thuộc cùng năng lực CASEL với kỹ năng con.');
  return ref;
};

/** Sinh code tu ma muc CASEL; trung thi them _2, _3... */
const generateCode = async (refCode) => {
  const taken = new Set((await prisma.eqSubSkill.findMany({ where: { code: { startsWith: refCode } }, select: { code: true } })).map((r) => r.code));
  if (!taken.has(refCode)) return refCode;
  let n = 2;
  while (taken.has(`${refCode}_${n}`)) n += 1;
  return `${refCode}_${n}`;
};

const duplicate = (code) => ApiError.conflict(`Mã kỹ năng con "${code}" đã tồn tại.`);

const load = async (id) => {
  const r = await prisma.eqSubSkill.findUnique({ where: { id }, include: MANAGED_INCLUDE });
  const published = await publishedCounts([id]);
  return formatManaged(r, published.get(id) ?? 0);
};

const createSubSkill = async (user, data) => {
  assertAgeRange(data);
  const ref = await assertReference(data.skillId, data.caselReferenceId);
  const code = data.code ?? (await generateCode(ref.code));
  if (await prisma.eqSubSkill.findUnique({ where: { code }, select: { id: true } })) throw duplicate(code);
  try {
    const created = await prisma.eqSubSkill.create({
      data: {
        skillId: data.skillId,
        caselReferenceId: data.caselReferenceId,
        code,
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

/** Da co diem dung (checkpoint) dung -> khong doi nang luc / muc CASEL: se lam lech thong ke da ghi. */
const updateSubSkill = async (id, data) => {
  const current = await prisma.eqSubSkill.findUnique({ where: { id }, include: { _count: { select: { checkpoints: true } } } });
  if (!current) throw ApiError.notFound('Không tìm thấy kỹ năng con.');
  assertAgeRange({ ageMin: data.ageMin ?? current.ageMin, ageMax: data.ageMax ?? current.ageMax });
  const skillId = data.skillId ?? current.skillId;
  const caselReferenceId = data.caselReferenceId ?? current.caselReferenceId;
  if (data.skillId !== undefined || data.caselReferenceId !== undefined) {
    await assertReference(skillId, caselReferenceId);
    const changes = skillId !== current.skillId || caselReferenceId !== current.caselReferenceId;
    if (changes && current._count.checkpoints > 0) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Kỹ năng con đã có ${current._count.checkpoints} điểm dừng dùng nên không đổi được năng lực hay mục CASEL. Hãy tạo kỹ năng con mới.`,
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
        ...(data.caselReferenceId !== undefined && { caselReferenceId: data.caselReferenceId }),
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

/** Chi xoa han khi chua co mau / bai hoc / diem dung nao dung; nguoc lai 409 (chi tat duoc). */
const deleteSubSkill = async (id) => {
  const s = await prisma.eqSubSkill.findUnique({ where: { id }, include: { _count: { select: { templates: true, topics: true, checkpoints: true } } } });
  if (!s) throw ApiError.notFound('Không tìm thấy kỹ năng con.');
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
