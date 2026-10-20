// Bai hoc (topics) do Specialist soan, gan mot nang luc CASEL (rev8 thay khuon truyen / template).
// Mot bai hoc dung cho nhieu truyen. Phu huynh chon bai hoc khi tao truyen; Specialist them / sua / an / xoa.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

const MANAGERS = new Set(['specialist', 'admin']);

const PARENT_SELECT = {
  id: true,
  title: true,
  ageMin: true,
  ageMax: true,
  skill: { select: { id: true, caselCode: true, nameVi: true } },
};

const formatManaged = (t) => ({
  id: t.id,
  title: t.title,
  guidance: t.guidance,
  ageMin: t.ageMin,
  ageMax: t.ageMax,
  displayOrder: t.displayOrder,
  isActive: t.isActive,
  skillId: t.skillId,
  skill: t.skill,
  creator: t.creator,
  storiesCount: t._count.stories,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

const MANAGED_INCLUDE = {
  skill: { select: { id: true, caselCode: true, nameVi: true } },
  creator: { select: { id: true, fullName: true, username: true } },
  _count: { select: { stories: true } },
};

/**
 * GET /topics. Phu huynh: chi bai hoc dang dung, khong kem `guidance` (huong dan cho AI).
 * Specialist / Admin: moi bai hoc + guidance + so truyen dang dung, loc skillId / search / isActive.
 */
const listTopics = async (user, { skillId, search, isActive } = {}) => {
  if (!MANAGERS.has(user?.role)) {
    return prisma.topic.findMany({ where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }], select: PARENT_SELECT });
  }
  const rows = await prisma.topic.findMany({
    where: {
      ...(skillId && { skillId }),
      ...(isActive !== undefined && { isActive: isActive === true || isActive === 'true' }),
      ...(search?.trim() && { title: { contains: search.trim(), mode: 'insensitive' } }),
    },
    orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    include: MANAGED_INCLUDE,
  });
  return rows.map(formatManaged);
};

/** Giu ten cu cho phan phu huynh dung (khong doi hop dong). */
const getActiveTopics = () => listTopics(null);

const assertAgeRange = ({ ageMin, ageMax }) => {
  if (ageMin != null && ageMax != null && ageMin > ageMax) {
    throw ApiError.badRequest('Tuổi tối thiểu phải nhỏ hơn hoặc bằng tuổi tối đa.');
  }
};

const assertSkill = async (skillId) => {
  if (!(await prisma.eqSkill.findUnique({ where: { id: skillId }, select: { id: true } }))) {
    throw ApiError.badRequest('Năng lực CASEL không hợp lệ.');
  }
};

const createTopic = async (user, data) => {
  assertAgeRange(data);
  await assertSkill(data.skillId);
  const topic = await prisma.topic.create({
    data: {
      title: data.title.trim(),
      skillId: data.skillId,
      guidance: data.guidance.trim(),
      ageMin: data.ageMin ?? 5,
      ageMax: data.ageMax ?? 8,
      displayOrder: data.displayOrder ?? 0,
      isActive: data.isActive ?? true,
      createdBy: user.id,
    },
    include: MANAGED_INCLUDE,
  });
  return formatManaged(topic);
};

/**
 * Sua bai hoc. Da co truyen dung -> KHONG doi duoc nang luc CASEL: diem cau giai quyet tinh huong
 * cong vao nang luc cua bai hoc, doi giua chung lam mot truyen cho diem vao hai nang luc theo thoi diem.
 */
const updateTopic = async (id, data) => {
  const current = await prisma.topic.findUnique({ where: { id }, include: { _count: { select: { stories: true } } } });
  if (!current) throw ApiError.notFound('Không tìm thấy bài học.');
  assertAgeRange({ ageMin: data.ageMin ?? current.ageMin, ageMax: data.ageMax ?? current.ageMax });
  if (data.skillId && data.skillId !== current.skillId) {
    if (current._count.stories > 0) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Bài học đã có ${current._count.stories} truyện dùng nên không đổi được năng lực CASEL. Hãy tạo bài học mới.`,
      );
    }
    await assertSkill(data.skillId);
  }
  const topic = await prisma.topic.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.skillId !== undefined && { skillId: data.skillId }),
      ...(data.guidance !== undefined && { guidance: data.guidance.trim() }),
      ...(data.ageMin !== undefined && { ageMin: data.ageMin }),
      ...(data.ageMax !== undefined && { ageMax: data.ageMax }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    include: MANAGED_INCLUDE,
  });
  return formatManaged(topic);
};

/**
 * Xoa: chua co truyen nao dung -> xoa han. Da co truyen -> chi ngung dung (truyen cu van doc / ban
 * binh thuong; truyen moi khong chon duoc). stories.topic_id bat buoc + khoa ngoai Restrict.
 */
const deleteTopic = async (id) => {
  const topic = await prisma.topic.findUnique({ where: { id }, include: { _count: { select: { stories: true } } } });
  if (!topic) throw ApiError.notFound('Không tìm thấy bài học.');
  if (topic._count.stories > 0) {
    await prisma.topic.update({ where: { id }, data: { isActive: false } });
    return { deleted: false, deactivated: true, message: `Bài học đang có ${topic._count.stories} truyện dùng nên đã chuyển sang ngưng dùng thay vì xoá.` };
  }
  await prisma.topic.delete({ where: { id } });
  return { deleted: true, deactivated: false, message: 'Đã xoá bài học.' };
};

export default { listTopics, getActiveTopics, createTopic, updateTopic, deleteTopic };
