// Mau cau hoi (question_templates) co phien ban: ban published bat bien, sua = tao/ghi ban nhap moi.
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { assertVersionComplete } from './lib/templateRules.js';

const SCORES = ['constructiveScore', 'avoidantScore', 'impulsiveScore'];
const CONTENT_FIELDS = [
  'questionFrame', 'pageSetup', 'needsTarget', 'allowedEmotions', 'correctDesc', 'distractorDesc', 'constructiveDesc', 'avoidantDesc',
  'impulsiveDesc', ...SCORES, 'hintGuidance', 'parentPrompts', 'rationale', 'referenceUrl',
];

const SUB_SKILL = { select: { id: true, nameVi: true, skillId: true } };
const INCLUDE = { subSkill: SUB_SKILL, versions: { orderBy: { version: 'desc' } } };

/** Decimal -> Number de tra JSON. */
const formatVersion = (v) =>
  v && {
    ...v,
    ...Object.fromEntries(SCORES.map((k) => [k, v[k] == null ? null : Number(v[k])])),
    allowedEmotions: v.allowedEmotions ?? [],
    parentPrompts: v.parentPrompts ?? [],
  };

const formatTemplate = (t) => {
  const { versions, ...rest } = t;
  // versions da sap giam dan theo version
  return {
    ...rest,
    latestPublished: formatVersion(versions.find((v) => v.status === 'published') ?? null),
    draft: formatVersion(versions.find((v) => v.status === 'draft') ?? null),
  };
};

const load = async (id) => {
  const t = await prisma.questionTemplate.findUnique({ where: { id }, include: INCLUDE });
  if (!t) throw ApiError.notFound('Không tìm thấy mẫu câu hỏi.');
  return formatTemplate(t);
};

const listTemplates = async ({ subSkillId, skillId, isActive } = {}) => {
  const rows = await prisma.questionTemplate.findMany({
    where: {
      ...(subSkillId && { subSkillId }),
      ...(skillId && { subSkill: { skillId } }),
      ...(isActive !== undefined && { isActive: isActive === 'true' || isActive === true }),
    },
    orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
    include: INCLUDE,
  });
  return rows.map(formatTemplate);
};

const createTemplate = async (user, { subSkillId, title, answerFormat }) => {
  if (!(await prisma.eqSubSkill.findUnique({ where: { id: subSkillId }, select: { id: true } }))) {
    throw ApiError.badRequest('Kỹ năng con không hợp lệ.');
  }
  // question_frame NOT NULL -> nhap rong luu ''; assertVersionComplete coi chuoi trong la thieu.
  const created = await prisma.questionTemplate.create({
    data: {
      subSkillId,
      title: title.trim(),
      answerFormat,
      createdBy: user.id,
      versions: { create: { version: 1, status: 'draft', questionFrame: '', createdBy: user.id } },
    },
    select: { id: true },
  });
  return load(created.id);
};

const updateTemplate = async (id, { title, isActive }) => {
  if (!(await prisma.questionTemplate.findUnique({ where: { id }, select: { id: true } }))) throw ApiError.notFound('Không tìm thấy mẫu câu hỏi.');
  await prisma.questionTemplate.update({
    where: { id },
    data: { ...(title !== undefined && { title: title.trim() }), ...(isActive !== undefined && { isActive }) },
  });
  return load(id);
};

const pickContent = (v) => Object.fromEntries(CONTENT_FIELDS.map((k) => [k, v[k]]));

/** Ghi vao ban nhap; chua co nhap thi tao version = max+1 sao tu ban published moi nhat roi ap body. Ban published khong bao gio bi sua. */
const saveDraft = async (user, id, body) => {
  const t = await prisma.questionTemplate.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } });
  if (!t) throw ApiError.notFound('Không tìm thấy mẫu câu hỏi.');
  const data = Object.fromEntries(Object.entries(body).filter(([k, v]) => CONTENT_FIELDS.includes(k) && v !== undefined));
  const draft = t.versions.find((v) => v.status === 'draft');
  try {
    if (draft) {
      // Chan dua voi publish: chi ghi khi hang van la nhap
      const res = await prisma.questionTemplateVersion.updateMany({ where: { id: draft.id, status: 'draft' }, data });
      if (res.count === 0) throw ApiError.conflict('Bản nháp vừa được ban hành, hãy tải lại.');
    } else {
      const latest = t.versions.find((v) => v.status === 'published');
      await prisma.questionTemplateVersion.create({
        data: {
          ...(latest ? pickContent(latest) : { questionFrame: '' }),
          ...data,
          templateId: id,
          version: (t.versions[0]?.version ?? 0) + 1,
          status: 'draft',
          createdBy: user.id,
        },
      });
    }
  } catch (e) {
    if (e?.code === 'P2002') throw ApiError.conflict('Mẫu vừa có bản nháp khác được tạo, hãy tải lại.'); // dua nhau tao nhap
    throw e;
  }
  return load(id);
};

const publish = async (user, id) => {
  const t = await prisma.questionTemplate.findUnique({ where: { id }, include: { versions: true } });
  if (!t) throw ApiError.notFound('Không tìm thấy mẫu câu hỏi.');
  const draft = t.versions.find((v) => v.status === 'draft');
  if (!draft) throw ApiError.conflict('Mẫu không có bản nháp để ban hành.');
  assertVersionComplete(t.answerFormat, formatVersion(draft));
  const res = await prisma.questionTemplateVersion.updateMany({
    where: { id: draft.id, status: 'draft' },
    data: { status: 'published', publishedBy: user.id, publishedAt: new Date() },
  });
  if (res.count === 0) throw ApiError.conflict('Bản nháp đã được ban hành.');
  return load(id);
};

/** Chi xoa han khi khong checkpoint nao dung phien ban nao cua mau; nguoc lai 409 (chi tat duoc). */
const deleteTemplate = async (id) => {
  if (!(await prisma.questionTemplate.findUnique({ where: { id }, select: { id: true } }))) throw ApiError.notFound('Không tìm thấy mẫu câu hỏi.');
  const used = await prisma.storyCheckpoint.count({ where: { templateVersion: { templateId: id } } });
  if (used) throw ApiError.conflict(`Mẫu đã có ${used} điểm dừng dùng, chỉ tắt được.`);
  await prisma.$transaction([
    prisma.questionTemplateVersion.deleteMany({ where: { templateId: id } }),
    prisma.questionTemplate.delete({ where: { id } }),
  ]);
  return { deleted: true, message: 'Đã xoá mẫu câu hỏi.' };
};

export default { listTemplates, createTemplate, updateTemplate, saveDraft, publish, deleteTemplate };
