// =============================================================================
// Seed: du lieu su pham CASEL (spec 2026-10-20-casel-pedagogy §5)
//   eq_sub_skills (40 muc CASEL, source=casel), question_templates + question_template_versions.
//   Ky nang con CHINH LA muc CASEL (1 tang, nguoi dung chot 2026-10-21).
//
// Phai chay sau seedEqSkills (skill_id) va truoc seedTopics (topic_sub_skills tro vao eq_sub_skills).
//
// Idempotent, khong ghi de ban Specialist da sua:
//   - eq_sub_skills: 40 muc tu data/casel.js; 23 muc co ban soan o data/pedagogy.js (ma, ten, mo ta,
//     tuoi rieng, dang bat), 17 muc con lai tat (ten = textVi). Da co (theo ma) thi chi dat lai
//     casel_text_en (nguyen van khong sua qua API), khong dung vao ten/mo ta/tuoi/bat-tat.
//   - question_templates: chi tao (kem phien ban 1) khi ky nang con vua duoc tao o lan chay nay
//     hoac dang co 0 mau; ky nang con da co mau thi bo qua toan bo (khong dung vao mau/phien ban
//     Specialist da tao, doi ten, xoa hay ban hanh).
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

  // 1+2. 40 muc CASEL = 40 ky nang con source=casel; 23 muc co ban soan san (data/pedagogy.js) thi
  //      lay ten/mo ta/tuoi/ma cua ban do va bat; 17 muc con lai tat, ten = textVi.
  const subByCasel = new Map(SUB_SKILLS.map((s) => [s.caselCode, s]));
  const counts = { subSkills: 0, templates: 0 };
  for (const ref of CASEL_REFERENCES) {
    const sub = subByCasel.get(ref.code);
    const code = sub?.code ?? ref.code;
    // Tim dong casel da co: theo ma (migration 20261029 dat `<code>_casel` khi ma goc da bi ky nang con
    // chuyen gia chiem) hoac theo nguyen van tieng Anh (migration giu ma cu cua ky nang con da gan muc nay).
    const candidates = await prisma.eqSubSkill.findMany({
      where: { OR: [{ code: { in: [code, `${code}_casel`] } }, { source: 'casel', caselTextEn: ref.textEn }] },
      select: { id: true, code: true, source: true },
    });
    let subRow = candidates.find((r) => r.source === 'casel') ?? null;
    let createdNow = false;
    if (subRow) {
      // Chi (dat lai) nguyen van tieng Anh; ten/mo ta/tuoi/bat-tat la cua Specialist, khong ghi de.
      await prisma.eqSubSkill.update({ where: { id: subRow.id }, data: { caselTextEn: ref.textEn } });
    } else {
      subRow = await prisma.eqSubSkill.create({
        data: {
          code: candidates.some((r) => r.code === code) ? `${code}_casel` : code,
          skillId: skillIdByCode[ref.skill],
          source: 'casel',
          caselTextEn: ref.textEn,
          nameVi: sub?.nameVi ?? ref.textVi,
          descriptionVi: sub?.descriptionVi ?? ref.textVi,
          ageMin: sub?.ageMin ?? 5,
          ageMax: sub?.ageMax ?? 8,
          isActive: Boolean(sub),
          displayOrder: sub?.order ?? ref.order,
          createdBy: specialist.id,
        },
      });
      createdNow = true;
      counts.subSkills += 1;
    }
    if (!sub) continue;

    // Chi tao mau khi ky nang con vua tao o lan chay nay hoac dang chua co mau nao. Khong so theo
    // title (Specialist doi ten / xoa mau thi seed se tao trung hoac hoi sinh mau da xoa).
    if (!createdNow) {
      const existing = await prisma.questionTemplate.count({ where: { subSkillId: subRow.id } });
      if (existing > 0) continue;
    }

    for (const t of sub.templates) {
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
      `+${counts.subSkills} ky nang con moi (${SUB_SKILLS.length} muc bat san), +${counts.templates} mau moi.`,
  );
  return counts;
}
