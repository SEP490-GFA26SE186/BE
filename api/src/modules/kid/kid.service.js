// Kid Mode (rev8): be doc truyen tren gia, tra loi diem dung, he thong cham EQ.
// Moi ham nhan `kid` = { childId, parentId } tu kidAuth — khong bao gio la user cua phu huynh.
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { assetUrl } from '../../clients/assetUrl.js';
import { loadReadiness, notReadyMessage } from '../stories/stories.narration.store.js';
import { readingProgress } from '../bookshelf/lib/shelf.js';
import { answerOutcome, firstScore, isCorrect, kidStoryContent, readChoice, skillCodeFor } from './lib/play.js';

const TX = { timeout: 20000 };

const PLAY_STORY_INCLUDE = {
  topic: { select: { title: true, skill: { select: { caselCode: true } } } },
  storyCharacters: { include: { character: { select: { name: true } } } },
  pages: { select: { id: true, pageOrder: true, contentText: true, audioKey: true } },
  checkpoints: { include: { options: true } },
};

const notFound = () => ApiError.notFound('Không tìm thấy truyện trên giá sách của bé.');

/** Truyen phai nam tren gia cua be VA san sang (da hoan tat + du giong doc khop chu). */
async function assertPlayable(childId, storyId) {
  const onShelf = await prisma.bookshelfItem.findUnique({ where: { childId_storyId: { childId, storyId } } });
  if (!onShelf) throw notFound();
  const check = await loadReadiness(prisma, storyId);
  if (!check) throw notFound();
  if (!check.ready) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, notReadyMessage(check), [
      { path: 'storyId', message: check.reason, narration: check.narration },
    ]);
  }
}

async function ownSession(kid, sessionId, db = prisma) {
  const session = await db.playSession.findFirst({ where: { id: sessionId, childId: kid.childId } });
  if (!session) throw ApiError.notFound('Không tìm thấy lượt đọc.');
  return session;
}

const formatSession = (s) => ({
  id: s.id,
  storyId: s.storyId,
  isFirstPlay: s.isFirstPlay,
  status: s.status,
  currentPageId: s.currentPageId,
  startedAt: s.startedAt,
  completedAt: s.completedAt,
});

/** Noi dung + cau da tra loi cua luot doc (tiep tuc dung cho dang do). */
async function sessionPayload(session) {
  const story = await prisma.story.findUniqueOrThrow({ where: { id: session.storyId }, include: PLAY_STORY_INCLUDE });
  const rows = await prisma.checkpointAnswer.findMany({ where: { sessionId: session.id } });
  const byId = new Map(story.checkpoints.map((c) => [c.id, c]));
  const answered = new Map(
    rows
      .filter((r) => byId.has(r.checkpointId))
      .map((r) => [r.checkpointId, answerOutcome(byId.get(r.checkpointId), r, story.storyCharacters, story)]),
  );
  return { session: formatSession(session), story: kidStoryContent(story, answered) };
}

// ---------------------------------------------------------------------------

const getMe = async (kid) => {
  const child = await prisma.childProfile.findUniqueOrThrow({
    where: { id: kid.childId },
    select: { id: true, name: true, birthDate: true, preferredVoice: true },
  });
  return { child };
};

/** Gia sach cua be: chi truyen da san sang (truyen dang tao lai giong doc tam an). */
const getShelf = async (kid) => {
  const rows = await prisma.bookshelfItem.findMany({
    where: { childId: kid.childId, story: { deletedAt: null } },
    orderBy: { addedAt: 'desc' },
    select: { addedAt: true, story: { select: { id: true, title: true, _count: { select: { pages: true } } } } },
  });
  const sessions = await prisma.playSession.findMany({
    where: { childId: kid.childId, storyId: { in: rows.map((r) => r.story.id) } },
    orderBy: { lastActivityAt: 'desc' },
    select: { storyId: true, status: true, lastActivityAt: true, currentPage: { select: { pageOrder: true } } },
  });
  const latest = new Map();
  for (const s of sessions) if (!latest.has(s.storyId)) latest.set(s.storyId, s);

  const items = [];
  for (const { addedAt, story } of rows) {
    const check = await loadReadiness(prisma, story.id);
    if (!check?.ready) continue;
    const s = latest.get(story.id);
    items.push({
      storyId: story.id,
      title: story.title,
      coverImageUrl: null, // rev8: truyen khong co anh bia; luong sinh anh da bo -> FE dung anh giu cho
      totalPages: story._count.pages,
      addedAt,
      readingProgress: readingProgress(s && { ...s, currentPageOrder: s.currentPage?.pageOrder ?? null }, story._count.pages),
    });
  }
  return { items };
};

/**
 * Bat dau / tiep tuc doc. Luot dang do (in_progress) -> tiep tuc. Khong co -> luot moi;
 * is_first_play = be chua tung doc truyen nay (partial unique chan hai luot "dau" song song).
 */
const startSession = async (kid, storyId) => {
  await assertPlayable(kid.childId, storyId);
  const where = { childId: kid.childId, storyId };
  let session = await prisma.playSession.findFirst({ where: { ...where, status: 'in_progress' }, orderBy: { lastActivityAt: 'desc' } });
  if (!session) {
    const played = await prisma.playSession.count({ where });
    try {
      session = await prisma.playSession.create({ data: { ...where, isFirstPlay: played === 0 } });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      // Hai request "lan dau" cung luc: ban kia da tao -> dung luot cua no.
      session = await prisma.playSession.findFirstOrThrow({ where: { ...where, status: 'in_progress' } });
    }
  } else {
    session = await prisma.playSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } });
  }
  return sessionPayload(session);
};

