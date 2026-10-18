const filled = (v) => typeof v === 'string' && v.trim() !== '';

function requiredText(cp, { needHint }) {
  const missing = [];
  if (!filled(cp.question)) missing.push('question');
  if (needHint && !filled(cp.hint)) missing.push('hint');
  return missing;
}

/**
 * Danh sach truong con thieu cua diem dung theo kieu (bang "Cac kieu diem dung", ai/docs/03).
 * cp: { type, question, hint, options?: [{ text, role, isCorrect, feedback }] }
 */
export function missingCheckpointFields(cp) {
  const options = Array.isArray(cp.options) ? cp.options : [];

  switch (cp.type) {
    case 'emotion_self':
    case 'emotion_other':
      return requiredText(cp, { needHint: true });

    case 'reflection':
      return requiredText(cp, { needHint: false });

    case 'perspective': {
      const missing = requiredText(cp, { needHint: true });
      if (options.length !== 3 || !options.every((o) => filled(o.text))) missing.push('options');
      else if (options.filter((o) => o.isCorrect === true).length !== 1) missing.push('options.isCorrect');
      return missing;
    }

    case 'problem_solving': {
      const missing = requiredText(cp, { needHint: false });
      const good =
        options.length === 3 &&
        options.every((o) => filled(o.text) && filled(o.feedback)) &&
        new Set(options.map((o) => o.role).filter(Boolean)).size === 3;
      if (!good) missing.push('options');
      return missing;
    }

    default:
      return ['type'];
  }
}

export const isCheckpointComplete = (cp) => missingCheckpointFields(cp).length === 0;

/** Moi trang co chu -> 'ready'; con trang trong (hoac khong co trang) -> 'draft'. */
export function storyStatusFromPages(pages) {
  return pages.length > 0 && pages.every((p) => filled(p.contentText)) ? 'ready' : 'draft';
}
