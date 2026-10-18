// Kid Mode: noi dung truyen cho be + cham diem diem dung (DBML rev8: checkpoint_answers). Ham thuan.
//
// Luat (DBML checkpoint_answers, docs/01):
// - emotion_self -> Tu nhan thuc; emotion_other, perspective -> Nhan thuc xa hoi;
//   problem_solving -> nang luc cua bai hoc (constructive 1, avoidant 0.5, impulsive 0); reflection khong cham.
// - Chi LAN CHON DAU duoc cham (diem dong bang luc tra loi); chi lan choi dau cua be voi truyen
//   (is_first_play) moi cong vao eq_competency_stats.
// - emotion_* / perspective: chon sai lan dau -> goi y, chon lai mot lan, roi bao dap an.
//   problem_solving: chon mot lan, nghe phan hoi (khong co "sai"). reflection: tra loi tu do.
// Dap an KHONG bao gio nam trong noi dung gui xuong may be (be khong "mo" duoc dap an).

import { assetUrl } from '../../../clients/assetUrl.js';
import { detokenize } from '../../stories/lib/narration.js';

export const EMOTIONS = ['happy', 'sad', 'angry', 'scared', 'neutral'];
const ROLE_SCORE = { constructive: 1, avoidant: 0.5, impulsive: 0 };
const RETRYABLE = new Set(['emotion_self', 'emotion_other', 'perspective']);
const byKey = (key) => (a, b) => a[key] - b[key];

/** caselCode cua nang luc duoc cham cho kieu diem dung; null = khong cham. */
export function skillCodeFor(type, topicCaselCode) {
  if (type === 'emotion_self') return 'self_awareness';
  if (type === 'emotion_other' || type === 'perspective') return 'social_awareness';
  if (type === 'problem_solving') return topicCaselCode;
  return null;
}

/** Lua chon cua be cho diem dung co dung kieu khong (emotion hay optionId). Sai -> null. */
export function readChoice(checkpoint, { emotion, optionId }) {
  if (checkpoint.type === 'emotion_self' || checkpoint.type === 'emotion_other') {
    return EMOTIONS.includes(emotion) ? { emotion } : null;
  }
  if (checkpoint.type === 'perspective' || checkpoint.type === 'problem_solving') {
    const option = checkpoint.options.find((o) => o.id === optionId);
    return option ? { optionId: option.id, option } : null;
  }
  return {}; // reflection: khong co lua chon de kiem
}

/** Dung / sai cua mot lua chon. problem_solving va reflection luon "dung" (khong co chon lai). */
export function isCorrect(checkpoint, choice) {
  if (checkpoint.type === 'emotion_self' || checkpoint.type === 'emotion_other') {
    return choice.emotion === checkpoint.answerEmotion;
  }
  if (checkpoint.type === 'perspective') return choice.option.isCorrect === true;
  return true;
}

/** Diem lan chon dau (0 / 0.5 / 1), null voi reflection. */
export function firstScore(checkpoint, choice) {
  if (checkpoint.type === 'reflection') return null;
  if (checkpoint.type === 'problem_solving') return ROLE_SCORE[choice.option.role] ?? 0;
  return isCorrect(checkpoint, choice) ? 1 : 0;
}

/**
 * Trang thai mot cau tra loi da luu -> ket qua cho FE (dung lai khi be tra loi lai / tiep tuc).
 * `row`: checkpoint_answers; `checkpoint` co options + answerEmotion; `names`: storyCharacters.
 */
export function answerOutcome(checkpoint, row, storyCharacters, { useTts }) {
  const real = (s) => (s == null ? null : detokenize(s, storyCharacters));
  const audio = (key) => (useTts ? assetUrl(key) : null);
  const firstChoice = row.firstEmotion ? { emotion: row.firstEmotion } : row.firstOptionId
    ? { optionId: row.firstOptionId, option: checkpoint.options.find((o) => o.id === row.firstOptionId) }
    : {};
  const firstRight = row.skipped || isCorrect(checkpoint, firstChoice);
  const awaitingRetry = RETRYABLE.has(checkpoint.type) && !row.skipped && !firstRight && row.attempts === 1;
  const finalChoice = row.finalEmotion ? { emotion: row.finalEmotion }
    : row.finalOptionId ? { optionId: row.finalOptionId, option: checkpoint.options.find((o) => o.id === row.finalOptionId) }
      : null;

  const out = {
    checkpointId: checkpoint.id,
    attempts: row.attempts,
    skipped: row.skipped,
    done: !awaitingRetry,
    // null = khong co dung / sai: bo qua, hoac lien he ban than (khong cham).
    correct: row.skipped || checkpoint.type === 'reflection' ? null : finalChoice ? isCorrect(checkpoint, finalChoice) : firstRight,
  };
  if (awaitingRetry) {
    out.hint = real(checkpoint.hint);
    out.hintAudioUrl = audio(checkpoint.hintAudioKey);
  }
  // Xong ma chua chon dung (sai ca hai lan): noi dap an de be biet.
  if (out.done && RETRYABLE.has(checkpoint.type) && !row.skipped && out.correct === false) {
    if (checkpoint.answerEmotion) out.answer = { emotion: checkpoint.answerEmotion };
    const right = checkpoint.options.find((o) => o.isCorrect);
    if (right) out.answer = { optionId: right.id };
  }
  if (checkpoint.type === 'problem_solving' && firstChoice.option) {
    out.feedback = real(firstChoice.option.feedback);
    out.feedbackAudioUrl = audio(firstChoice.option.feedbackAudioKey);
  }
  return out;
}

/**
 * Noi dung truyen cho be: chu da thay ten that, link audio (chi khi use_tts), diem dung KHONG kem
 * dap an / vai / phan hoi. `answered`: Map checkpointId -> outcome (tiep tuc luot doc dang do).
 */
export function kidStoryContent(story, answered = new Map()) {
  const real = (s) => (s == null ? null : detokenize(s, story.storyCharacters));
  const audio = (key) => (story.useTts ? assetUrl(key) : null);
  const pages = [...story.pages].sort(byKey('pageOrder'));
  return {
    id: story.id,
    title: story.title,
    useTts: story.useTts,
    topic: story.topic ? { title: story.topic.title, competency: story.topic.skill?.caselCode ?? null } : null,
    pages: pages.map((p) => ({
      id: p.id,
      pageOrder: p.pageOrder,
      text: real(p.contentText),
      audioUrl: audio(p.audioKey),
      imageUrl: null, // luong sinh anh da bo (2026-10-17): FE dung anh giu cho
    })),
    checkpoints: story.checkpoints
      .map((c) => ({
        id: c.id,
        afterPageId: c.afterPageId,
        afterPageOrder: pages.find((p) => p.id === c.afterPageId)?.pageOrder ?? null,
        type: c.type,
        question: real(c.question),
        questionAudioUrl: audio(c.questionAudioKey),
        options:
          c.type === 'perspective' || c.type === 'problem_solving'
            ? [...c.options].sort(byKey('optionOrder')).map((o) => ({ id: o.id, text: real(o.text), textAudioUrl: audio(o.textAudioKey) }))
            : [],
        result: answered.get(c.id) ?? null,
      }))
      .sort(byKey('afterPageOrder')),
  };
}
