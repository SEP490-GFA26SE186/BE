import { StatusCodes } from 'http-status-codes';
import { env, prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { loadStorySettings } from './lib/storySettings.js';
import { buildNameContext, tokenizeNames, findLeftoverNames, findDroppedTokens } from './lib/names.js';
import { assignTokens, defaultTarget, buildSkeleton } from './lib/skeleton.js';
import { planSlots } from './lib/slotPlan.js';
import { planFamilySlots } from './lib/familySkills.js';
import { hashSituation, sameCharacters, verifyAnalysisToken } from './lib/analysisToken.js';
import { loadConfirmedSubSkills } from './stories.family.store.js';
import {
  STORY_DETAIL_INCLUDE,
  STORY_SUMMARY_INCLUDE,
  formatStoryDetail,
  formatStorySummary,
} from './lib/storyFormat.js';
import { loadStoryForRead, loadOwnedStory, lockForWrite } from './stories.access.js';
import { VOICE_KEY } from './stories.narration.store.js';
import { blockedErrors, keywordIssues, storyTextTargets } from './lib/keywords.js';
import { hasReadyImage } from './lib/cover.js';

export { formatStoryDetail };

// Tao truyen ~15-30 cau lenh qua mang toi Supabase; mac dinh 5s cua Prisma khong du.
export const TX_OPTIONS = { timeout: 20000 };
// Diem dung hoi ve nhan vat khac: co target (mau `needsTarget`); perspective cua mau khong can
// target thi target null nen khong loc theo kieu.
const HAS_TARGET = { targetToken: { not: null } };
// Can nhan vat phu: co target, hoac mau `needsTarget` ma kieu khong duoc luu target (role_choice ->
// problem_solving, CHECK DB cam target) — van phai giu bat bien ma planSlots da dam bao.
const NEEDS_SECONDARY = { OR: [HAS_TARGET, { templateVersion: { needsTarget: true } }] };

// ---------------------------------------------------------------------------
// Ten -> token
// ---------------------------------------------------------------------------

export const loadChildren = (db, parentId) =>
  db.childProfile.findMany({ where: { parentId, deletedAt: null }, select: { id: true, name: true } });

/**
 * Nap nhan vat cua phu huynh theo thu tu gui len, gan token. Nhan vat khong thuoc phu huynh hoac
 * da xoa -> 404. Tra ve [{ characterId, token, isMain, name, childId }].
 */
export async function resolveStoryCharacters(db, parentId, input) {
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

/** Tu khoa bi chan dang dung (Specialist quan ly). */
export const loadActiveKeywords = (db) =>
  db.blockedKeyword.findMany({ where: { isActive: true }, select: { keyword: true, severity: true } });

/**
 * Chu phu huynh viet (editor) chua tu `block` -> 422, transaction cua nguoi goi rollback (khong luu).
 * `paths`: chi kiem cac doan vua sua (vd. ['pages.<id>']); bo trong = ca truyen (luc hoan tat).
 */
export async function assertNoBlockedKeywords(db, storyId, paths) {
  const keywords = await loadActiveKeywords(db);
  if (!keywords.length) return;
  const story = await db.story.findUniqueOrThrow({ where: { id: storyId }, include: { pages: true, checkpoints: { include: { options: true } } } });
  const targets = storyTextTargets(story).filter((t) => !paths || paths.includes(t.path));
  const errors = blockedErrors(keywordIssues(targets, keywords));
  if (errors.length) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Truyện có từ không phù hợp cho bé. Hãy sửa lại chỗ được đánh dấu.', errors);
  }
}

export const getDetail = async (db, storyId) => {
  const [story, voiceRow, keywords] = await Promise.all([
    db.story.findUniqueOrThrow({ where: { id: storyId }, include: STORY_DETAIL_INCLUDE }),
    db.platformSetting.findUnique({ where: { key: VOICE_KEY }, select: { value: true } }),
    loadActiveKeywords(db),
  ]);
  // Thieu cau hinh giong: khong lam hong trang chi tiet; tien do bao thieu audio (khong doc duoc).
  const voice = typeof voiceRow?.value === 'string' ? voiceRow.value.trim() : '';
  // Tu khoa trong chu hien tai (ca `warn` lan `block`) de editor hien canh bao ngay o doan do.
  const keywordWarnings = keywordIssues(storyTextTargets(story), keywords);
  return { ...formatStoryDetail(story, { voice }), keywordWarnings };
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Ky nang con cua topic (theo displayOrder) kem mau dang bat va ban published moi nhat cua tung mau
 * (spec casel-pedagogy §6.1). Ky nang con da tat khong dung.
 */
const TOPIC_SLOT_SELECT = {
  isActive: true,
  subSkills: {
    select: {
      subSkill: {
        select: {
          id: true,
          displayOrder: true,
          isActive: true,
          templates: {
            where: { isActive: true },
            select: {
              id: true,
              answerFormat: true,
              versions: { where: { status: 'published' }, orderBy: { version: 'desc' }, take: 1 },
            },
          },
        },
      },
    },
  },
};

/** TOPIC_SLOT_SELECT -> input `subSkills` cua planSlots; moi version mang them `answerFormat` cua mau. */
const slotSubSkills = (topic) =>
  topic.subSkills
    .map((l) => l.subSkill)
    .filter((s) => s.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
    .map((s) => ({
      id: s.id,
      displayOrder: s.displayOrder,
      versions: s.templates.flatMap((t) => t.versions.map((v) => ({ ...v, answerFormat: t.answerFormat }))),
    }));

const FAMILY_LOCKED = 'Muốn đổi lời kể hay nhân vật, hãy tạo truyện mới.';
const REANALYZE = 'Kết quả phân tích đã hết hạn hoặc không khớp với lời kể / nhân vật. Hãy bấm "Xem bé sẽ tập gì" để phân tích lại.';

/**
 * Truyen family (spec family-story §6.1): kiem `analysisToken` (chu ky, han, chu truyen, hash loi ke,
 * nhan vat) roi tra ve phan rieng cua truyen family: o cham (plan), cac truong luu va story_sub_skills.
 */
async function prepareFamily(user, data, { storyCharacters, tokenizedSituation, layout, rng }) {
  const analysis = verifyAnalysisToken(data.analysisToken, env.jwt.secret, { ownerId: user.id });
  if (!analysis || analysis.situationHash !== hashSituation(tokenizedSituation) || !sameCharacters(analysis.characters, data.characters)) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, REANALYZE, [{ path: 'analysisToken', message: 'Kết quả phân tích không còn dùng được' }]);
  }
  const scored = data.scored !== false;
  const fields = { momentSummary: analysis.momentSummary, seedEvent: scored ? analysis.seedEvent : null, scored };
  if (!scored) return { plan: [], fields, subSkillRows: [], reflectionOnly: true };

  const confirmed = await loadConfirmedSubSkills(prisma, analysis.subSkills.map((s) => s.id), {
    hasSecondary: storyCharacters.some((c) => !c.isMain),
  });
  // Ky nang chinh phai con (loadConfirmedSubSkills bo id khong ton tai) -> planFamilySlots kiem phien ban.
  if (confirmed[0]?.id !== analysis.subSkills[0].id) confirmed.unshift({ id: analysis.subSkills[0].id, versions: [] });
  const plan = planFamilySlots({
    slots: layout.checkpoints.filter((c) => c.type === 'scored').map((c) => c.after),
    subSkills: confirmed,
    rng,
  });
  const sourceOf = new Map(analysis.subSkills.map((s) => [s.id, s.source]));
  const subSkillRows = confirmed
    .filter((s) => s.versions.length > 0)
    .map((s, i) => ({ subSkillId: s.id, source: sourceOf.get(s.id), position: i + 1 }));
  return { plan, fields, subSkillRows, reflectionOnly: false };
}

const createStory = async (user, data, { rng = Math.random } = {}) => {
  const { topicId, length, title, situation, characters, useAiImage = false, useTts = true } = data;
  // Thieu `entry` voi do dai AI -> topic; tu viet luon handwritten (spec A.1).
  const entry = length === 'custom' ? 'handwritten' : data.entry ?? 'topic';

  const settings = await loadStorySettings(prisma);

  // Chuyen mau bat buoc co topic; tu viet co the khong chon bai hoc; family khong co topic.
  if (entry === 'topic' && !topicId) throw ApiError.badRequest('Truyện AI cần chọn chủ đề.');
  const useTopic = entry !== 'family' && topicId;
  const topic = useTopic ? await prisma.topic.findUnique({ where: { id: topicId }, select: TOPIC_SLOT_SELECT }) : null;
  if (useTopic && !topic) throw ApiError.notFound('Không tìm thấy chủ đề.');
  if (topic && !topic.isActive) throw ApiError.badRequest('Chủ đề này đã ngừng sử dụng, vui lòng chọn chủ đề khác.');

  const storyCharacters = await resolveStoryCharacters(prisma, user.id, characters);
  const children = await loadChildren(prisma, user.id);
  const nameContext = buildNameContext({ storyCharacters, children });
  const tokenizedSituation = tokenizeOrReject(situation?.trim() ? situation.trim() : null, nameContext);

  // Xep mau vao o cham truoc khi ghi gi (va truoc moi buoc giu credit o luc sinh): 422 o day khong
  // tao truyen, khong dong toi vi.
  let layout = length === 'custom' ? null : settings.layouts[length];
  let plan = [];
  let family = null;
  if (entry === 'family') {
    family = await prepareFamily(user, data, { storyCharacters, tokenizedSituation, layout, rng });
    plan = family.plan;
    // "Chi ke truyen": khung chi giu trang + diem dung reflection.
    if (family.reflectionOnly) layout = { ...layout, checkpoints: layout.checkpoints.filter((c) => c.type === 'reflection') };
  } else if (layout) {
    plan = planSlots({
      slots: layout.checkpoints.filter((c) => c.type === 'scored').map((c) => c.after),
      subSkills: slotSubSkills(topic),
      hasSecondary: storyCharacters.some((c) => !c.isMain),
      rng,
    });
  }

  const skeleton = buildSkeleton({
    length,
    layouts: layout ? { ...settings.layouts, [length]: layout } : settings.layouts,
    customLimits: settings.customLimits,
    storyCharacters,
    plan,
  });

  const storyId = await prisma.$transaction(async (tx) => {
    const story = await tx.story.create({
      data: {
        ownerId: user.id,
        kind: 'private',
        topicId: entry === 'family' ? null : topicId ?? null,
        length,
        entry,
        title,
        situation: tokenizedSituation,
        ...(family && family.fields),
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

    if (family?.subSkillRows.length) {
      await tx.storySubSkill.createMany({ data: family.subSkillRows.map((r) => ({ storyId: story.id, ...r })) });
    }

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
          subSkillId: cp.subSkillId,
          templateVersionId: cp.templateVersionId,
          scored: cp.scored,
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
    const story = await lockForWrite(tx, user, storyId);
    if (body.situation !== undefined && story.entry === 'family') throw ApiError.conflict(FAMILY_LOCKED);

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
    if (story.entry === 'family') throw ApiError.conflict(FAMILY_LOCKED);

    if (await hasWrittenContent(tx, storyId)) {
      throw ApiError.conflict('Truyện đã có nội dung nên không thể đổi nhân vật. Hãy tạo truyện mới để dùng nhân vật khác.');
    }

    const storyCharacters = await resolveStoryCharacters(tx, user.id, characters);
    const target = defaultTarget(storyCharacters);

    const needsTarget = await tx.storyCheckpoint.count({ where: { storyId, ...NEEDS_SECONDARY } });
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
        where: { storyId, ...HAS_TARGET },
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

/**
 * PUT /stories/:id/cover { sceneId } — chon canh lam anh bia (chi chu truyen, truyen rieng).
 * Canh phai thuoc truyen va da co anh, khong thi 422. null -> ve mac dinh (canh 1).
 */
const setCover = async (user, storyId, sceneId) => {
  const story = await loadOwnedStory(user, storyId);
  if (story.kind !== 'private') throw ApiError.notFound('Không tìm thấy truyện.');
  if (sceneId) {
    const scene = await prisma.storyScene.findFirst({
      where: { id: sceneId, storyId },
      select: { imageKey: true, imageStatus: true },
    });
    if (!hasReadyImage(scene)) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Cảnh này chưa có ảnh', [
        { path: 'sceneId', message: scene ? 'Cảnh chưa vẽ xong ảnh' : 'Cảnh không thuộc truyện này' },
      ]);
    }
  }
  await prisma.story.update({ where: { id: storyId }, data: { coverSceneId: sceneId ?? null } });
  return getDetail(prisma, storyId);
};

export default {
  createStory,
  getStories,
  getStoryById,
  updateStory,
  bindCharacters,
  deleteStory,
  setCover,
};
