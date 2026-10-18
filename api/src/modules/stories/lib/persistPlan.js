// Response AI -> ke hoach ghi DB (spec §8.3). Ham thuan, khong DB.
import { AiServiceError } from '../../../clients/aiClient.js';
import { labelPages, labelCheckpoints } from './aiRequest.js';

const ROLE_ORDER = ['constructive', 'avoidant', 'impulsive'];
const EMOTION_TYPES = new Set(['emotion_self', 'emotion_other']);
// Khop enum `emotion` trong DB. Sai/thieu o kieu cam xuc -> OUTPUT_INVALID thay vi de CHECK/enum cua DB
// nem loi (bi xep INTERNAL -> retry vo ich).
const EMOTIONS = new Set(['happy', 'sad', 'angry', 'scared', 'neutral']);

const invalid = (message) => new AiServiceError('OUTPUT_INVALID', message);

const buildOptions = (type, ck, label) => {
  if (type === 'perspective') {
    const entries = Object.entries(ck.options ?? {});
    if (!entries.length) throw invalid(`Diem dung ${label} thieu phuong an`);
    return entries.map(([optionId, text], i) => ({
      optionOrder: i + 1,
      text,
      role: null,
      isCorrect: optionId === ck.answer,
      feedback: null,
    }));
  }
  if (type === 'problem_solving') {
    const options = ck.options ?? {};
    const roles = ROLE_ORDER.filter((r) => options[r]);
    if (!roles.length) throw invalid(`Diem dung ${label} thieu phuong an`);
    return roles.map((role, i) => ({
      optionOrder: i + 1,
      text: options[role].text,
      role,
      isCorrect: null,
      feedback: options[role].feedback ?? null,
    }));
  }
  return [];
};

export const planPersist = (response, { pages, checkpoints }) => {
  const pageLabels = labelPages(pages);
  const checkpointLabels = labelCheckpoints(checkpoints);
  const sortedPages = [...pages].sort((a, b) => a.pageOrder - b.pageOrder);

  const sceneOrderByKey = new Map();
  const outPages = sortedPages.map((page) => {
    const label = pageLabels.get(page.pageOrder);
    const p = response?.pages?.[label];
    if (!p || typeof p.text !== 'string') throw invalid(`Response thieu trang ${label}`);
    const sceneKey = p.scene;
    if (response.scenes?.[sceneKey] == null) {
      throw invalid(`Trang ${label} tro toi canh khong ton tai: ${sceneKey}`);
    }
    if (!sceneOrderByKey.has(sceneKey)) sceneOrderByKey.set(sceneKey, sceneOrderByKey.size + 1);
    return { id: page.id, contentText: p.text, sceneKey };
  });

  const scenes = [...sceneOrderByKey].map(([key, sceneOrder]) => ({
    key,
    sceneOrder,
    description: response.scenes[key],
  }));

  const outCheckpoints = checkpoints.map((c) => {
    const label = checkpointLabels.get(c.afterPageOrder);
    const ck = response?.checkpoints?.[label];
    if (!ck || typeof ck.question !== 'string') throw invalid(`Response thieu diem dung ${label}`);
    if (EMOTION_TYPES.has(c.type) && !EMOTIONS.has(ck.answer)) {
      throw invalid(`Diem dung ${label} co answer cam xuc khong hop le: ${ck.answer}`);
    }
    return {
      id: c.id,
      question: ck.question,
      hint: ck.hint ?? null,
      answerEmotion: EMOTION_TYPES.has(c.type) ? ck.answer : null,
      options: buildOptions(c.type, ck, label),
    };
  });

  return { scenes, pages: outPages, checkpoints: outCheckpoints };
};
