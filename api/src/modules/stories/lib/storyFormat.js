// Dinh dang truyen tra ve client. Ham thuan, khong DB.
// Chu giu dang token {NVn}; `characters` la bang token -> ten de frontend thay khi hien thi.
// Moi `...Key` (storage) di kem `...Url` co chu ky de client hien / phat (null = chua co file).

import { assetUrl } from '../../../clients/assetUrl.js';
import { childReadiness } from './narration.js';

const tokenNumber = (token) => Number(/\d+/.exec(token)?.[0] ?? Number.MAX_SAFE_INTEGER);
const byKey = (key) => (a, b) => a[key] - b[key];

/** Include Prisma du cho formatStoryDetail. */
export const STORY_DETAIL_INCLUDE = {
  topic: { select: { id: true, title: true, skill: { select: { caselCode: true } } } },
  storyCharacters: { include: { character: { select: { id: true, name: true } } } },
  subSkills: { orderBy: { position: 'asc' }, include: { subSkill: { select: { id: true, nameVi: true } } } },
  scenes: true,
  pages: true,
  checkpoints: { include: { options: true } },
  narrationClips: { select: { segment: true, fingerprint: true, status: true } },
};

/** Include Prisma du cho formatStorySummary. */
export const STORY_SUMMARY_INCLUDE = {
  topic: { select: { id: true, title: true, skill: { select: { caselCode: true } } } },
  storyCharacters: { include: { character: { select: { id: true, name: true } } } },
  subSkills: { orderBy: { position: 'asc' }, include: { subSkill: { select: { id: true, nameVi: true } } } },
  _count: { select: { pages: true, checkpoints: true } },
};

export function formatCharacters(storyCharacters = []) {
  return [...storyCharacters]
    .sort((a, b) => tokenNumber(a.token) - tokenNumber(b.token))
    .map((sc) => ({
      token: sc.token,
      characterId: sc.characterId ?? null,
      name: sc.character?.name ?? sc.aliasName ?? null,
      isMain: sc.isMain,
    }));
}

const TOKEN_RE = /\{NV\d+\}/g;

/** Token -> ten (cung bang `characters` tra ve); chi dung cho chu "Ke chuyen nha minh" (spec A.1). */
const withNames = (text, characters) => {
  if (text == null) return null;
  const names = new Map(characters.map((c) => [c.token, c.name]));
  return text.replace(TOKEN_RE, (t) => names.get(t) ?? t);
};

const formatHeader = (story) => {
  const characters = formatCharacters(story.storyCharacters);
  return {
    id: story.id,
    kind: story.kind,
    topicId: story.topicId,
    topic: story.topic
      ? { id: story.topic.id, title: story.topic.title, competency: story.topic.skill?.caselCode ?? null }
      : null,
    length: story.length,
    entry: story.entry ?? (story.length === 'custom' ? 'handwritten' : 'topic'),
    scored: story.scored ?? true,
    title: story.title,
    situation: story.situation,
    momentSummary: withNames(story.momentSummary ?? null, characters),
    seedEvent: withNames(story.seedEvent ?? null, characters),
    subSkills: (story.subSkills ?? []).map((l) => ({ id: l.subSkillId, nameVi: l.subSkill?.nameVi ?? null, source: l.source, position: l.position })),
    useAiImage: story.useAiImage,
    useTts: story.useTts,
    status: story.status,
    reviewedAt: story.reviewedAt,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    characters,
  };
};

/**
 * `voice`: giong hien hanh (platform_settings tts.voice) — van tay cua clip tinh theo giong, nen
 * doi giong cung lam truyen thieu audio. `narration` / `readiness`: tien do giong doc va "san sang
 * cho tre" (spec TTS §5.4, §5.5).
 */
export function formatStoryDetail(story, { voice = '' } = {}) {
  const pages = [...(story.pages ?? [])].sort(byKey('pageOrder'));
  const pageOrderById = new Map(pages.map((p) => [p.id, p.pageOrder]));

  const readiness = childReadiness(story, story.narrationClips ?? [], voice);
  return {
    ...formatHeader(story),
    narration: readiness.narration,
    readiness: { ready: readiness.ready, reason: readiness.reason },
    scenes: [...(story.scenes ?? [])].sort(byKey('sceneOrder')).map((s) => ({
      id: s.id,
      sceneOrder: s.sceneOrder,
      description: s.description,
      imageKey: s.imageKey,
      imageUrl: assetUrl(s.imageKey),
      backgroundId: s.backgroundId,
      imageStatus: s.imageStatus,
    })),
    pages: pages.map((p) => ({
      id: p.id,
      pageOrder: p.pageOrder,
      sceneId: p.sceneId,
      contentText: p.contentText,
      origin: p.origin,
      audioKey: p.audioKey,
      audioUrl: assetUrl(p.audioKey),
      audioStatus: p.audioStatus,
    })),
    checkpoints: (story.checkpoints ?? [])
      .map((c) => ({
        id: c.id,
        afterPageId: c.afterPageId,
        afterPageOrder: pageOrderById.get(c.afterPageId) ?? null,
        type: c.type,
        targetToken: c.targetToken,
        question: c.question,
        answerEmotion: c.answerEmotion,
        hint: c.hint,
        origin: c.origin,
        scored: c.scored ?? false,
        // Truyen AI: cau hoi theo khung chuyen gia, phu huynh/nguoi ban khong sua; chi truyen tu viet sua duoc.
        locked: story.length !== 'custom',
        options: [...(c.options ?? [])].sort(byKey('optionOrder')).map((o) => ({
          id: o.id,
          optionOrder: o.optionOrder,
          text: o.text,
          role: o.role,
          isCorrect: o.isCorrect,
          feedback: o.feedback,
        })),
      }))
      .sort(byKey('afterPageOrder')),
  };
}

// docs/01: "Tu viet" = length custom (cau truc tu do); short/medium/long = "Viet giup toi" (AI).
const modeOf = (length) => (length === 'custom' ? 'manual' : 'ai');

export function formatStorySummary(story) {
  return {
    ...formatHeader(story),
    mode: modeOf(story.length),
    pageCount: story._count?.pages ?? 0,
    checkpointCount: story._count?.checkpoints ?? 0,
  };
}