const getSession = async (kid, sessionId) => sessionPayload(await ownSession(kid, sessionId));

/** Luu trang dang doc (de lan sau tiep tuc dung cho). */
const saveProgress = async (kid, sessionId, pageId) => {
  const session = await ownSession(kid, sessionId);
  const page = await prisma.storyPage.findFirst({ where: { id: pageId, storyId: session.storyId }, select: { id: true } });
  if (!page) throw ApiError.notFound('Không tìm thấy trang.');
  const updated = await prisma.playSession.update({
    where: { id: session.id },
    data: { currentPageId: page.id, lastActivityAt: new Date() },
  });
  return { session: formatSession(updated) };
};

/**
 * Be tra loi mot diem dung. body: { checkpointId, emotion? | optionId?, skipped?, timeToFirstMs?, questionReplays? }.
 * Lan dau: luu lan chon dau + diem (dong bang), cong eq_competency_stats neu la luot doc dau.
 * Sai lan dau (emotion / perspective): tra goi y; lan thu hai: luu lan chon cuoi, bao dap an.
 * Da xong -> tra lai ket qua cu (bam lai khong doi diem).
 */
const answer = async (kid, sessionId, body) =>
  prisma.$transaction(async (tx) => {
    const session = await ownSession(kid, sessionId, tx);
    if (session.status !== 'in_progress') {
      throw new ApiError(StatusCodes.CONFLICT, 'Lượt đọc này đã kết thúc.');
    }
    const story = await tx.story.findUniqueOrThrow({ where: { id: session.storyId }, include: PLAY_STORY_INCLUDE });
    const checkpoint = story.checkpoints.find((c) => c.id === body.checkpointId);
    if (!checkpoint) throw ApiError.notFound('Không tìm thấy điểm dừng.');

    const skipped = body.skipped === true && checkpoint.type !== 'reflection' ? true : false;
    const choice = skipped ? {} : readChoice(checkpoint, body);
    if (!choice) throw ApiError.badRequest('Lựa chọn không đúng với kiểu điểm dừng.');

    const outcome = (row) => answerOutcome(checkpoint, row, story.storyCharacters, story);
    const existing = await tx.checkpointAnswer.findUnique({
      where: { sessionId_checkpointId: { sessionId, checkpointId: checkpoint.id } },
    });

    if (existing) {
      const current = outcome(existing);
      if (current.done || skipped) return current;
      // Lan chon thu hai sau goi y: chi luu lan chon cuoi, diem van la diem lan dau.
      const row = await tx.checkpointAnswer.update({
        where: { id: existing.id },
        data: { attempts: 2, finalEmotion: choice.emotion ?? null, finalOptionId: choice.optionId ?? null },
      });
      return outcome(row);
    }

    const code = skillCodeFor(checkpoint.type, story.topic?.skill?.caselCode);
    const skill = code ? await tx.eqSkill.findUnique({ where: { caselCode: code }, select: { id: true } }) : null;
    const score = skipped ? null : firstScore(checkpoint, choice);
    const finished = skipped || isCorrect(checkpoint, choice); // dung ngay (hoac khong co chon lai)
    const row = await tx.checkpointAnswer.create({
      data: {
        sessionId,
        checkpointId: checkpoint.id,
        firstEmotion: choice.emotion ?? null,
        firstOptionId: choice.optionId ?? null,
        finalEmotion: finished ? choice.emotion ?? null : null,
        finalOptionId: finished ? choice.optionId ?? null : null,
        attempts: 1,
        skipped,
        timeToFirstMs: Number.isInteger(body.timeToFirstMs) ? body.timeToFirstMs : null,
        questionReplays: Number.isInteger(body.questionReplays) ? body.questionReplays : 0,
        skillId: score == null ? null : skill?.id ?? null,
        score,
      },
    });

    // Chi luot doc dau, khong bo qua, co nang luc + diem (DBML eq_competency_stats).
    if (session.isFirstPlay && score != null && skill) {
      await tx.eqCompetencyStat.upsert({
        where: { childId_skillId: { childId: kid.childId, skillId: skill.id } },
        create: { childId: kid.childId, skillId: skill.id, items: 1, scoreSum: score },
        update: { items: { increment: 1 }, scoreSum: { increment: score }, updatedAt: new Date() },
      });
    }
    await tx.playSession.update({ where: { id: sessionId }, data: { lastActivityAt: new Date() } });
    return outcome(row);
  }, TX);

/** Doc xong. Idempotent. */
const complete = async (kid, sessionId) => {
  const session = await ownSession(kid, sessionId);
  if (session.status === 'completed') return { session: formatSession(session) };
  const updated = await prisma.playSession.update({
    where: { id: session.id },
    data: { status: 'completed', completedAt: new Date(), lastActivityAt: new Date() },
  });
  return { session: formatSession(updated) };
};

/** Cau doc dung chung (ten cam xuc, cau nhac): { key: { text, audioUrl } }. */
const getUiAudio = async () => {
  const rows = await prisma.uiAudioAsset.findMany({ where: { lang: 'vi' } });
  return { assets: Object.fromEntries(rows.map((r) => [r.key, { text: r.textContent, audioUrl: assetUrl(r.audioKey) }])) };
};

export default { getMe, getShelf, startSession, getSession, saveProgress, answer, complete, getUiAudio };
