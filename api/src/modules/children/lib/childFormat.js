// Ham thuan cho module children (rev8): dinh dang ho so be, thoi gian dung may, diem EQ. Khong DB.
// Hinh dang tra ve khop src/services/childService.js ben Web (mock da viet theo rev8).

import { assetUrl } from '../../../clients/assetUrl.js';

/** Duoi so cau duoc cham nay thi chua du du lieu de cham diem mot nang luc. */
export const EQ_MIN_ITEMS = 5;

const VN_TZ = 'Asia/Ho_Chi_Minh';

/** 'YYYY-MM-DD' theo gio Viet Nam — khop cot sinh usage_date = (started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date. */
export const vnDate = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: VN_TZ });

export function ageOf(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/** Nhan vat dai dien cua be (characters.child_id unique) — null neu chua co hoac da xoa mem. */
function formatCharacter(character) {
  if (!character || character.deletedAt) return null;
  const { id, name, appearance, portraitImageKey, portraitStatus } = character;
  return { id, name, appearance, portraitImageKey, portraitImageUrl: assetUrl(portraitImageKey), portraitStatus };
}

/** child_profiles + include { character, _count: { bookshelfItems, playSessions(completed) } } -> ho so cho client. */
export function formatChild(child, now = new Date()) {
  return {
    id: child.id,
    name: child.name,
    birthDate: child.birthDate ? new Date(child.birthDate).toISOString().slice(0, 10) : null,
    age: ageOf(child.birthDate, now),
    dailyScreenTimeMinutes: child.dailyScreenTimeMinutes,
    preferredVoice: child.preferredVoice,
    character: formatCharacter(child.character),
    booksCount: child._count?.bookshelfItems ?? 0,
    completedSessionsCount: child._count?.playSessions ?? 0,
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
  };
}

/** Tong hop cac phien child_usage_sessions cua mot ngay. `durationSeconds` null = phien chua ket thuc. */
export function summarizeUsage(child, sessions, date) {
  const usedSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
  const usedMinutes = Math.round(usedSeconds / 60);
  return {
    childId: child.id,
    date,
    dailyLimitMinutes: child.dailyScreenTimeMinutes,
    usedMinutes,
    usedSeconds,
    remainingMinutes: Math.max(0, child.dailyScreenTimeMinutes - usedMinutes),
    isLimitReached: usedMinutes >= child.dailyScreenTimeMinutes,
    sessionsCount: sessions.length,
  };
}

/**
 * 5 nang luc CASEL (eq_skills, theo display_order) ghep voi eq_competency_stats cua mot be.
 * score = round(score_sum / items * 100), null khi items < EQ_MIN_ITEMS.
 */
export function eqSkillsFromStats(skills, stats) {
  const bySkill = new Map(stats.map((s) => [s.skillId, s]));
  return [...skills]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map((skill) => {
      const stat = bySkill.get(skill.id);
      const items = stat?.items ?? 0;
      const scoreSum = Number(stat?.scoreSum ?? 0);
      return {
        skillId: skill.id,
        caselCode: skill.caselCode,
        nameVi: skill.nameVi,
        items,
        scoreSum,
        score: items >= EQ_MIN_ITEMS ? Math.round((scoreSum / items) * 100) : null,
      };
    });
}
