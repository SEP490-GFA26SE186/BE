// Doc DB cho truyen "Ke chuyen nha minh" (spec family-story §5.2, §6.1): danh muc ky nang con
// dung duoc, tuoi va muc ky nang con cua be gan voi nhan vat chinh. Dung chung analyze + POST /stories.
import { ageOf } from '../children/lib/childFormat.js';
import { levelFor } from '../children/lib/eqLevels.js';
import { loadReportSettings } from '../pedagogy-settings/pedagogy-settings.service.js';
import { ageRangeOf, buildUsableCatalog } from './lib/familySkills.js';

/** Ky nang con + mau dang bat + ban published moi nhat cua tung mau (giong TOPIC_SLOT_SELECT). */
export const SUB_SKILL_CATALOG_SELECT = {
  id: true,
  code: true,
  nameVi: true,
  descriptionVi: true,
  ageMin: true,
  ageMax: true,
  isActive: true,
  displayOrder: true,
  skill: { select: { id: true, caselCode: true, nameVi: true, displayOrder: true } },
  templates: {
    where: { isActive: true },
    select: {
      id: true,
      answerFormat: true,
      versions: { where: { status: 'published' }, orderBy: { version: 'desc' }, take: 1 },
    },
  },
};

const byCatalogOrder = (a, b) =>
  (a.skill?.displayOrder ?? 0) - (b.skill?.displayOrder ?? 0) || a.displayOrder - b.displayOrder || a.id.localeCompare(b.id);

/**
 * Be gan voi nhan vat chinh (con cua chinh phu huynh, chua xoa) hoac null.
 * `storyCharacters`: ket qua resolveStoryCharacters ({ isMain, childId }).
 */
export async function loadMainChild(db, parentId, storyCharacters) {
  const childId = storyCharacters.find((c) => c.isMain)?.childId;
  if (!childId) return null;
  return db.childProfile.findFirst({
    where: { id: childId, parentId, deletedAt: null },
    select: { id: true, birthDate: true },
  });
}

/** Danh muc dung duoc (spec §5.2), sap theo nang luc roi thu tu ky nang con. */
export async function loadUsableCatalog(db, { hasSecondary, child }) {
  const rows = await db.eqSubSkill.findMany({ where: { isActive: true }, select: SUB_SKILL_CATALOG_SELECT });
  const ageRange = ageRangeOf(child ? ageOf(child.birthDate) : null);
  return { catalog: buildUsableCatalog(rows.sort(byCatalogOrder), { hasSecondary, ageRange }), ageRange };
}

/**
 * Ky nang con theo `ids` (giu thu tu ids) kem phien ban dung duoc; ky nang con da tat -> versions rong.
 * Dung khi tao truyen family tu ky nang da xac nhan.
 */
export async function loadConfirmedSubSkills(db, ids, { hasSecondary }) {
  const rows = await db.eqSubSkill.findMany({ where: { id: { in: ids } }, select: SUB_SKILL_CATALOG_SELECT });
  const usable = new Map(buildUsableCatalog(rows, { hasSecondary, ageRange: { ageMin: 0, ageMax: 1000 } }).map((s) => [s.id, s]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .filter((id) => byId.has(id))
    .map((id) => usable.get(id) ?? { ...byId.get(id), versions: [] });
}

/**
 * Muc cua be tren tung ky nang con trong `subSkillIds` (luot doc dau, co diem, checkpoint khong bi
 * loai — cung nguon voi bao cao EQ). Map subSkillId -> level | null.
 */
export async function loadChildSubSkillLevels(db, childId, subSkillIds) {
  const [settings, rows] = await Promise.all([
    loadReportSettings(db),
    db.checkpointAnswer.findMany({
      where: {
        session: { childId, isFirstPlay: true },
        score: { not: null },
        subSkillId: { in: subSkillIds },
        checkpoint: { excluded: false },
      },
      orderBy: [{ answeredAt: 'desc' }, { id: 'desc' }],
      take: 2000,
      select: { subSkillId: true, score: true },
    }),
  ]);
  const scores = new Map();
  for (const r of rows) {
    if (!scores.has(r.subSkillId)) scores.set(r.subSkillId, []);
    scores.get(r.subSkillId).push(Number(r.score));
  }
  return new Map(subSkillIds.map((id) => [id, levelFor(scores.get(id) ?? [], settings)]));
}
