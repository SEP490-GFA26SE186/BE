import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { loadStorySettings } from './lib/storySettings.js';
import { buildNameContext, tokenizeNames, findLeftoverNames, findDroppedTokens } from './lib/names.js';
import { assignTokens, defaultTarget, buildSkeleton } from './lib/skeleton.js';
import {
  STORY_DETAIL_INCLUDE,
  STORY_SUMMARY_INCLUDE,
  formatStoryDetail,
  formatStorySummary,
} from './lib/storyFormat.js';
import { loadStoryForRead, loadOwnedStory, lockForWrite } from './stories.access.js';
import { VOICE_KEY } from './stories.narration.store.js';

export { formatStoryDetail };

// Tao truyen ~15-30 cau lenh qua mang toi Supabase; mac dinh 5s cua Prisma khong du.
export const TX_OPTIONS = { timeout: 20000 };
const NEEDS_TARGET = ['emotion_other', 'perspective'];

// ---------------------------------------------------------------------------
// Ten -> token
// ---------------------------------------------------------------------------

const loadChildren = (db, parentId) =>
  db.childProfile.findMany({ where: { parentId, deletedAt: null }, select: { id: true, name: true } });

/**
 * Nap nhan vat cua phu huynh theo thu tu gui len, gan token. Nhan vat khong thuoc phu huynh hoac
 * da xoa -> 404. Tra ve [{ characterId, token, isMain, name, childId }].
 */
async function resolveStoryCharacters(db, parentId, input) {
  const ids = input.map((c) => c.characterId);
  const rows = await db.character.findMany({
    where: { id: { in: ids }, parentId, deletedAt: null },
    select: { id: true, name: true, childId: true },
  });
  if (rows.length !== new Set(ids).size) {
    throw ApiError.notFound('Không tìm thấy nhân vật đã chọn trong gia đình của bạn.');
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  return assignTokens(input).map((sc) => ({
    ...sc,
    name: byId.get(sc.characterId).name,
    childId: byId.get(sc.characterId).childId,
  }));
}

/**
 * Thay ten bang token; con sot ten (ten con khong la nhan vat) -> 422 truoc khi luu,
 * thay vi de AI tra FORBIDDEN_TERM_DETECTED sau khi da giu credit (spec §6).
 * `path` la ten truong ghi vao `errors[]` (editor dung cho chu trang / diem dung).
 */
export function tokenizeOrReject(text, { nameMap, forbiddenTerms }, path = 'situation') {
  if (text == null) return null;
  const tokenized = tokenizeNames(text, nameMap);
  const leftovers = findLeftoverNames(tokenized, forbiddenTerms);
  if (leftovers.length > 0) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Nội dung chứa tên của con chưa có trong truyện. Hãy thêm bé làm nhân vật hoặc bỏ tên khỏi nội dung.',
      leftovers.map((name) => ({ path, message: `Tên "${name}" chưa có trong truyện` })),
    );
  }
  return tokenized;
}

