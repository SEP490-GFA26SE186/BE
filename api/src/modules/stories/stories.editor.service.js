// Editor (spec §4.2): sua trang / diem dung, them-xoa cua truyen `custom`, review.
// Moi thao tac: khoa dong truyen (409 khi dang `generating`) -> thay ten bang token -> ghi ->
// tinh lai status tu cac trang, tat ca trong mot transaction. `reviewed_at` chi dat o review,
// khong bao gio bi xoa o day (spec §4.4, Review Focus 5).
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { lockForWrite } from './stories.access.js';
import { TX_OPTIONS, getDetail, loadNameContextForStory, tokenizeOrReject } from './stories.service.js';
import { loadStorySettings } from './lib/storySettings.js';
import { dispatchNarration, prepareNarration } from './stories.narration.service.js';
import { storyStatusFromPages } from './lib/completeness.js';
import { assertCustomLayout } from './lib/customRules.js';
import {
  blankToNull,
  editedOrigin,
  checkCheckpointEdit,
  newCheckpointFields,
  resolveCheckpointTarget,
  customLayoutFromRows,
  findReviewGaps,
} from './lib/editorRules.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Chu trong -> null; con lai: trim, thay ten bang token, sot ten con -> 422. */
const tokenizeText = (text, nameContext, path) => {
  const value = blankToNull(text);
  return value == null ? null : tokenizeOrReject(value.trim(), nameContext, path);
};

async function findPage(tx, storyId, pageId) {
  const page = await tx.storyPage.findFirst({ where: { id: pageId, storyId } });
  if (!page) throw ApiError.notFound('Không tìm thấy trang.');
  return page;
}

async function findCheckpoint(tx, storyId, checkpointId) {
  const checkpoint = await tx.storyCheckpoint.findFirst({ where: { id: checkpointId, storyId } });
  if (!checkpoint) throw ApiError.notFound('Không tìm thấy điểm dừng.');
  return checkpoint;
}

/**
 * `ready` = moi trang co chu, con trang trong -> `draft` (spec §4.4). Luon ghi lai de `updatedAt`
 * cua truyen nhich theo moi lan sua (danh sach truyen sap theo `updatedAt`).
 */
async function syncStatus(tx, storyId) {
  const pages = await tx.storyPage.findMany({ where: { storyId }, select: { contentText: true } });
  await tx.story.update({ where: { id: storyId }, data: { status: storyStatusFromPages(pages) } });
}

/** Khoa + chi cho truyen `custom` them/xoa trang, diem dung. */
async function lockCustom(tx, user, storyId) {
  const story = await lockForWrite(tx, user, storyId);
  if (story.length !== 'custom') {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Chỉ truyện tự viết mới thêm, xoá được trang và điểm dừng.',
    );
  }
  return story;
}

/** Khung truyen hien tai doc tu DB (trong transaction, thay ca thay doi chua commit). */
async function loadLayout(tx, storyId) {
  const pages = await tx.storyPage.findMany({ where: { storyId }, select: { id: true, pageOrder: true } });
  const checkpoints = await tx.storyCheckpoint.findMany({ where: { storyId }, select: { type: true, afterPageId: true } });
  return customLayoutFromRows(pages, checkpoints);
}

/**
 * Dong lai cho trong `page_order` sau khi xoa trang `removedOrder`. Unique (story_id, page_order)
 * kiem tung dong ngay trong UPDATE, nen khong dich thang n -> n-1 duoc: truoc het doi cac trang
 * phia sau sang so am (khong trung so duong nao), roi gan lai so duong -n-1.
 */
async function closePageGap(tx, storyId, removedOrder) {
  await tx.$executeRaw`
    UPDATE story_pages SET page_order = -page_order
    WHERE story_id = ${storyId}::uuid AND page_order > ${removedOrder}`;
  await tx.$executeRaw`
    UPDATE story_pages SET page_order = -page_order - 1
    WHERE story_id = ${storyId}::uuid AND page_order < 0`;
}

const inTransaction = (fn) => prisma.$transaction(fn, TX_OPTIONS);

// ---------------------------------------------------------------------------
// Sua noi dung
// ---------------------------------------------------------------------------

