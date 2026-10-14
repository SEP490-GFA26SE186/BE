import { prisma } from '../../config/index.js';

// Diem do khi tre chon lan dau o cau problem_solving
const ROLE_SCORE = {
  constructive: 1,
  avoidant: 0.5,
  impulsive: 0,
};

// Nang luc CASEL co dinh theo kieu diem dung; problem_solving lay nang luc cua topic
const SKILL_CODE_BY_CHECKPOINT_TYPE = {
  emotion_self: 'self_awareness',
  emotion_other: 'social_awareness',
  perspective: 'social_awareness',
};

// Duoi nguong nay bao cao hien "chua du du lieu"
const MIN_ITEMS_FOR_SCORE = 5;

/**
 * Map casel_code -> eq_skills.id
 * @returns {Promise<Object>}
 */
const getSkillIdByCode = async () => {
  const skills = await prisma.eqSkill.findMany({ select: { id: true, caselCode: true } });
  return Object.fromEntries(skills.map((s) => [s.caselCode, s.id]));
};

/**
 * Nang luc duoc cham cho mot diem dung (snapshot vao checkpoint_answers.skill_id)
 * @param {Object} checkpoint
 * @param {string} topicSkillId
 * @param {Object} skillIdByCode
 * @returns {string|null} NULL voi reflection
 */
const resolveSkillId = (checkpoint, topicSkillId, skillIdByCode) => {
  if (checkpoint.type === 'reflection') return null;
  if (checkpoint.type === 'problem_solving') return topicSkillId;
  return skillIdByCode[SKILL_CODE_BY_CHECKPOINT_TYPE[checkpoint.type]] ?? null;
};

/**
 * Diem lan chon dau: 0 / 0.5 / 1; NULL voi reflection
 * @param {Object} checkpoint
 * @param {Object} params - { firstEmotion, firstOption }
 * @returns {number|null}
 */
const scoreFirstChoice = (checkpoint, { firstEmotion, firstOption }) => {
  switch (checkpoint.type) {
    case 'emotion_self':
    case 'emotion_other':
      return firstEmotion === checkpoint.answerEmotion ? 1 : 0;
    case 'perspective':
      return firstOption?.isCorrect ? 1 : 0;
    case 'problem_solving':
      return ROLE_SCORE[firstOption?.role] ?? 0;
    default:
      return null;
  }
};

/**
 * Tong hop diem EQ toan bo lich su cua tre tu cache eq_competency_stats
 * @param {string} childId
 * @returns {Promise<Array>} Moi nang luc CASEL mot dong, theo display_order
 */
const getCompetencySummary = async (childId) => {
  const [skills, stats] = await Promise.all([
    prisma.eqSkill.findMany({ orderBy: { displayOrder: 'asc' } }),
    prisma.eqCompetencyStat.findMany({ where: { childId } }),
  ]);
  const statBySkill = Object.fromEntries(stats.map((s) => [s.skillId, s]));

  return skills.map((skill) => {
    const stat = statBySkill[skill.id];
    const items = stat?.items ?? 0;
    const hasEnoughData = items >= MIN_ITEMS_FOR_SCORE;
    return {
      skillId: skill.id,
      caselCode: skill.caselCode,
      nameVi: skill.nameVi,
      nameEn: skill.nameEn,
      description: skill.description,
      items,
      score: items > 0 ? Math.round((Number(stat.scoreSum) / items) * 100) : null,
      hasEnoughData,
    };
  });
};

export default {
  MIN_ITEMS_FOR_SCORE,
  getSkillIdByCode,
  resolveSkillId,
  scoreFirstChoice,
  getCompetencySummary,
};
