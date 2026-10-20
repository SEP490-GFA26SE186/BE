// Muc do EQ theo ky nang con (spec su pham CASEL §7, §9b). Ham thuan, khong DB.
// Muc tinh tren `window` cau cham gan nhat cua ky nang con; chua du `minItems` cau -> null ("chua du du lieu").
// Muc nang luc = muc THAP NHAT trong cac ky nang con da co muc (khong cho ky nang tot che ky nang yeu).
// Khong tra % cho phu huynh: chi tra muc + so cau.

export const LEVEL_ORDER = ['emerging', 'developing', 'secure'];

/** scores: diem 0..1, MOI -> CU. */
export function levelFor(scores, { window, minItems, developingFrom, secureFrom }) {
  const recent = scores.slice(0, window);
  if (recent.length < minItems || recent.length === 0) return null;
  const avg = recent.reduce((s, x) => s + Number(x), 0) / recent.length;
  if (avg < developingFrom) return 'emerging';
  if (avg < secureFrom) return 'developing';
  return 'secure';
}

/** Muc thap nhat (bo qua null); khong co muc nao -> null. */
export function lowestLevel(levels) {
  const ranks = levels.filter(Boolean).map((l) => LEVEL_ORDER.indexOf(l));
  return ranks.length ? LEVEL_ORDER[Math.min(...ranks)] : null;
}

const byOrder = (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0);

/**
 * rows: cau tra loi luot doc dau, co score, checkpoint khong excluded, co subSkillId — MOI -> CU.
 * skills: eq_skills; subSkills: eq_sub_skills (+ caselReference.textEn) can hien.
 * Dong cua ky nang con khong co trong `subSkills` bi bo qua.
 */
export function buildEqLevels(rows, skills, subSkills, settings) {
  const scoresBySub = new Map();
  for (const r of rows) {
    if (r.score == null || !r.subSkillId) continue;
    if (!scoresBySub.has(r.subSkillId)) scoresBySub.set(r.subSkillId, []);
    scoresBySub.get(r.subSkillId).push(Number(r.score));
  }
  const competencies = [...skills].sort(byOrder).map((skill) => {
    const subs = subSkills
      .filter((s) => s.skillId === skill.id)
      .sort(byOrder)
      .map((s) => {
        const scores = scoresBySub.get(s.id) ?? [];
        return {
          id: s.id,
          nameVi: s.nameVi,
          caselTextEn: s.caselReference?.textEn ?? null,
          level: levelFor(scores, settings),
          items: Math.min(scores.length, settings.window),
        };
      });
    return { caselCode: skill.caselCode, nameVi: skill.nameVi, level: lowestLevel(subs.map((s) => s.level)), subSkills: subs };
  });
  return { competencies };
}
