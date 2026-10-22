// Mau cau hoi (question_templates) co phien ban: ban published bat bien, sua = tao/ghi ban nhap moi.
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { assertVersionComplete, draftDefaults } from './lib/templateRules.js';
import { CASEL_URL } from '../../../prisma/data/casel.js';

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

const TITLE_FROM_FRAME = 60;

/** Ten mau tu sinh tu y dinh cau hoi (o 1) khi chuyen gia de trong (spec family-story §4.2). */
const titleFrom = (title, questionFrame) => {
  const given = title?.trim();
  if (given) return given;
  const frame = (questionFrame ?? '').trim().replace(/\s+/g, ' ');
  if (!frame) throw ApiError.badRequest('Cần tên mẫu hoặc nội dung "Bé được hỏi về điều gì".');
  return frame.length > TITLE_FROM_FRAME ? `${frame.slice(0, TITLE_FROM_FRAME).trimEnd()}…` : frame;
};

const createTemplate = async (user, { subSkillId, title, answerFormat, ...content }) => {
  if (!(await prisma.eqSubSkill.findUnique({ where: { id: subSkillId }, select: { id: true } }))) {
    throw ApiError.badRequest('Kỹ năng con không hợp lệ.');
  }
  const data = Object.fromEntries(Object.entries(content).filter(([k, v]) => CONTENT_FIELDS.includes(k) && v !== undefined));
  // question_frame NOT NULL -> nhap rong luu ''; assertVersionComplete coi chuoi trong la thieu.
  const created = await prisma.questionTemplate.create({
    data: {
      subSkillId,
      title: titleFrom(title, data.questionFrame),
      answerFormat,
      createdBy: user.id,
      versions: {
        create: { questionFrame: '', ...draftDefaults(answerFormat, CASEL_URL), ...data, version: 1, status: 'draft', createdBy: user.id },
      },
    },
    select: { id: true },
  });
  return load(created.id);
};

const COPY_SUFFIX = ' (bản sao)';

/**
 * POST /:id/duplicate: mau moi cung ky nang con + dang tra loi, ban nhap v1 chep noi dung ban
 * published moi nhat (chua ban hanh thi chep ban nhap).
 */
const duplicateTemplate = async (user, id) => {
  const t = await prisma.questionTemplate.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } });
  if (!t) throw ApiError.notFound('Không tìm thấy mẫu câu hỏi.');
  const source = t.versions.find((v) => v.status === 'published') ?? t.versions.find((v) => v.status === 'draft');
  const content = source ? pickContent(source) : { questionFrame: '', ...draftDefaults(t.answerFormat, CASEL_URL) };
  const created = await prisma.questionTemplate.create({
    data: {
      subSkillId: t.subSkillId,
      title: `${t.title.slice(0, 200 - COPY_SUFFIX.length)}${COPY_SUFFIX}`,
      answerFormat: t.answerFormat,
      createdBy: user.id,
      versions: { create: { ...content, version: 1, status: 'draft', createdBy: user.id } },
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
          ...(latest ? pickContent(latest) : { questionFrame: '', ...draftDefaults(t.answerFormat, CASEL_URL) }),
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

export default { listTemplates, createTemplate, duplicateTemplate, updateTemplate, saveDraft, publish, deleteTemplate };
