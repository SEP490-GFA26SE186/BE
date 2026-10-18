// Giong doc ke truyen (spec ai/docs/superpowers/specs/2026-10-17-tts-narration-design.md §5).
// Ham thuan, khong DB: liet ke doan doc, van tay, ke hoach tao job, tien do, "san sang cho tre".
//
// Moi doan doc co mot dong narration_clips (story_id, segment) ghi van tay cua chu DA GUI DOC
// (chu sau khi thay ten that + giong). Doan "co audio" chi khi clip ready VA van tay khop chu
// hien tai — sua chu / doi ten nhan vat / doi giong deu lam lech van tay.

import crypto from 'node:crypto';

/** segment -> cot luu key (cot co san trong DBML rev8) de FE / Kid Mode doc truc tiep. */
export const SEGMENT_TARGETS = {
  page: { model: 'storyPage', column: 'audioKey' },
  question: { model: 'storyCheckpoint', column: 'questionAudioKey' },
  hint: { model: 'storyCheckpoint', column: 'hintAudioKey' },
  option_text: { model: 'checkpointOption', column: 'textAudioKey' },
  option_feedback: { model: 'checkpointOption', column: 'feedbackAudioKey' },
};

const nfc = (s) => String(s).normalize('NFC');
const byKey = (key) => (a, b) => a[key] - b[key];

/** {NVn} -> ten nhan vat (ten that chi thay o backend, khi hien thi va khi gui TTS — docs/01). */
export function detokenize(text, storyCharacters = []) {
  const names = new Map(
    storyCharacters.map((sc) => [sc.token, sc.character?.name ?? sc.aliasName ?? sc.name ?? null]),
  );
  return nfc(text).replace(/\{NV\d+\}/g, (token) => names.get(token) ?? token);
}

/** sha256(giong + chu) — chu da thay ten that, chuan NFC, bo khoang trang dau cuoi. */
export const fingerprintOf = (text, voice) =>
  crypto.createHash('sha256').update(`${voice}\n${nfc(text).trim()}`).digest('hex');

const hasText = (s) => typeof s === 'string' && s.trim().length > 0;

/**
 * Moi doan doc duoc cua truyen, theo thu tu doc (trang roi diem dung sau no).
 * story: { pages[{id, pageOrder, contentText}], checkpoints[{id, afterPageId, question, hint,
 * options[{id, optionOrder, text, feedback}]}], storyCharacters }.
 * @returns {{ segment: string, kind: string, targetId: string, text: string }[]}
 */
export function narrationSegments(story) {
  const cpAfter = new Map((story.checkpoints ?? []).map((c) => [c.afterPageId, c]));
  const out = [];
  const add = (kind, targetId, raw, suffix = '') => {
    if (!hasText(raw)) return;
    const prefix = kind === 'page' ? 'page' : kind.startsWith('option') ? 'option' : 'checkpoint';
    out.push({
      segment: `${prefix}:${targetId}${suffix}`,
      kind,
      targetId,
      text: detokenize(raw, story.storyCharacters).trim(),
    });
  };

  for (const page of [...(story.pages ?? [])].sort(byKey('pageOrder'))) {
    add('page', page.id, page.contentText);
    const cp = cpAfter.get(page.id);
    if (!cp) continue;
    add('question', cp.id, cp.question, ':question');
    add('hint', cp.id, cp.hint, ':hint');
    for (const option of [...(cp.options ?? [])].sort(byKey('optionOrder'))) {
      add('option_text', option.id, option.text, ':text');
      add('option_feedback', option.id, option.feedback, ':feedback');
    }
  }
  return out;
}

const clipMatches = (clip, fingerprint) => clip?.fingerprint === fingerprint;

/**
 * Ke hoach khi phu huynh hoan tat / bam thu lai (§5.2, §5.4).
 * - toQueue: doan chua co clip, clip lech van tay, hoac clip loi (thu lai).
 * - Clip khop van tay va dang ready / queued / generating: giu nguyen (khong sinh trung).
 * - staleClipIds: clip cua doan khong con ton tai (trang / phuong an da xoa).
 * @param {ReturnType<typeof narrationSegments>} segments
 * @param {{ id, segment, fingerprint, status }[]} clips
 */
export function planNarration(segments, clips, voice) {
  const bySegment = new Map(clips.map((c) => [c.segment, c]));
  const toQueue = [];
  for (const seg of segments) {
    const fingerprint = fingerprintOf(seg.text, voice);
    const clip = bySegment.get(seg.segment);
    if (clipMatches(clip, fingerprint) && clip.status !== 'failed') continue;
    toQueue.push({ ...seg, fingerprint, clipId: clip?.id ?? null });
  }
  const live = new Set(segments.map((s) => s.segment));
  return { toQueue, staleClipIds: clips.filter((c) => !live.has(c.segment)).map((c) => c.id) };
}

/**
 * Tien do giong doc cho chi tiet truyen (§5.4). Doan clip lech van tay tinh la "missing" (chua
 * duoc dua di doc lai), khong tinh la ready.
 */
export function narrationProgress(story, clips, voice) {
  if (!story.useTts) return { enabled: false, total: 0, ready: 0, pending: 0, failed: 0, missing: 0, complete: true };
  const segments = narrationSegments(story);
  const bySegment = new Map(clips.map((c) => [c.segment, c]));
  const counts = { ready: 0, pending: 0, failed: 0, missing: 0 };
  for (const seg of segments) {
    const clip = bySegment.get(seg.segment);
    if (!clipMatches(clip, fingerprintOf(seg.text, voice))) counts.missing += 1;
    else if (clip.status === 'ready') counts.ready += 1;
    else if (clip.status === 'failed') counts.failed += 1;
    else counts.pending += 1;
  }
  return { enabled: true, total: segments.length, ...counts, complete: counts.ready === segments.length };
}

/**
 * "San sang cho tre" (§5.5): reviewed_at co gia tri VA (use_tts = false HOAC du audio khop chu).
 * Ham kiem dung chung; cong chan o bookshelf / reading-sessions / orders gan sau (viec rieng).
 * @returns {{ ready: boolean, reason: 'not_reviewed' | 'narration_incomplete' | null, narration }}
 */
export function childReadiness(story, clips, voice) {
  const narration = narrationProgress(story, clips, voice);
  if (!story.reviewedAt) return { ready: false, reason: 'not_reviewed', narration };
  if (!narration.complete) return { ready: false, reason: 'narration_incomplete', narration };
  return { ready: true, reason: null, narration };
}

/**
 * jobId BullMQ = (clip, luot dua di doc). Chong trung khi hoan tat hai lan lien tiep da nam o
 * planNarration (clip khop van tay dang queued/generating thi bo qua, trong khoa ghi cua truyen);
 * `round` tang moi lan dua di doc lai, vi BullMQ giu job loi 7 ngay va se lang le bo qua mot job
 * trung id. Khong dung ':' — BullMQ cam trong id tu dat.
 */
export const narrationJobId = (clipId, round) => `narration_${clipId}_${round}`;
