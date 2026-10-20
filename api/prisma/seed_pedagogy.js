// =============================================================================
// Seed: du lieu su pham CASEL (spec 2026-10-20-casel-pedagogy §5)
//   casel_references (40 muc), eq_sub_skills (23), question_templates + question_template_versions.
//
// Phai chay sau seedEqSkills (skill_id) va truoc seedTopics (topic_sub_skills tro vao eq_sub_skills).
//
// Idempotent, khong ghi de ban Specialist da sua:
//   - casel_references: upsert theo code. Bang chi doc (khong co API ghi), nen seed la nguon duy nhat
//     -> cap nhat nguyen van/thu tu cho khop data/casel.js.
//   - eq_sub_skills: tao neu chua co code; da co thi bo qua (Specialist co the da sua/tat).
//   - question_templates: tao neu chua co (sub_skill, title) kem phien ban 1; da co thi bo qua
//     (khong dung vao phien ban Specialist da tao/ban hanh).
// publish = true -> phien ban 1 o trang thai published (seed test/demo); false -> draft (seed "that",
// Specialist doc roi ban hanh — spec §5.2).
// =============================================================================

import { CASEL_REFERENCES } from './data/casel.js';
import { SUB_SKILLS } from './data/pedagogy.js';
import { ensureSpecialist } from './seed_topics.js';

// Cac truong noi dung cua phien ban, ten trung model QuestionTemplateVersion
const VERSION_FIELDS = [
  'questionFrame',
  'pageSetup',
  'needsTarget',
  'allowedEmotions',
  'correctDesc',
  'distractorDesc',
  'constructiveDesc',
  'avoidantDesc',
  'impulsiveDesc',
  'constructiveScore',
  'avoidantScore',
  'impulsiveScore',
  'hintGuidance',
  'parentPrompts',
  'rationale',
  'referenceUrl',
];

export async function seedPedagogy(prisma, { publish = false } = {}) {
  console.log(`🌱 Seeding pedagogy (CASEL, ky nang con, mau cau hoi; publish=${publish})...`);

  const specialist = await ensureSpecialist(prisma);
  const skills = await prisma.eqSkill.findMany();
  if (skills.length === 0) {
    throw new Error('eq_skills rong — seedEqSkills phai chay truoc seedPedagogy.');
  }
  const skillIdByCode = Object.fromEntries(skills.map((s) => [s.caselCode, s.id]));

  // 1. 40 muc CASEL
  const refIdByCode = {};
  for (const ref of CASEL_REFERENCES) {
    const skillId = skillIdByCode[ref.skill];
    const data = { skillId, textEn: ref.textEn, displayOrder: ref.order };
    const row = await prisma.caselReference.upsert({
      where: { code: ref.code },
      update: data,
      create: { code: ref.code, ...data },
    });
    refIdByCode[ref.code] = row.id;
  }

  // 2. Ky nang con + mau
  const counts = { subSkills: 0, templates: 0 };
  for (const sub of SUB_SKILLS) {
    let subRow = await prisma.eqSubSkill.findUnique({ where: { code: sub.code } });
    if (!subRow) {
      subRow = await prisma.eqSubSkill.create({
        data: {
          code: sub.code,
          skillId: skillIdByCode[sub.skill],
          caselReferenceId: refIdByCode[sub.caselCode],
          nameVi: sub.nameVi,
          descriptionVi: sub.descriptionVi,
          ageMin: sub.ageMin,
          ageMax: sub.ageMax,
          displayOrder: sub.order,
          createdBy: specialist.id,
        },
      });
      counts.subSkills += 1;
    }

    for (const t of sub.templates) {
      const exists = await prisma.questionTemplate.findFirst({
        where: { subSkillId: subRow.id, title: t.title },
        select: { id: true },
      });
      if (exists) continue;

      const content = Object.fromEntries(VERSION_FIELDS.map((f) => [f, t[f] ?? null]));
      content.needsTarget = Boolean(t.needsTarget);
      content.allowedEmotions = t.allowedEmotions ?? [];
      content.parentPrompts = t.parentPrompts ?? [];
      const now = new Date();
      await prisma.questionTemplate.create({
        data: {
          subSkillId: subRow.id,
          title: t.title,
          answerFormat: t.answerFormat,
          createdBy: specialist.id,
          versions: {
            create: {
              version: 1,
              ...content,
              status: publish ? 'published' : 'draft',
              createdBy: specialist.id,
              publishedBy: publish ? specialist.id : null,
              publishedAt: publish ? now : null,
            },
          },
        },
      });
      counts.templates += 1;
    }
  }

  console.log(
    `✅ pedagogy done: ${CASEL_REFERENCES.length} muc CASEL, ` +
      `+${counts.subSkills}/${SUB_SKILLS.length} ky nang con moi, +${counts.templates} mau moi.`,
  );
  return counts;
}
