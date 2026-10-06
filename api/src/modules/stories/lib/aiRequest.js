// Dung payload gui ai/ /v1/story/generate (spec §7). Ham thuan, khong DB.
import { tokenizeNames } from './names.js';

const NEEDS_TARGET = new Set(['perspective', 'emotion_other']);

/** pageOrder -> 'p<pageOrder>'. */
export const labelPages = (pages) =>
  new Map(pages.map((p) => [p.pageOrder, `p${p.pageOrder}`]));

/** afterPageOrder -> 'k<i>', i tang dan theo afterPageOrder, bat dau tu 1. */
export const labelCheckpoints = (checkpoints) => {
  const sorted = [...checkpoints].sort((a, b) => a.afterPageOrder - b.afterPageOrder);
  return new Map(sorted.map((c, i) => [c.afterPageOrder, `k${i + 1}`]));
};

export const buildAiRequest = ({
  aiRequestId,
  situation,
  topic,
  characters,
  pages,
  checkpoints,
  limits,
  nameContext,
  blockedKeywords,
}) => {
  const pageLabels = labelPages(pages);
  const checkpointLabels = labelCheckpoints(checkpoints);
  const sortedPages = [...pages].sort((a, b) => a.pageOrder - b.pageOrder);
  const sortedCheckpoints = [...checkpoints].sort((a, b) => a.afterPageOrder - b.afterPageOrder);

  return {
    request_id: aiRequestId,
    topic: {
      title: topic.title,
      competency: topic.caselCode,
      guidance: topic.guidance,
    },
    characters: characters.map((c) => ({
      token: c.token,
      description: tokenizeNames(c.appearance, nameContext.nameMap),
      is_main: Boolean(c.isMain),
    })),
    situation,
    tone: 'gentle',
    pages: sortedPages.map((p) => pageLabels.get(p.pageOrder)),
    checkpoints: sortedCheckpoints.map((c) => {
      const item = {
        id: checkpointLabels.get(c.afterPageOrder),
        type: c.type,
        after: pageLabels.get(c.afterPageOrder) ?? `p${c.afterPageOrder}`,
      };
      if (NEEDS_TARGET.has(c.type) && c.targetToken) item.target = c.targetToken;
      return item;
    }),
    limits,
    forbidden_terms: [...nameContext.forbiddenTerms],
    blocked_keywords: blockedKeywords.map((k) => ({ keyword: k.keyword, severity: k.severity })),
  };
};