/** Ngu canh ten cua mot truyen da luu (Task 6 va 8 dung). `db` la prisma hoac tx. */
export async function loadNameContextForStory(db, storyId) {
  const story = await db.story.findUniqueOrThrow({
    where: { id: storyId },
    select: {
      ownerId: true,
      storyCharacters: {
        select: { token: true, aliasName: true, character: { select: { name: true, childId: true } } },
      },
    },
  });
  const children = await loadChildren(db, story.ownerId);
  return buildNameContext({
    storyCharacters: story.storyCharacters.map((sc) => ({
      token: sc.token,
      name: sc.character?.name ?? sc.aliasName,
      childId: sc.character?.childId ?? null,
    })),
    children,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const getDetail = async (db, storyId) => {
  const [story, voiceRow] = await Promise.all([
    db.story.findUniqueOrThrow({ where: { id: storyId }, include: STORY_DETAIL_INCLUDE }),
    db.platformSetting.findUnique({ where: { key: VOICE_KEY }, select: { value: true } }),
  ]);
  // Thieu cau hinh giong: khong lam hong trang chi tiet; tien do bao thieu audio (khong doc duoc).
  const voice = typeof voiceRow?.value === 'string' ? voiceRow.value.trim() : '';
  return formatStoryDetail(story, { voice });
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const createStory = async (user, data) => {
  const { topicId, length, title, situation, characters, useAiImage = false, useTts = true } = data;

  const settings = await loadStorySettings(prisma);

  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { isActive: true } });
  if (!topic) throw ApiError.notFound('Không tìm thấy chủ đề.');
  if (!topic.isActive) throw ApiError.badRequest('Chủ đề này đã ngừng sử dụng, vui lòng chọn chủ đề khác.');

  const storyCharacters = await resolveStoryCharacters(prisma, user.id, characters);
  const children = await loadChildren(prisma, user.id);
  const nameContext = buildNameContext({ storyCharacters, children });
  const tokenizedSituation = tokenizeOrReject(situation?.trim() ? situation : null, nameContext);

  const skeleton = buildSkeleton({
    length,
    layouts: settings.layouts,
    customLimits: settings.customLimits,
    storyCharacters,
  });

  const storyId = await prisma.$transaction(async (tx) => {
    const story = await tx.story.create({
      data: {
        ownerId: user.id,
        kind: 'private',
        topicId,
        length,
        title,
        situation: tokenizedSituation,
        useAiImage,
        useTts,
        status: 'draft',
      },
      select: { id: true },
    });

    await tx.storyCharacter.createMany({
      data: storyCharacters.map((sc) => ({
        storyId: story.id,
        token: sc.token,
        characterId: sc.characterId,
        isMain: sc.isMain,
      })),
    });

    // Canh tam: story_pages.scene_id NOT NULL; AI thay bang canh that khi sinh (spec §3.1).
    const scene = await tx.storyScene.create({
      data: { storyId: story.id, sceneOrder: 1, description: '' },
      select: { id: true },
    });

    await tx.storyPage.createMany({
      data: Array.from({ length: skeleton.pageCount }, (_, i) => ({
        storyId: story.id,
        pageOrder: i + 1,
        sceneId: scene.id,
        origin: 'human',
      })),
    });

    if (skeleton.checkpoints.length > 0) {
      const pages = await tx.storyPage.findMany({
        where: { storyId: story.id },
        select: { id: true, pageOrder: true },
      });
      const pageIdByOrder = new Map(pages.map((p) => [p.pageOrder, p.id]));
      await tx.storyCheckpoint.createMany({
        data: skeleton.checkpoints.map((cp) => ({
          storyId: story.id,
          afterPageId: pageIdByOrder.get(cp.afterPageOrder),
          type: cp.type,
          targetToken: cp.targetToken,
          answerEmotion: cp.answerEmotion,
          origin: 'human',
        })),
      });
    }

    return story.id;
  }, TX_OPTIONS);

  return getDetail(prisma, storyId);
};

const getStories = async (user, { status, reviewed, page = 1, limit = 10 } = {}) => {
  const where = { ownerId: user.id, kind: 'private', deletedAt: null };
  if (status) where.status = status;
  if (reviewed !== undefined) where.reviewedAt = reviewed === 'true' || reviewed === true ? { not: null } : null;

  const [total, stories] = await Promise.all([
    prisma.story.count({ where }),
    prisma.story.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: STORY_SUMMARY_INCLUDE,
    }),
  ]);

  return { stories: stories.map(formatStorySummary), total, page, limit };
};

const getStoryById = async (user, storyId) => {
  await loadStoryForRead(user, storyId);
  return getDetail(prisma, storyId);
};

const updateStory = async (user, storyId, body) => {
  return prisma.$transaction(async (tx) => {
    await lockForWrite(tx, user, storyId);

    const data = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.useAiImage !== undefined) data.useAiImage = body.useAiImage;
    if (body.useTts !== undefined) data.useTts = body.useTts;
    if (body.situation !== undefined) {
      data.situation = body.situation?.trim()
        ? tokenizeOrReject(body.situation, await loadNameContextForStory(tx, storyId))
        : null;
    }

    await tx.story.update({ where: { id: storyId }, data });
    return getDetail(tx, storyId);
  }, TX_OPTIONS);
};

/**
 * Token -> ten thuc cua bo nhan vat cu, de chuyen `situation` sang bo token moi. Chi goi SAU khi
 * da chan token cua nhan vat bi bo (findDroppedTokens), nen moi ten dien lai deu co token moi.
 */
