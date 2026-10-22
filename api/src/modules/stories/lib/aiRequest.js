// Dung payload gui ai/ /v1/story/generate (spec §7). Ham thuan, khong DB.
import { tokenizeNames } from './names.js';
import { anchorPageOrder } from './familySkills.js';

const NEEDS_TARGET = new Set(['perspective', 'emotion_other']);

/** pageOrder -> 'p<pageOrder>'. */
export const labelPages = (pages) =>
  new Map(pages.map((p) => [p.pageOrder, `p${p.pageOrder}`]));

/** afterPageOrder -> 'k<i>', i tang dan theo afterPageOrder, bat dau tu 1. */
export const labelCheckpoints = (checkpoints) => {
  const sorted = [...checkpoints].sort((a, b) => a.afterPageOrder - b.afterPageOrder);
  return new Map(sorted.map((c, i) => [c.afterPageOrder, `k${i + 1}`]));
};

const put = (obj, key, value) => {
  if (value != null && value !== '' && !(Array.isArray(value) && !value.length)) obj[key] = value;
};

/**
 * Mau cau hoi cua Chuyen gia -> `guide` (ai-service.md). Chi gui loi dan, KHONG gui diem /
 * rationale / parent_prompts / reference_url. Reflection hoac thieu phien ban -> khong guide.
 */
export const buildGuide = (c) => {
  const v = c.version;
  if (!v || c.type === 'reflection') return null;
  const guide = { sub_skill: c.subSkillName, question_frame: v.questionFrame };
  put(guide, 'page_setup', v.pageSetup);
  if (c.type !== 'problem_solving') put(guide, 'hint_guidance', v.hintGuidance);
  if (c.type === 'emotion_self' || c.type === 'emotion_other') {
    put(guide, 'allowed_emotions', v.allowedEmotions);
  }
  if (c.type === 'perspective') {
    put(guide, 'correct_desc', v.correctDesc);
    put(guide, 'distractor_desc', v.distractorDesc);
  }
  if (c.type === 'problem_solving') {
    const roles = {};
    put(roles, 'constructive', v.constructiveDesc);
    put(roles, 'avoidant', v.avoidantDesc);
    put(roles, 'impulsive', v.impulsiveDesc);
    put(guide, 'roles', Object.keys(roles).length ? roles : null);
  }
  return guide;
};

export const buildAiRequest = ({
  aiRequestId,
  situation,
  topic,
  family = null,
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

  let topicOut = null;
  if (topic) {
    topicOut = { title: topic.title, competency: topic.caselCode, guidance: topic.guidance };
    if (topic.ageMin != null) topicOut.age_min = topic.ageMin;
    if (topic.ageMax != null) topicOut.age_max = topic.ageMax;
    if (topic.subSkills?.length) {
      topicOut.sub_skills = topic.subSkills.map((s) => ({ name: s.nameVi, description: s.descriptionVi }));
    }
  }

  // Truyen "Ke chuyen nha minh" (spec family-story A.2): topic null, tuoi o cap goc, khoi `family`
  // voi trang neo = trang ngay truoc diem dung cham thu hai (o cham cuoi neu chi 1; khong cham: trang ap cuoi).
  const familyFields = family
    ? {
      age_min: family.ageRange.ageMin,
      age_max: family.ageRange.ageMax,
      family: {
        moment: family.moment ?? null,
        seed_event: family.seedEvent ?? null,
        anchor_page: pageLabels.get(anchorPageOrder(pages, checkpoints)),
        sub_skills: (family.subSkills ?? []).map((s) => ({ name: s.nameVi, description: s.descriptionVi })),
      },
    }
    : {};

  return {
    request_id: aiRequestId,
    topic: topicOut,
    ...familyFields,
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
      const guide = buildGuide(c);
      if (guide) item.guide = guide;
      return item;
    }),
    limits,
    forbidden_terms: [...nameContext.forbiddenTerms],
    blocked_keywords: blockedKeywords.map((k) => ({ keyword: k.keyword, severity: k.severity })),
  };
};
