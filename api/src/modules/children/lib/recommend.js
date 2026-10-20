// Goi y topic tiep theo cho phu huynh (spec su pham CASEL §7). Ham thuan, khong DB.
// Chi topic dang bat, hop tuoi be; uu tien:
//   (1) nang luc cua topic chua co du lieu,
//   (2) topic co ky nang con dang lam quen hoac chua du du lieu,
//   (3) ky nang con dang phat trien, (4) con lai;
// bo topic cua cac truyen vua doc; hoa thi theo displayOrder.

const NO_DATA = 1;
const EMERGING = 2;
const DEVELOPING = 3;
const REST = 4;

function rankOf(topic, competencyByCode, subLevelById) {
  const competency = competencyByCode.get(topic.skill?.caselCode);
  if (!competency || competency.level == null) return NO_DATA;
  const levels = (topic.subSkills ?? []).map((s) => subLevelById.get(s.id) ?? null);
  if (levels.some((l) => l === 'emerging' || l === null)) return EMERGING;
  if (levels.includes('developing')) return DEVELOPING;
  return REST;
}

/**
 * levels: ket qua buildEqLevels; topics: [{ id, title, isActive, ageMin, ageMax, displayOrder,
 * skill: { caselCode, nameVi }, subSkills: [{ id, nameVi }] }]; childAge null -> khong loc tuoi.
 */
export function recommendTopics({ levels, topics, childAge, recentTopicIds = [], limit = 3 }) {
  const competencyByCode = new Map(levels.competencies.map((c) => [c.caselCode, c]));
  const subLevelById = new Map(levels.competencies.flatMap((c) => c.subSkills.map((s) => [s.id, s.level])));
  const recent = new Set(recentTopicIds);
  return topics
    .filter((t) => t.isActive && !recent.has(t.id))
    .filter((t) => childAge == null || (t.ageMin <= childAge && childAge <= t.ageMax))
    .map((t, i) => ({ t, i, rank: rankOf(t, competencyByCode, subLevelById) }))
    .sort((a, b) => a.rank - b.rank || (a.t.displayOrder ?? 0) - (b.t.displayOrder ?? 0) || a.i - b.i)
    .slice(0, limit)
    .map(({ t }) => ({
      id: t.id,
      title: t.title,
      skill: { caselCode: t.skill.caselCode, nameVi: t.skill.nameVi },
      subSkills: (t.subSkills ?? []).map((s) => ({ id: s.id, nameVi: s.nameVi })),
    }));
}