const detokenize = (text, storyCharacters) => {
  if (text == null) return null;
  const names = new Map(storyCharacters.map((sc) => [sc.token, sc.character?.name ?? sc.aliasName]));
  return text.replace(/\{NV\d+\}/g, (token) => names.get(token) ?? token);
};

const hasWrittenContent = async (tx, storyId) => {
  const [page, checkpoint] = await Promise.all([
    tx.storyPage.findFirst({
      where: { storyId, AND: [{ contentText: { not: null } }, { contentText: { not: '' } }] },
      select: { id: true },
    }),
    tx.storyCheckpoint.findFirst({
      where: { storyId, OR: [{ question: { not: null } }, { hint: { not: null } }] },
      select: { id: true },
    }),
  ]);
  return Boolean(page || checkpoint);
};

/**
 * Doi nhan vat — chi khi chua co chu (token trong chu se tro sai nguoi). Thay toan bo
 * story_characters, dua targetToken cua diem dung ve nhan vat phu dau tien moi, va chuyen
 * `situation` sang bo token moi.
 */
const bindCharacters = async (user, storyId, characters) => {
  return prisma.$transaction(async (tx) => {
    const story = await lockForWrite(tx, user, storyId);

    if (await hasWrittenContent(tx, storyId)) {
      throw ApiError.conflict('Truyện đã có nội dung nên không thể đổi nhân vật. Hãy tạo truyện mới để dùng nhân vật khác.');
    }

    const storyCharacters = await resolveStoryCharacters(tx, user.id, characters);
    const target = defaultTarget(storyCharacters);

    const needsTarget = await tx.storyCheckpoint.count({ where: { storyId, type: { in: NEEDS_TARGET } } });
    if (needsTarget > 0 && !target) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        'Truyện độ dài này có câu hỏi về nhân vật khác, cần thêm ít nhất một nhân vật phụ.',
      );
    }

    const oldCharacters = await tx.storyCharacter.findMany({
      where: { storyId },
      include: { character: { select: { name: true } } },
    });

    // Nhan vat bi bo ma token con nam trong `situation`: KHONG tu dien lai ten that. Ten do khong
    // con trong ngu canh ten moi nen se bi luu nguyen van roi gui sang AI (lo ten that). Buoc phu
    // huynh sua tinh huong truoc. (Chu trang/diem dung da bi chan 409 o tren nen chi con situation.)
    const dropped = findDroppedTokens(
      story.situation,
      oldCharacters.map((sc) => ({
        token: sc.token,
        characterId: sc.characterId,
        name: sc.character?.name ?? sc.aliasName,
      })),
      storyCharacters.map((sc) => sc.characterId),
    );
    if (dropped.length > 0) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Tình huống của truyện đang nhắc tới ${dropped.map((d) => d.name).join(', ')}. ` +
          'Hãy sửa tình huống để bỏ nhân vật này trước khi đổi nhân vật.',
        dropped.map((d) => ({ path: 'situation', message: `Tình huống còn nhắc tới "${d.name}"` })),
      );
    }

    const children = await loadChildren(tx, user.id);
    const situation = tokenizeOrReject(
      detokenize(story.situation, oldCharacters),
      buildNameContext({ storyCharacters, children }),
    );

    await tx.storyCharacter.deleteMany({ where: { storyId } });
    await tx.storyCharacter.createMany({
      data: storyCharacters.map((sc) => ({
        storyId,
        token: sc.token,
        characterId: sc.characterId,
        isMain: sc.isMain,
      })),
    });
    if (needsTarget > 0) {
      await tx.storyCheckpoint.updateMany({
        where: { storyId, type: { in: NEEDS_TARGET } },
        data: { targetToken: target },
      });
    }
    await tx.story.update({ where: { id: storyId }, data: { situation } });

    return getDetail(tx, storyId);
  }, TX_OPTIONS);
};

/** Xoa mem. Cho phep ca khi dang `generating`: worker bo qua ket qua cua truyen da xoa. */
const deleteStory = async (user, storyId) => {
  await loadOwnedStory(user, storyId);
  await prisma.story.update({ where: { id: storyId }, data: { deletedAt: new Date() } });
};

export default {
  createStory,
  getStories,
  getStoryById,
  updateStory,
  bindCharacters,
  deleteStory,
};
