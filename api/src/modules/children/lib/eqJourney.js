// Bao cao EQ chi tiet cua mot be (luong 5.5-5.6). Ham thuan tren cau tra loi luot doc DAU (cung nguon voi
// eq_competency_stats — luot doc lai khong cong diem). Diem 0..1 (checkpoint_answers.score), hien thi 0..100.

import { EQ_MIN_ITEMS } from './childFormat.js';

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;
const pct = (sum, n) => (n ? Math.round((sum / n) * 100) : null);

/** Thu Hai dau tuan (gio VN) cua `date`, dang 'YYYY-MM-DD'. */
export function vnWeekStart(date) {
  const vn = new Date(new Date(date).getTime() + VN_OFFSET_MS);
  const dow = (vn.getUTCDay() + 6) % 7; // 0 = thu Hai
  return new Date(vn.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

const EMOTIONS = ['happy', 'sad', 'angry', 'scared', 'neutral'];

/**
 * rows: [{ answeredAt, score (0..1 | null), skipped, attempts, caselCode | null, type, answerEmotion?, firstEmotion? }]
 * — chi luot doc dau. Tra { trend, byType, emotions }.
 * - trend: `weeks` tuan gan nhat (cu -> moi), moi nang luc { items, score }; tuan it hon EQ_MIN_ITEMS cau
 *   van tra diem (xu huong), nhung FE ghi "it du lieu".
 * - byType.firstTryRate: % cau duoc cham dat diem toi da ngay lan chon dau (cam xuc / goc nhin chon dung,
 *   giai quyet tinh huong chon cach xay dung).
 * - emotions: diem dung nhan dien cam xuc (emotion_self / emotion_other), theo cam xuc dung: so lan gap,
 *   so lan be nhan dung ngay lan dau (y tuong tu origin/main).
 */
export function buildEqJourney(rows, { weeks = 8, now = new Date() } = {}) {
  const thisWeek = vnWeekStart(now);
  const weekKeys = Array.from({ length: weeks }, (_, i) =>
    new Date(Date.parse(`${thisWeek}T00:00:00Z`) - (weeks - 1 - i) * 7 * DAY_MS).toISOString().slice(0, 10),
  );
  const acc = new Map(weekKeys.map((w) => [w, new Map()]));
  const types = new Map();
  const emotionAcc = new Map();

  for (const r of rows) {
    const t = types.get(r.type) ?? { type: r.type, answered: 0, skipped: 0, scored: 0, scoreSum: 0, firstTry: 0 };
    t.answered += 1;
    if (r.skipped) t.skipped += 1;
    if (r.score != null) {
      t.scored += 1;
      t.scoreSum += Number(r.score);
      if (Number(r.score) === 1) t.firstTry += 1;
    }
    types.set(r.type, t);

    if (r.answerEmotion && !r.skipped) {
      const e = emotionAcc.get(r.answerEmotion) ?? { emotion: r.answerEmotion, count: 0, correctFirstTry: 0 };
      e.count += 1;
      if (r.firstEmotion === r.answerEmotion) e.correctFirstTry += 1;
      emotionAcc.set(r.answerEmotion, e);
    }

    const week = acc.get(vnWeekStart(r.answeredAt));
    if (!week || r.score == null || !r.caselCode) continue;
    const s = week.get(r.caselCode) ?? { items: 0, sum: 0 };
    s.items += 1;
    s.sum += Number(r.score);
    week.set(r.caselCode, s);
  }

  return {
    trend: weekKeys.map((weekStart) => ({
      weekStart,
      skills: Object.fromEntries([...acc.get(weekStart)].map(([code, s]) => [code, { items: s.items, score: pct(s.sum, s.items) }])),
    })),
    byType: [...types.values()].map((t) => ({
      type: t.type,
      answered: t.answered,
      skipped: t.skipped,
      avgScore: pct(t.scoreSum, t.scored),
      firstTryRate: t.scored ? Math.round((t.firstTry / t.scored) * 100) : null,
    })),
    emotions: EMOTIONS.filter((e) => emotionAcc.has(e)).map((e) => emotionAcc.get(e)),
  };
}

/** Nang luc manh nhat / can ho tro them (chi xet nang luc da du EQ_MIN_ITEMS cau). */
export function strengths(skills) {
  const ranked = skills.filter((s) => s.items >= EQ_MIN_ITEMS && s.score != null).sort((a, b) => b.score - a.score);
  if (ranked.length < 2) return { strongest: ranked[0]?.caselCode ?? null, focus: null };
  return { strongest: ranked[0].caselCode, focus: ranked[ranked.length - 1].caselCode };
}
