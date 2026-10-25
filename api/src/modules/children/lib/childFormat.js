// Ham thuan cho module children (rev8): dinh dang ho so be, thoi gian dung may. Khong DB.
// Bao cao EQ theo muc do: lib/eqLevels.js, lib/eqJourney.js, lib/recommend.js.
// Hinh dang tra ve khop src/services/childService.js ben Web (mock da viet theo rev8).

import { assetUrl } from '../../../clients/assetUrl.js';
import { portraitFailureOf } from '../../characters/lib/portraitFailure.js';

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
  return {
    id, name, appearance, portraitImageKey, portraitImageUrl: assetUrl(portraitImageKey), portraitStatus,
    portraitFailure: portraitFailureOf(character),
  };
}

/** child_profiles + include { character, _count: { bookshelfItems, playSessions(completed) } } -> ho so cho client. */
export function formatChild(child, now = new Date()) {
  return {
    id: child.id,
    name: child.name,
    birthDate: child.birthDate ? new Date(child.birthDate).toISOString().slice(0, 10) : null,
    age: ageOf(child.birthDate, now),
    preferredVoice: child.preferredVoice,
    character: formatCharacter(child.character),
    booksCount: child._count?.bookshelfItems ?? 0,
    completedSessionsCount: child._count?.playSessions ?? 0,
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
  };
}


/** Mot luot doc tinh toi da 60 phut (be bo do tablet van mo -> last_activity_at troi xa). */
export const SESSION_CAP_SECONDS = 60 * 60;

/**
 * Thoi gian doc trong ngay tu play_sessions (luot bat dau trong ngay theo gio VN).
 * sessions: [{ startedAt, lastActivityAt, completedAt, status }]. Rev8 bo gioi han phut / gio ngu (2026-10-18).
 */
export function summarizeReading(child, sessions, date) {
  let usedSeconds = 0;
  for (const s of sessions) {
    const end = s.completedAt ?? s.lastActivityAt;
    const seconds = Math.max(0, Math.round((new Date(end) - new Date(s.startedAt)) / 1000));
    usedSeconds += Math.min(seconds, SESSION_CAP_SECONDS);
  }
  return {
    childId: child.id,
    date,
    usedMinutes: Math.round(usedSeconds / 60),
    usedSeconds,
    sessionsCount: sessions.length,
    completedCount: sessions.filter((s) => s.status === 'completed').length,
  };
}
