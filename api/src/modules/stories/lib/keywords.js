// Tu khoa bi chan (blocked_keywords, Specialist quan ly) cho chu KHONG do AI viet: truyen tu viet va
// chu phu huynh sua sau khi AI viet (nguoi dung chot 2026-10-18: `block` chan han, `warn` canh bao).
// Khop GIONG HET validator ai/ (app/core/text_utils.py contains_phrase): nguyen tieng (chu / so khong
// dinh lien), khong phan biet hoa thuong, giu dau, NFC hai phia. Ham thuan.

const nfc = (s) => String(s ?? '').normalize('NFC');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);

export function containsPhrase(text, phrase) {
  const needle = nfc(phrase).trim();
  if (!text || !needle) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(needle)}(?![\\p{L}\\p{N}])`, 'iu').test(nfc(text));
}

/** Moi doan chu cua truyen kem duong dan (dung dang editor Web to do: pages.<id> / checkpoints.<id>). */
export function storyTextTargets(story) {
  const out = [];
  for (const p of story.pages ?? []) out.push({ path: `pages.${p.id}`, text: p.contentText });
  for (const c of story.checkpoints ?? []) {
    const parts = [c.question, c.hint, ...(c.options ?? []).flatMap((o) => [o.text, o.feedback])];
    out.push({ path: `checkpoints.${c.id}`, text: parts.filter(Boolean).join('\n') });
  }
  return out.filter((t) => t.text);
}

/**
 * @param {{ path: string, text: string }[]} targets
 * @param {{ keyword: string, severity: 'block' | 'warn' }[]} keywords tu khoa dang dung
 * @returns {{ path: string, keyword: string, severity: string }[]} moi (doan, tu khoa) mot lan
 */
export function keywordIssues(targets, keywords) {
  const out = [];
  for (const { path, text } of targets) {
    for (const { keyword, severity } of keywords) {
      if (containsPhrase(text, keyword)) out.push({ path, keyword, severity });
    }
  }
  return out;
}

/** Loi 422 cho cac tu `block` — message tieng Viet, dung `path` de Web to dung o. */
export const blockedErrors = (issues) =>
  issues
    .filter((i) => i.severity === 'block')
    .map((i) => ({ path: i.path, message: `Có từ không phù hợp cho bé: “${i.keyword}”. Hãy diễn đạt khác.` }));
