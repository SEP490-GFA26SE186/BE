// Bao cao EQ chi tiet cua mot be (spec su pham CASEL §7, §9b). Ham thuan tren cau tra loi luot doc DAU.
// - trend: so cau cham moi tuan theo nang luc + muc nang luc cuoi tuan (khong %).
// - evidence: cau hoi / truyen / lua chon dau / can goi y, toi da 5 cau moi ky nang con.
// - conversation: goi y tro chuyen (parent_prompts cua mau) gan voi truyen be vua doc.
// Ten that chi hien cho phu huynh cua chinh be (detokenize), khong bao gio gui AI / log.

import { detokenize } from '../../stories/lib/narration.js';
import { buildEqLevels } from './eqLevels.js';

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

/** Thu Hai dau tuan (gio VN) cua `date`, dang 'YYYY-MM-DD'. */
export function vnWeekStart(date) {
  const vn = new Date(new Date(date).getTime() + VN_OFFSET_MS);
  const dow = (vn.getUTCDay() + 6) % 7; // 0 = thu Hai
  return new Date(vn.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

/**
 * rows: { subSkillId, score, answeredAt } MOI -> CU (cung nguon voi buildEqLevels).
 * Tra `weeks` tuan gan nhat (cu -> moi): { weekStart, competencies: { [caselCode]: { items, level } } };
 * items = so cau cham trong tuan, level = muc nang luc tinh tren moi cau den het tuan do.
 */
export function buildTrend(rows, skills, subSkills, settings, { weeks = 8, now = new Date() } = {}) {
  const skillOfSub = new Map(subSkills.map((s) => [s.id, s.skillId]));
  const codeOfSkill = new Map(skills.map((s) => [s.id, s.caselCode]));
  const thisWeek = vnWeekStart(now);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(Date.parse(`${thisWeek}T00:00:00Z`) - (weeks - 1 - i) * 7 * DAY_MS).toISOString().slice(0, 10);
    const from = Date.parse(`${weekStart}T00:00:00+07:00`);
    const to = from + 7 * DAY_MS;
    const upToEnd = rows.filter((r) => new Date(r.answeredAt).getTime() < to);
    const { competencies } = buildEqLevels(upToEnd, skills, subSkills, settings);
    const items = new Map();
    for (const r of upToEnd) {
      if (new Date(r.answeredAt).getTime() < from) continue;
      const code = codeOfSkill.get(skillOfSub.get(r.subSkillId));
      if (code) items.set(code, (items.get(code) ?? 0) + 1);
    }
    return {
      weekStart,
      competencies: Object.fromEntries(competencies.map((c) => [c.caselCode, { items: items.get(c.caselCode) ?? 0, level: c.level }])),
    };
  });
}

/** Nhan cam xuc tieng Viet (khop Web constants/story.js). */
export const EMOTION_LABELS = { happy: 'Vui', sad: 'Buồn', angry: 'Giận', scared: 'Sợ', neutral: 'Bình thường' };

/** Lua chon dau dat diem toi da cua phien ban mau: cam xuc / goc nhin chon dung; tinh huong chon cach xay dung. */
function correctFirstTry(a) {
  const { type, answerEmotion } = a.checkpoint;
  if (type === 'emotion_self' || type === 'emotion_other') return a.firstEmotion != null && a.firstEmotion === answerEmotion;
  if (type === 'perspective') return a.firstOption?.isCorrect === true;
  if (type === 'problem_solving') return a.firstOption?.role === 'constructive';
  return Number(a.score) === 1;
}

/**
 * answers: checkpoint_answers MOI -> CU (da loc nhu buildEqLevels) kem firstOption { text, role, isCorrect }
 * va checkpoint { type, question, answerEmotion, story: { title, entry, momentSummary, storyCharacters } }.
 */
export function buildEvidence(answers, { perSubSkill = 5 } = {}) {
  const count = new Map();
  const out = [];
  for (const a of answers) {
    const n = count.get(a.subSkillId) ?? 0;
    if (n >= perSubSkill) continue;
    count.set(a.subSkillId, n + 1);
    const names = a.checkpoint.story.storyCharacters;
    const real = (s) => (s == null ? null : detokenize(s, names));
    out.push({
      subSkillId: a.subSkillId,
      answeredAt: a.answeredAt,
      storyTitle: a.checkpoint.story.title,
      question: real(a.checkpoint.question),
      firstChoiceText: a.firstEmotion ? EMOTION_LABELS[a.firstEmotion] ?? a.firstEmotion : real(a.firstOption?.text ?? null),
      correctFirstTry: correctFirstTry(a),
      usedHint: a.attempts > 1,
      source: 'ai_template',
      // "Tu chuyen: ..." (spec family-story §3.3): chi truyen family co khoanh khac that, khong hien tinh tiet AI them.
      momentSummary: a.checkpoint.story.entry === 'family' ? real(a.checkpoint.story.momentSummary ?? null) : null,
    });
  }
  return out;
}

const MAX_PROMPTS = 3;
const hasText = (s) => typeof s === 'string' && s.trim().length > 0;

/**
 * stories: truyen be vua doc (moi -> cu): { id, title, length, storyCharacters, answeredReflection,
 * checkpoints: [{ type, question, subSkillId, pageOrder, templateVersion: { parentPrompts } | null }] }.
 * Truyen AI: parent_prompts cua cac phien ban mau (bo trung, toi da 3); truyen tu viet: cau hoi cua truyen.
 * Kem cau hoi reflection (neu co). Truyen khong co gi de goi y bi bo.
 */
export function buildConversation(stories) {
  const out = [];
  for (const s of stories) {
    const real = (t) => detokenize(t, s.storyCharacters);
    const cps = [...s.checkpoints].sort((a, b) => (a.pageOrder ?? 0) - (b.pageOrder ?? 0));
    const prompts = [];
    let subSkillId = null;
    const add = (text) => {
      if (hasText(text) && !prompts.includes(text) && prompts.length < MAX_PROMPTS) prompts.push(text);
    };
    for (const c of cps) {
      if (c.type === 'reflection') continue;
      if (s.length === 'custom') {
        if (hasText(c.question)) add(real(c.question));
        continue;
      }
      const before = prompts.length;
      for (const p of c.templateVersion?.parentPrompts ?? []) add(real(p));
      if (prompts.length > before && !subSkillId) subSkillId = c.subSkillId ?? null;
    }
    const reflection = cps.find((c) => c.type === 'reflection' && hasText(c.question));
    if (!prompts.length && !reflection) continue;
    out.push({
      storyId: s.id,
      storyTitle: s.title,
      subSkillId,
      prompts,
      ...(reflection && { reflection: { question: real(reflection.question), answered: Boolean(s.answeredReflection) } }),
    });
  }
  return out;
}
