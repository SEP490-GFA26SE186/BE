/**
 * Doc san cac cau dung chung moi truyen (ui_audio_assets): ten 5 cam xuc o diem dung nhan dien cam
 * xuc, cau nhac khi chon sai, khen khi dung, het truyen... (spec TTS §5.1). Goi thang ai/ (TTS), nen
 * phai chay o noi co AI_SERVICE_URL + INTERNAL_TOKEN — container worker:
 *
 *   docker compose exec worker node scripts/seed-ui-audio.js          # chi doc cau moi / da doi chu
 *   docker compose exec worker node scripts/seed-ui-audio.js --force  # doc lai tat ca (vd. doi giong)
 *
 * Noi dung cau do FE / Kid Mode chot; sua danh sach PHRASES roi chay lai. Giong = platform_settings
 * tts.voice (giong voi truyen). Khong tinh credit.
 */
import crypto from 'node:crypto';
import { prisma } from '../src/config/index.js';
import { callAi } from '../src/clients/aiClient.js';
import { AI_JOB } from '../src/queues/ai.jobs.js';
import { loadVoice } from '../src/modules/stories/stories.narration.store.js';

export const PHRASES = {
  'emotion.happy': 'Vui',
  'emotion.sad': 'Buồn',
  'emotion.angry': 'Giận',
  'emotion.scared': 'Sợ',
  'emotion.neutral': 'Bình thường',
  'prompt.choose_emotion': 'Con chọn một khuôn mặt nhé.',
  'prompt.try_again': 'Chưa đúng rồi. Con nghe gợi ý rồi chọn lại nhé!',
  'prompt.correct': 'Đúng rồi! Con giỏi quá!',
  'prompt.answer_is': 'Đáp án là đây nè. Mình cùng nhớ nhé!',
  'prompt.reflection': 'Con kể cho ba mẹ nghe nhé. Khi nào xong thì bấm tiếp tục.',
  'prompt.next_page': 'Mình đọc tiếp nhé!',
  'prompt.story_end': 'Hết truyện rồi! Con đọc giỏi lắm!',
};

async function main() {
  const force = process.argv.includes('--force');
  const voice = await loadVoice(prisma);
  const existing = new Map((await prisma.uiAudioAsset.findMany({ where: { lang: 'vi' } })).map((r) => [r.key, r]));
  let done = 0;
  for (const [key, text] of Object.entries(PHRASES)) {
    const row = existing.get(key);
    if (!force && row?.textContent === text) continue;
    // request_id tat dinh theo (key, chu, giong): doc lai cung cau ghi de dung file cu.
    const tag = crypto.createHash('sha256').update(`${voice}\n${text}`).digest('hex').slice(0, 12);
    const res = await callAi(AI_JOB.NARRATION, {
      request_id: `${key.replace(/[^A-Za-z0-9_-]/g, '_')}-${tag}`,
      storage_prefix: 'ui-audio/vi',
      text,
      voice_id: voice,
    });
    await prisma.uiAudioAsset.upsert({
      where: { key_lang: { key, lang: 'vi' } },
      create: { key, lang: 'vi', textContent: text, audioKey: res.audio_key },
      update: { textContent: text, audioKey: res.audio_key },
    });
    done += 1;
    console.log(`✓ ${key} (${res.duration_seconds}s)`);
  }
  console.log(`ui_audio_assets: doc ${done}, giu nguyen ${Object.keys(PHRASES).length - done}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
