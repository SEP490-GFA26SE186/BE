// Dinh dang truyen tra ve client. Ham thuan, khong DB.
// Chu giu dang token {NVn}; `characters` la bang token -> ten de frontend thay khi hien thi.

const tokenNumber = (token) => Number(/\d+/.exec(token)?.[0] ?? Number.MAX_SAFE_INTEGER);
const byKey = (key) => (a, b) => a[key] - b[key];

/** Include Prisma du cho formatStoryDetail. */
export const STORY_DETAIL_INCLUDE = {
  topic: { select: { id: true, title: true, skill: { select: { caselCode: true } } } },
  storyCharacters: { include: { character: { select: { id: true, name: true } } } },
  scenes: true,
  pages: true,
  checkpoints: { include: { options: true } },
};

/** Include Prisma du cho formatStorySummary. */
export const STORY_SUMMARY_INCLUDE = {
  topic: { select: { id: true, title: true, skill: { select: { caselCode: true } } } },
  storyCharacters: { include: { character: { select: { id: true, name: true } } } },
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

const formatHeader = (story) => ({
  id: story.id,
  kind: story.kind,
  topicId: story.topicId,
  topic: story.topic
    ? { id: story.topic.id, title: story.topic.title, competency: story.topic.skill?.caselCode ?? null }
    : null,
  length: story.length,
  title: story.title,
  situation: story.situation,
  useAiImage: story.useAiImage,
  useTts: story.useTts,
  status: story.status,
  reviewedAt: story.reviewedAt,
  createdAt: story.createdAt,
  updatedAt: story.updatedAt,
  characters: formatCharacters(story.storyCharacters),
});

export function formatStoryDetail(story) {
  const pages = [...(story.pages ?? [])].sort(byKey('pageOrder'));
  const pageOrderById = new Map(pages.map((p) => [p.id, p.pageOrder]));

  return {
    ...formatHeader(story),
    scenes: [...(story.scenes ?? [])].sort(byKey('sceneOrder')).map((s) => ({
      id: s.id,
      sceneOrder: s.sceneOrder,
      description: s.description,
      imageKey: s.imageKey,
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