const updatePage = (user, storyId, pageId, { contentText }) =>
  inTransaction(async (tx) => {
    await lockForWrite(tx, user, storyId);
    const page = await findPage(tx, storyId, pageId);
    const nameContext = await loadNameContextForStory(tx, storyId);

    await tx.storyPage.update({
      where: { id: page.id },
      data: {
        contentText: tokenizeText(contentText, nameContext, 'contentText'),
        origin: editedOrigin(page.origin),
        // Chu doi thi giong doc cu sai; TTS se sinh lai.
        audioKey: null,
        audioStatus: 'none',
      },
    });

    await syncStatus(tx, storyId);
    return getDetail(tx, storyId);
  });

const updateCheckpoint = (user, storyId, checkpointId, body) =>
  inTransaction(async (tx) => {
    await lockForWrite(tx, user, storyId);
    const checkpoint = await findCheckpoint(tx, storyId, checkpointId);
    checkCheckpointEdit(checkpoint.type, body);
    const nameContext = await loadNameContextForStory(tx, storyId);

    const data = { origin: editedOrigin(checkpoint.origin), questionAudioKey: null, hintAudioKey: null };
    if (body.question !== undefined) data.question = tokenizeText(body.question, nameContext, 'question');
    if (body.hint !== undefined) data.hint = tokenizeText(body.hint, nameContext, 'hint');
    if (body.answerEmotion !== undefined) data.answerEmotion = body.answerEmotion;

    // Thay ten truoc moi lenh ghi: sot ten -> 422 ma chua dung gi.
    const options = body.options?.map((o, i) => ({
      optionOrder: i + 1,
      text: tokenizeText(o.text, nameContext, `options.${i}.text`),
      role: o.role ?? null,
      isCorrect: o.isCorrect ?? null,
      feedback: tokenizeText(o.feedback, nameContext, `options.${i}.feedback`),
      textAudioKey: null,
      feedbackAudioKey: null,
    }));

    await tx.storyCheckpoint.update({ where: { id: checkpoint.id }, data });

    if (options) {
      // Upsert theo option_order de giu id phuong an: checkpoint_answers tro toi no (RESTRICT).
      for (const opt of options) {
        await tx.checkpointOption.upsert({
          where: { checkpointId_optionOrder: { checkpointId: checkpoint.id, optionOrder: opt.optionOrder } },
          create: { checkpointId: checkpoint.id, ...opt },
          update: opt,
        });
      }
      await tx.checkpointOption.deleteMany({
        where: { checkpointId: checkpoint.id, optionOrder: { gt: options.length } },
      });
    } else {
      await tx.checkpointOption.updateMany({
        where: { checkpointId: checkpoint.id },
        data: { textAudioKey: null, feedbackAudioKey: null },
      });
    }

    await syncStatus(tx, storyId);
    return getDetail(tx, storyId);
  });

// ---------------------------------------------------------------------------
// Them / xoa — chi `custom` (luat: customRules.assertCustomLayout, gioi han tu custom_limits.*)
// ---------------------------------------------------------------------------

const addPage = async (user, storyId, { contentText } = {}) => {
  const { customLimits } = await loadStorySettings(prisma);
  return inTransaction(async (tx) => {
    await lockCustom(tx, user, storyId);

    const last = await tx.storyPage.findFirst({
      where: { storyId },
      orderBy: { pageOrder: 'desc' },
      select: { pageOrder: true },
    });
    // Gan vao canh cuoi (truyen custom chi co canh tam tao cung truyen).
    const scene =
      (await tx.storyScene.findFirst({ where: { storyId }, orderBy: { sceneOrder: 'desc' }, select: { id: true } })) ??
      (await tx.storyScene.create({ data: { storyId, sceneOrder: 1, description: '' }, select: { id: true } }));

    const text = contentText === undefined
      ? null
      : tokenizeText(contentText, await loadNameContextForStory(tx, storyId), 'contentText');

    await tx.storyPage.create({
      data: {
        storyId,
        pageOrder: (last?.pageOrder ?? 0) + 1,
        sceneId: scene.id,
        contentText: text,
        origin: 'human',
      },
    });

    assertCustomLayout(await loadLayout(tx, storyId), customLimits);
    await syncStatus(tx, storyId);
    return getDetail(tx, storyId);
  });
};

