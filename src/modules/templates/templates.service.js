import { prisma } from '../../config/index.js';
import { ApiError } from '../../utils/index.js';

/**
 * Get templates with filtering and pagination
 * @param {Object} filter
 * @returns {Promise<Object>} Paginated templates list
 */
const getTemplates = async (filter = {}) => {
  const { primarySkillId, age, status, search, page = 1, limit = 10 } = filter;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  const where = {};

  // If status not specified, default to active for general browsing
  if (status) {
    where.status = status;
  } else {
    where.status = 'active';
  }

  if (primarySkillId) {
    where.primarySkillId = primarySkillId;
  }

  if (age !== undefined && age !== null) {
    const ageNum = Number(age);
    where.ageMin = { lte: ageNum };
    where.ageMax = { gte: ageNum };
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, templates] = await Promise.all([
    prisma.template.count({ where }),
    prisma.template.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        primarySkill: {
          select: {
            id: true,
            caselCode: true,
            nameVi: true,
            nameEn: true,
          },
        },
        slots: {
          select: {
            slotKey: true,
            characterRole: true,
            defaultName: true,
          },
        },
        _count: {
          select: {
            stages: true,
            stories: true,
          },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    templates: templates.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      primarySkill: t.primarySkill,
      ageMin: t.ageMin,
      ageMax: t.ageMax,
      status: t.status,
      slots: t.slots,
      stagesCount: t._count.stages,
      storiesCount: t._count.stories,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  };
};

/**
 * Get full template detail by ID including stages, choices, and signals
 * @param {string} templateId
 * @returns {Promise<Object>}
 */
const getTemplateById = async (templateId) => {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      primarySkill: true,
      slots: true,
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: {
          choiceTypes: {
            orderBy: { choiceOrder: 'asc' },
            include: {
              choiceSignals: {
                include: {
                  skill: {
                    select: {
                      id: true,
                      caselCode: true,
                      nameVi: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!template) {
    throw ApiError.notFound('Không tìm thấy kịch bản mẫu');
  }

  return template;
};

/**
 * Create a new template with character slots, stages, choices and signals
 * @param {string} userId - Creator user ID
 * @param {Object} templateData
 * @returns {Promise<Object>}
 */
const createTemplate = async (userId, templateData) => {
  const { title, description, primarySkillId, ageMin, ageMax, status = 'draft', slots = [], stages = [] } = templateData;

  // Verify primary EQ skill exists
  const skill = await prisma.eqSkill.findUnique({ where: { id: primarySkillId } });
  if (!skill) {
    throw ApiError.badRequest('Kỹ năng EQ chính không tồn tại');
  }

  if (ageMin > ageMax) {
    throw ApiError.badRequest('Độ tuổi tối thiểu (ageMin) không được lớn hơn độ tuổi tối đa (ageMax)');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create main template
    const template = await tx.template.create({
      data: {
        title,
        description,
        primarySkillId,
        ageMin,
        ageMax,
        status,
        createdById: userId,
      },
    });

    // 2. Create template slots
    if (slots.length > 0) {
      await tx.templateSlot.createMany({
        data: slots.map((s) => ({
          templateId: template.id,
          slotKey: s.slotKey.startsWith('{') ? s.slotKey : `{${s.slotKey}}`,
          characterRole: s.characterRole,
          defaultName: s.defaultName,
        })),
      });
    }

    // 3. Create stages and nested choice types
    for (const stage of stages) {
      const createdStage = await tx.templateStage.create({
        data: {
          templateId: template.id,
          stageOrder: stage.stageOrder,
          learningObjective: stage.learningObjective,
          emotionToName: stage.emotionToName || null,
          leadInPages: stage.leadInPages || 1,
          isClimax: stage.isClimax || false,
        },
      });

      if (stage.choices && stage.choices.length > 0) {
        for (const choice of stage.choices) {
          const createdChoice = await tx.templateChoiceType.create({
            data: {
              stageId: createdStage.id,
              choiceOrder: choice.choiceOrder,
              typeCode: choice.typeCode,
              description: choice.description,
              isProsocial: choice.isProsocial || false,
            },
          });

          if (choice.signals && choice.signals.length > 0) {
            await tx.templateChoiceSignal.createMany({
              data: choice.signals.map((sig) => ({
                choiceTypeId: createdChoice.id,
                skillId: sig.skillId,
                delta: sig.delta,
              })),
            });
          }
        }
      }
    }

    return tx.template.findUnique({
      where: { id: template.id },
      include: {
        primarySkill: true,
        slots: true,
        stages: {
          orderBy: { stageOrder: 'asc' },
          include: {
            choiceTypes: {
              orderBy: { choiceOrder: 'asc' },
              include: {
                choiceSignals: true,
              },
            },
          },
        },
      },
    });
  });
};

/**
 * Update template metadata or publication status
 * @param {string} templateId
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
const updateTemplate = async (templateId, updateData) => {
  const existing = await prisma.template.findUnique({ where: { id: templateId } });
  if (!existing) {
    throw ApiError.notFound('Không tìm thấy kịch bản mẫu');
  }

  if (updateData.primarySkillId) {
    const skill = await prisma.eqSkill.findUnique({ where: { id: updateData.primarySkillId } });
    if (!skill) {
      throw ApiError.badRequest('Kỹ năng EQ chính không tồn tại');
    }
  }

  const ageMin = updateData.ageMin !== undefined ? updateData.ageMin : existing.ageMin;
  const ageMax = updateData.ageMax !== undefined ? updateData.ageMax : existing.ageMax;
  if (ageMin > ageMax) {
    throw ApiError.badRequest('Độ tuổi tối thiểu không được lớn hơn độ tuổi tối đa');
  }

  return prisma.template.update({
    where: { id: templateId },
    data: {
      ...(updateData.title && { title: updateData.title }),
      ...(updateData.description !== undefined && { description: updateData.description }),
      ...(updateData.primarySkillId && { primarySkillId: updateData.primarySkillId }),
      ...(updateData.ageMin !== undefined && { ageMin: updateData.ageMin }),
      ...(updateData.ageMax !== undefined && { ageMax: updateData.ageMax }),
      ...(updateData.status && { status: updateData.status }),
    },
    include: {
      primarySkill: true,
      slots: true,
      stages: true,
    },
  });
};

/**
 * Delete or archive template
 * @param {string} templateId
 * @returns {Promise<Object>}
 */
const deleteTemplate = async (templateId) => {
  const existing = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      _count: {
        select: { stories: true },
      },
    },
  });

  if (!existing) {
    throw ApiError.notFound('Không tìm thấy kịch bản mẫu');
  }

  // If stories are already using this template, retire it rather than cascade delete
  if (existing._count.stories > 0) {
    await prisma.template.update({
      where: { id: templateId },
      data: { status: 'retired' },
    });
    return { message: 'Kịch bản mẫu đã có truyện sử dụng, đã chuyển sang trạng thái Ngưng sử dụng (retired)' };
  }

  await prisma.template.delete({
    where: { id: templateId },
  });

  return { message: 'Xóa kịch bản mẫu thành công' };
};

export default {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
