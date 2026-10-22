// POST /stories/analyze (spec family-story §5): phan tich loi ke "Ke chuyen nha minh" — dong bo, khong
// tru credit, gioi han luot/ngay. Ten that -> {NVx} truoc khi gui AI; chu tra ve da thay lai ten that.
// KHONG log loi ke / ten / prompt: log chi co ma loi + id.
import { randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { env, prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { AiServiceError, callAi as defaultCallAi } from '../../clients/aiClient.js';
import { AI_JOB } from '../../queues/ai.jobs.js';
import { buildNameContext, findLeftoverNames, tokenizeNames } from './lib/names.js';
import { blockedErrors, keywordIssues } from './lib/keywords.js';
import { classifyFailure } from './lib/failure.js';
import { formatErrorMessage } from './lib/generationStatus.js';
import { rankNeeds } from './lib/familySkills.js';
import { hashSituation, signAnalysisToken } from './lib/analysisToken.js';
import { loadActiveKeywords, loadChildren, resolveStoryCharacters, tokenizeOrReject } from './stories.service.js';
import { loadChildSubSkillLevels, loadMainChild, loadUsableCatalog } from './stories.family.store.js';

export const ANALYSIS_LIMIT_KEY = 'limits.story_analysis_per_day';
const DEFAULT_DAILY_LIMIT = 30;
const ANALYSIS_LIMITS = { moment_max_words: 25, seed_event_max_words: 30 };
const AI_FAILED = 'Chưa phân tích được, thử lại';
const TOKEN_RE = /\{NV\d+\}/g;

/** 0h hom nay theo gio VN. */
const vnDayStart = (now) => {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3_600_000);
};

async function loadDailyLimit(db) {
  const row = await db.platformSetting.findUnique({ where: { key: ANALYSIS_LIMIT_KEY }, select: { value: true } });
  const v = row?.value;
  return Number.isInteger(v) && v >= 0 ? v : DEFAULT_DAILY_LIMIT;
}

/** Token -> ten that (chi de hien cho chinh phu huynh). */
export const detokenizeWith = (text, storyCharacters) => {
  if (text == null) return null;
  const names = new Map(storyCharacters.map((c) => [c.token, c.name]));
  return text.replace(TOKEN_RE, (t) => names.get(t) ?? t);
};

/** Dinh dang ky nang con cho phu huynh (A.1). */
export const formatAnalysisSubSkill = (s, source, position) => ({
  id: s.id,
  code: s.code,
  nameVi: s.nameVi,
  descriptionVi: s.descriptionVi,
  skill: s.skill ? { id: s.skill.id, caselCode: s.skill.caselCode, nameVi: s.skill.nameVi } : null,
  source,
  position,
});

/**
 * Kiem tra ket qua AI (lop chan phia API; validator chinh o ai/). Sai -> AiServiceError OUTPUT_INVALID (502).
 * Tra ve { momentSummary, seedEvent, codes }.
 */
function readAiResult(body, { catalogCodes, forced, tokens, forbiddenTerms }) {
  const fail = (why) => {
    throw new AiServiceError('OUTPUT_INVALID', `API tu choi ket qua phan tich: ${why}`);
  };
  const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const momentSummary = clean(body?.moment_summary);
  const seedEvent = clean(body?.seed_event);
  if (Boolean(momentSummary) === Boolean(seedEvent)) fail('can dung mot trong moment_summary / seed_event');
  const codes = Array.isArray(body?.sub_skill_codes) ? body.sub_skill_codes : [];
  if (codes.length < 1 || codes.length > 2 || new Set(codes).size !== codes.length) fail('sub_skill_codes can 1-2 ma khac nhau');
  if (codes.some((c) => !catalogCodes.has(c))) fail('sub_skill_codes ngoai danh muc');
  if (forced.length && (codes.length !== forced.length || codes.some((c, i) => c !== forced[i]))) {
    fail('sub_skill_codes khac danh sach phu huynh chon');
  }
  for (const text of [momentSummary, seedEvent]) {
    if (!text) continue;
    if ((text.match(TOKEN_RE) ?? []).some((t) => !tokens.has(t))) fail('token la');
    if (findLeftoverNames(text, forbiddenTerms).length) fail('con ten that');
  }
  return { momentSummary, seedEvent, codes };
}

/**
 * Phan tich loi ke. `body`: { situation, characters, length, subSkillIds? } (da qua validation).
 * Tiem `callAi` / `rng` / `now` cho test. Tra ve data cua A.1.
 */
export async function analyzeStory(user, body, { callAi = defaultCallAi, rng = Math.random, now = new Date() } = {}) {
  const { situation, characters, subSkillIds = [] } = body;

  const { aiBlockedUntil } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { aiBlockedUntil: true } });
  if (aiBlockedUntil && aiBlockedUntil > now) {
    throw ApiError.forbidden('Quyền dùng AI viết truyện đang tạm khoá do nhiều lần nội dung bị chặn. Ba mẹ vẫn tự viết truyện được.');
  }

  const storyCharacters = await resolveStoryCharacters(prisma, user.id, characters);
  const children = await loadChildren(prisma, user.id);
  const nameContext = buildNameContext({ storyCharacters, children });
  const tokenized = tokenizeOrReject(situation.trim(), nameContext);

  const keywords = await loadActiveKeywords(prisma);
  const blocked = blockedErrors(keywordIssues([{ path: 'situation', text: tokenized }], keywords));
  if (blocked.length) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Lời kể có từ không phù hợp cho bé. Hãy kể lại theo cách khác.', blocked);
  }

  const [limit, used] = await Promise.all([
    loadDailyLimit(prisma),
    prisma.aiRequest.count({
      where: { userId: user.id, requestType: AI_JOB.STORY_ANALYSIS, createdAt: { gte: vnDayStart(now) }, status: { not: 'failed' } },
    }),
  ]);
  if (used >= limit) {
    throw new ApiError(StatusCodes.TOO_MANY_REQUESTS, `Hôm nay ba mẹ đã dùng hết ${limit} lượt phân tích lời kể. Hãy thử lại vào ngày mai nhé.`);
  }

  const hasSecondary = storyCharacters.some((c) => !c.isMain);
  const child = await loadMainChild(prisma, user.id, storyCharacters);
  const { catalog, ageRange } = await loadUsableCatalog(prisma, { hasSecondary, child });
  if (catalog.length === 0) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Hiện chưa có kỹ năng nào có câu hỏi dùng được. Ba mẹ thử lại sau nhé.');
  }
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const byCode = new Map(catalog.map((s) => [s.code, s]));

  const forced = subSkillIds.map((id) => byId.get(id));
  if (forced.some((s) => !s)) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Kỹ năng đã chọn hiện chưa dùng được cho truyện này (chưa có câu hỏi phù hợp). Hãy chọn kỹ năng khác.',
      [{ path: 'subSkillIds', message: 'Kỹ năng chưa dùng được' }],
    );
  }

  const levels = child ? await loadChildSubSkillLevels(prisma, child.id, catalog.map((s) => s.id)) : null;
  const needs = rankNeeds(catalog, levels, { rng });

  const appearance = await prisma.character.findMany({
    where: { id: { in: storyCharacters.map((c) => c.characterId) } },
    select: { id: true, appearance: true },
  });
  const appearanceOf = new Map(appearance.map((c) => [c.id, c.appearance]));

  const aiRequestId = randomUUID();
  const payload = {
    request_id: aiRequestId,
    situation: tokenized,
    characters: storyCharacters.map((c) => ({
      token: c.token,
      description: tokenizeNames(appearanceOf.get(c.characterId) ?? '', nameContext.nameMap),
      is_main: c.isMain,
    })),
    age_min: ageRange.ageMin,
    age_max: ageRange.ageMax,
    catalog: catalog.map((s) => ({ code: s.code, name: s.nameVi, description: s.descriptionVi, competency: s.skill.caselCode })),
    needs: needs.map((s) => s.code),
    forced_sub_skills: forced.map((s) => s.code),
    limits: ANALYSIS_LIMITS,
    forbidden_terms: [...nameContext.forbiddenTerms],
    blocked_keywords: keywords.map((k) => ({ keyword: k.keyword, severity: k.severity })),
  };

  await prisma.aiRequest.create({
    data: {
      id: aiRequestId,
      userId: user.id,
      requestType: AI_JOB.STORY_ANALYSIS,
      status: 'processing',
      creditsCharged: 0,
      attempts: 1,
      lockedAt: now,
      idempotencyKey: `${AI_JOB.STORY_ANALYSIS}:${aiRequestId}`,
    },
  });

  let result;
  let response;
  try {
    response = await callAi(AI_JOB.STORY_ANALYSIS, payload);
    result = readAiResult(response, {
      catalogCodes: new Set(byCode.keys()),
      forced: payload.forced_sub_skills,
      tokens: new Set(storyCharacters.map((c) => c.token)),
      forbiddenTerms: nameContext.forbiddenTerms,
    });
  } catch (error) {
    const { status, code, message } = classifyFailure(error, { attemptsMade: 0, maxAttempts: 1 });
    console.error(`[analyze] ai_request ${aiRequestId} that bai: ${code}`);
    await prisma.aiRequest.update({
      where: { id: aiRequestId },
      data: { status, errorMessage: formatErrorMessage(code, message), finishedAt: new Date() },
    });
    throw new ApiError(StatusCodes.BAD_GATEWAY, AI_FAILED);
  }

  const usage = response?.usage ?? {};
  await prisma.aiRequest.update({
    where: { id: aiRequestId },
    data: {
      status: 'succeeded',
      finishedAt: new Date(),
      provider: String(response?.provider ?? usage.provider ?? 'mock').slice(0, 40),
      ...((response?.model ?? usage.model) && { modelName: String(response?.model ?? usage.model).slice(0, 100) }),
      ...(Number.isInteger(usage.input_tokens) && { inputTokens: usage.input_tokens }),
      ...(Number.isInteger(usage.output_tokens) && { outputTokens: usage.output_tokens }),
      ...(Number.isInteger(usage.estimated_cost_micros) && { providerCostMicros: BigInt(usage.estimated_cost_micros) }),
    },
  });

  const source = forced.length ? 'parent' : result.momentSummary ? 'moment' : 'need';
  const chosen = result.codes.map((code) => byCode.get(code));
  const { token, expiresAt } = signAnalysisToken(
    {
      ownerId: user.id,
      situationHash: hashSituation(tokenized),
      characters,
      momentSummary: result.momentSummary,
      seedEvent: result.seedEvent,
      subSkills: chosen.map((s) => ({ id: s.id, source })),
    },
    env.jwt.secret,
    { now },
  );

  return {
    momentSummary: detokenizeWith(result.momentSummary, storyCharacters),
    seedEvent: detokenizeWith(result.seedEvent, storyCharacters),
    subSkills: chosen.map((s, i) => formatAnalysisSubSkill(s, source, i + 1)),
    analysisToken: token,
    expiresAt: expiresAt.toISOString(),
  };
}

export default { analyzeStory };