const deletePage = async (user, storyId, pageId) => {
  const { customLimits } = await loadStorySettings(prisma);
  return inTransaction(async (tx) => {
    await lockCustom(tx, user, storyId);
    const page = await findPage(tx, storyId, pageId);

    const checkpoint = await tx.storyCheckpoint.findUnique({ where: { afterPageId: page.id }, select: { id: true } });
    if (checkpoint) {
      throw ApiError.conflict('Trang này đang có điểm dừng đặt sau nó. Hãy xoá điểm dừng trước.');
    }

    await tx.storyPage.delete({ where: { id: page.id } });
    await closePageGap(tx, storyId, page.pageOrder);

    assertCustomLayout(await loadLayout(tx, storyId), customLimits);
    await syncStatus(tx, storyId);
    return getDetail(tx, storyId);
  });
};

const addCheckpoint = async (user, storyId, { type, afterPageId, targetToken }) => {
  const { customLimits } = await loadStorySettings(prisma);
  return inTransaction(async (tx) => {
    await lockCustom(tx, user, storyId);
    const page = await findPage(tx, storyId, afterPageId);

    const storyCharacters = await tx.storyCharacter.findMany({
      where: { storyId },
      select: { token: true, isMain: true },
    });
    const target = resolveCheckpointTarget(type, targetToken, storyCharacters);

    // Kiem khung CO diem dung moi truoc khi ghi: after_page_id unique, ghi truoc thi trang da co
    // diem dung se thanh loi P2002 thay vi 422 de hieu.
    const layout = await loadLayout(tx, storyId);
    layout.checkpoints.push({ type, afterPageOrder: page.pageOrder });
    assertCustomLayout(layout, customLimits);

    await tx.storyCheckpoint.create({
      data: { storyId, afterPageId: page.id, origin: 'human', ...newCheckpointFields(type, target) },
    });

    await syncStatus(tx, storyId);
    return getDetail(tx, storyId);
  });
};

const deleteCheckpoint = async (user, storyId, checkpointId) => {
  const { customLimits } = await loadStorySettings(prisma);
  return inTransaction(async (tx) => {
    await lockCustom(tx, user, storyId);
    const checkpoint = await findCheckpoint(tx, storyId, checkpointId);

    // Phuong an xoa theo (onDelete Cascade).
    await tx.storyCheckpoint.delete({ where: { id: checkpoint.id } });

    assertCustomLayout(await loadLayout(tx, storyId), customLimits);
    await syncStatus(tx, storyId);
    return getDetail(tx, storyId);
  });
};

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/** Dat `reviewed_at` khi moi trang co chu va moi diem dung du truong theo kieu; thieu -> 422. */
/**
 * Hoan tat: dat reviewed_at, roi (use_tts) dua cac doan thieu / lech audio di doc (spec TTS §5.2).
 * Job day SAU commit; Redis loi thi clip thanh failed, hoan tat van thanh cong (khong co credit).
 */
const reviewStory = async (user, storyId, narrationOptions) => {
  const { detail, jobs } = await inTransaction(async (tx) => {
    await lockForWrite(tx, user, storyId);

    const pages = await tx.storyPage.findMany({
      where: { storyId },
      select: { id: true, pageOrder: true, contentText: true },
    });
    const checkpoints = await tx.storyCheckpoint.findMany({ where: { storyId }, include: { options: true } });

    const gaps = findReviewGaps({ pages, checkpoints });
    if (gaps.length > 0) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        'Truyện còn chỗ chưa viết xong. Hãy hoàn thành các chỗ còn thiếu rồi đánh dấu đã xem.',
        gaps,
      );
    }

    await tx.story.update({
      where: { id: storyId },
      data: { reviewedAt: new Date(), status: storyStatusFromPages(pages) },
    });
    const queued = await prepareNarration(tx, storyId);
    return { detail: await getDetail(tx, storyId), jobs: queued };
  });
  if (await dispatchNarration(jobs, narrationOptions)) return detail;
  return getDetail(prisma, storyId); // clip vua bi danh dau failed -> tra tien do dung
};

export default {
  updatePage,
  updateCheckpoint,
  addPage,
  deletePage,
  addCheckpoint,
  deleteCheckpoint,
  reviewStory,
};
