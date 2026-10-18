// Doc / ghi narration_clips (spec TTS §5.2-5.4). `db` la prisma hoac transaction client.
// Khong tinh credit (nguoi dung chot 2026-10-17): khong dung ai_requests, khong giu / hoan credit.
import ApiError from '../../utils/ApiError.js';
import { SEGMENT_TARGETS, childReadiness, fingerprintOf, narrationSegments, planNarration } from './lib/narration.js';

export const VOICE_KEY = 'tts.voice';

/** Chu du de liet ke doan doc: trang, diem dung + phuong an, ten nhan vat. */
export const NARRATION_STORY_INCLUDE = {
  pages: { select: { id: true, pageOrder: true, contentText: true } },
  checkpoints: {
    select: {
      id: true,
      afterPageId: true,
      question: true,
      hint: true,
      options: { select: { id: true, optionOrder: true, text: true, feedback: true } },
    },
  },
  storyCharacters: { include: { character: { select: { name: true } } } },
};

/**
 * "San sang cho tre" cua mot truyen (spec TTS §5.5) — ham kiem dung chung cho cong chan o giá sach
 * va luc be bat dau doc. null = khong co truyen.
 * @returns {Promise<{ story, ready, reason, narration } | null>}
 */
export async function loadReadiness(db, storyId) {
  const story = await db.story.findFirst({
    where: { id: storyId, deletedAt: null },
    include: { ...NARRATION_STORY_INCLUDE, narrationClips: { select: { segment: true, fingerprint: true, status: true } } },
  });
  if (!story) return null;
  const row = await db.platformSetting.findUnique({ where: { key: VOICE_KEY }, select: { value: true } });
  const voice = typeof row?.value === 'string' ? row.value.trim() : '';
  return { story, ...childReadiness(story, story.narrationClips, voice) };
}

/** Cau bao tieng Viet khi truyen chua san sang (422) — FE hien nguyen van. */
export function notReadyMessage({ reason, narration }) {
  if (reason === 'not_reviewed') return 'Truyện chưa được ba mẹ bấm hoàn tất.';
  const left = narration.total - narration.ready;
  return narration.pending > 0
    ? `Giọng đọc đang được tạo (còn ${left}/${narration.total} đoạn). Vui lòng chờ ít phút.`
    : `Giọng đọc còn thiếu ${left}/${narration.total} đoạn. Hãy bấm hoàn tất lại hoặc thử lại giọng đọc.`;
}

/** Giong do Node quyet (§5.2), luon gui tuong minh cho ai/. Thieu / sai -> loi cau hinh 500. */
export async function loadVoice(db) {
  const row = await db.platformSetting.findUnique({ where: { key: VOICE_KEY }, select: { value: true } });
  if (typeof row?.value !== 'string' || !row.value.trim()) {
    throw ApiError.internal(`Thiếu cấu hình ${VOICE_KEY} trong platform_settings (chạy lại seed).`);
  }
  return row.value.trim();
}

/**
 * Dua cac doan thieu / lech / loi di doc (trong transaction cua nguoi goi, truyen da khoa ghi).
 * Clip cua doan da xoa bi xoa theo. Tra ve job can day vao queue SAU khi transaction commit.
 * @returns {Promise<{ clipId: string, round: number }[]>}
 */
export async function queueNarration(tx, storyId, voice) {
  const story = await tx.story.findUniqueOrThrow({ where: { id: storyId }, include: NARRATION_STORY_INCLUDE });
  const clips = await tx.narrationClip.findMany({
    where: { storyId },
    select: { id: true, segment: true, fingerprint: true, status: true, round: true },
  });
  const { toQueue, staleClipIds } = planNarration(narrationSegments(story), clips, voice);
  if (staleClipIds.length) await tx.narrationClip.deleteMany({ where: { id: { in: staleClipIds } } });

  const roundOf = new Map(clips.map((c) => [c.id, c.round]));
  const jobs = [];
  for (const seg of toQueue) {
    const reset = {
      fingerprint: seg.fingerprint,
      status: 'queued',
      attempts: 0,
      audioKey: null,
      durationSeconds: null,
      errorCode: null,
      errorMessage: null,
    };
    const clip = seg.clipId
      ? await tx.narrationClip.update({
          where: { id: seg.clipId },
          data: { ...reset, round: roundOf.get(seg.clipId) + 1 },
          select: { id: true, round: true },
        })
      : await tx.narrationClip.create({
          data: { storyId, segment: seg.segment, ...reset },
          select: { id: true, round: true },
        });
    jobs.push({ clipId: clip.id, round: clip.round });
  }
  return jobs;
}

/** Job bat dau (hoac thu lai) mot luot. false = clip da sang luot khac / da xong -> bo qua job. */
export async function markClipGenerating(db, { clipId, round, attempt }) {
  const { count } = await db.narrationClip.updateMany({
    where: { id: clipId, round, status: { in: ['queued', 'generating'] } },
    data: { status: 'generating', attempts: attempt },
  });
  return count === 1;
}

/**
 * Doan can doc cua clip, tinh lai tu chu HIEN TAI. null = chu / giong da doi sau khi dua di doc
 * (luot moi se lo) -> job cu khong doc ban cu.
 */
export async function loadClipInput(db, clipId) {
  const clip = await db.narrationClip.findUnique({ where: { id: clipId } });
  if (!clip) return null;
  const [story, voice] = await Promise.all([
    db.story.findUnique({ where: { id: clip.storyId }, include: NARRATION_STORY_INCLUDE }),
    loadVoice(db),
  ]);
  const seg = story && narrationSegments(story).find((s) => s.segment === clip.segment);
  if (!seg || fingerprintOf(seg.text, voice) !== clip.fingerprint) return null;
  return { clip, storyId: clip.storyId, kind: seg.kind, targetId: seg.targetId, text: seg.text, voice };
}

/**
 * Ghi ket qua: clip -> ready + key, va key vao cot *_audio_key cua trang / diem dung / phuong an.
 * Chi ghi khi clip van o dung luot + van tay (khong de job cu de len luot moi).
 * @returns {Promise<boolean>}
 */
export async function persistClip(db, { clipId, round, fingerprint, kind, targetId, audioKey, durationSeconds }) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.narrationClip.updateMany({
      where: { id: clipId, round, fingerprint, status: 'generating' },
      data: { status: 'ready', audioKey, durationSeconds, errorCode: null, errorMessage: null },
    });
    if (count !== 1) return false;
    const { model, column } = SEGMENT_TARGETS[kind];
    const data = { [column]: audioKey, ...(kind === 'page' && { audioStatus: 'ready' }) };
    await tx[model].update({ where: { id: targetId }, data });
    return true;
  });
}

/** Het luot thu / loi khong thu lai duoc -> failed (phu huynh bam "thu lai giong doc"). */
export async function failClip(db, { clipId, round, code, message }) {
  await db.narrationClip.updateMany({
    where: { id: clipId, round, status: { in: ['queued', 'generating'] } },
    data: { status: 'failed', errorCode: code?.slice(0, 40) ?? null, errorMessage: message?.slice(0, 500) ?? null },
  });
}
