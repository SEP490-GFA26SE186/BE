import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import eqService from './eq.service.js';

const PEDAGOGICAL_ADVICE = {
  self_awareness: {
    skill: 'Nhận thức bản thân (Self-awareness)',
    advice: 'Khuyến khích bé thường xuyên gọi tên cảm xúc (vui, buồn, tức giận, thất vọng) qua các câu hỏi mở trong sinh hoạt hằng ngày.',
    activities: ['Đọc truyện và đố bé đoán nhân vật đang cảm thấy thế nào', 'Lập góc bảng cảm xúc trong phòng ngủ'],
  },
  self_management: {
    skill: 'Tự quản lý (Self-management)',
    advice: 'Luyện tập cùng bé kỹ thuật "Dừng lại - Hít sâu thở chậm 3 nhịp" mỗi khi gặp tình huống cáu kỉnh hoặc chưa đạt ý muốn.',
    activities: ['Tạo góc bình tĩnh (Calm-down corner) với gấu bông hoặc sách tranh', 'Trò chơi đóng vai kiểm soát cơn giận'],
  },
  social_awareness: {
    skill: 'Nhận thức xã hội (Social awareness)',
    advice: 'Hướng dẫn bé quan sát nét mặt, cử chỉ của người đối diện để thấu hiểu và chia sẻ cảm xúc với bạn bè, người thân.',
    activities: ['Cùng thảo luận: "Nếu bạn bị ngã thì con nghĩ bạn sẽ cảm thấy thế nào?"', 'Khuyến khích an ủi, giúp đỡ người khác'],
  },
  relationship_skills: {
    skill: 'Kỹ năng quan hệ (Relationship skills)',
    advice: 'Dạy bé cách nói lời xin lỗi chân thành, chia sẻ đồ chơi và giải quyết mâu thuẫn bằng thỏa hiệp thay vì giằng co.',
    activities: ['Trò chơi luân phiên lượt chơi (Take turns)', 'Khen ngợi cụ thể khi bé biết nhường nhịn hoặc khen ngợi bạn bè'],
  },
  responsible_decision_making: {
    skill: 'Ra quyết định có trách nhiệm (Responsible decision-making)',
    advice: 'Tập cho bé thói quen suy nghĩ về hậu quả trước khi hành động và tự chịu trách nhiệm với những lựa chọn nhỏ của mình.',
    activities: ['Đặt câu hỏi: "Nếu con chọn phương án A thì chuyện gì sẽ xảy ra tiếp theo?"', 'Khen ngợi tinh thần tự giác dọn dẹp sau khi chơi'],
  },
};

// Thang theo gio Viet Nam, dang YYYY-MM
const toVnMonth = (date) =>
  new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);

/**
 * Get comprehensive EQ report for a child.
 * Diem nang luc (radar) tinh tren toan bo lich su tu eq_competency_stats;
 * bieu do theo thang va thong ke cam xuc truy van checkpoint_answers trong khoang ngay.
 * @param {string} parentId
 * @param {string} childId
 * @param {Object} filter - { startDate, endDate } (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
const getChildEqReport = async (parentId, childId, filter = {}) => {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId, deletedAt: null },
    include: { character: { select: { portraitImageKey: true } } },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found or access denied');
  }

  // 1. Radar: diem moi nang luc tren toan bo lich su
  const competencies = await eqService.getCompetencySummary(childId);
  const scored = competencies.filter((c) => c.hasEnoughData);
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const focusSkill = sorted[0] || null;
  const strongestSkill = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  const advice = focusSkill ? PEDAGOGICAL_ADVICE[focusSkill.caselCode] : null;
  const recommendation = advice
    ? {
        focusSkill: advice.skill,
        caselCode: focusSkill.caselCode,
        advice: advice.advice,
        suggestedActivities: advice.activities,
      }
    : null;

  // 2. Cau tra loi duoc tinh diem trong khoang ngay (chi lan choi dau, khong bo qua)
  const answeredAt = {};
  if (filter.startDate) answeredAt.gte = new Date(`${filter.startDate}T00:00:00+07:00`);
  if (filter.endDate) answeredAt.lte = new Date(`${filter.endDate}T23:59:59.999+07:00`);

  const answers = await prisma.checkpointAnswer.findMany({
    where: {
      session: { childId, isFirstPlay: true },
      skipped: false,
      ...(Object.keys(answeredAt).length > 0 && { answeredAt }),
    },
    orderBy: { answeredAt: 'asc' },
    select: {
      skillId: true,
      score: true,
      firstEmotion: true,
      answeredAt: true,
      checkpoint: { select: { type: true, answerEmotion: true } },
    },
  });

  // 3. Bieu do theo thang, theo tung nang luc
  const monthly = {};
  for (const a of answers) {
    if (!a.skillId || a.score === null) continue;
    const month = toVnMonth(a.answeredAt);
    const bucket = ((monthly[month] ||= {})[a.skillId] ||= { items: 0, scoreSum: 0 });
    bucket.items += 1;
    bucket.scoreSum += Number(a.score);
  }
  const skillById = Object.fromEntries(competencies.map((c) => [c.skillId, c]));
  const monthlyProgress = Object.entries(monthly).map(([month, bySkill]) => ({
    month,
    skills: Object.entries(bySkill).map(([skillId, b]) => ({
      skillId,
      caselCode: skillById[skillId]?.caselCode,
      nameVi: skillById[skillId]?.nameVi,
      items: b.items,
      score: Math.round((b.scoreSum / b.items) * 100),
    })),
  }));

  // 4. Cam xuc: tre nhan dien dung bao nhieu lan o lan chon dau
  const emotions = {};
  for (const a of answers) {
    const expected = a.checkpoint.answerEmotion;
    if (!expected) continue;
    const entry = (emotions[expected] ||= { emotion: expected, count: 0, correctFirstTry: 0 });
    entry.count += 1;
    if (a.firstEmotion === expected) entry.correctFirstTry += 1;
  }

  const completedStories = await prisma.playSession.count({
    where: {
      childId,
      isFirstPlay: true,
      status: 'completed',
      ...(Object.keys(answeredAt).length > 0 && { completedAt: answeredAt }),
    },
  });

  return {
    child: {
      id: child.id,
      name: child.name,
      avatar: child.character?.portraitImageKey || null,
    },
    summary: {
      totalStoriesCompleted: completedStories,
      scoredAnswers: answers.filter((a) => a.score !== null).length,
      strongestSkill: strongestSkill?.nameVi || null,
      focusSkill: focusSkill?.nameVi || null,
      minItemsForScore: eqService.MIN_ITEMS_FOR_SCORE,
    },
    radarMetrics: competencies,
    recommendation,
    emotionRecognition: Object.values(emotions),
    monthlyProgress,
  };
};

/**
 * Get platform supervision overview for Moderator / Admin
 * @returns {Promise<Object>}
 */
const getPlatformSupervisionOverview = async () => {
  const [
    totalUsers,
    totalChildren,
    totalStories,
    storiesByKind,
    totalListings,
    listingsByStatus,
    openReportsCount,
    pendingReviewsCount,
    activeStrikesCount,
    unresolvedAppealsCount,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'parent', deletedAt: null } }),
    prisma.childProfile.count({ where: { deletedAt: null } }),
    prisma.story.count({ where: { deletedAt: null } }),
    prisma.story.groupBy({
      by: ['kind'],
      _count: { _all: true },
      where: { deletedAt: null },
    }),
    prisma.listing.count(),
    prisma.listing.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.contentReport.count({ where: { status: 'open' } }),
    prisma.moderationReview.count({ where: { decision: null } }),
    prisma.creatorStrike.count({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.strikeAppeal.count({ where: { status: 'pending' } }),
  ]);

  const storyKindMap = { private: 0, published: 0 };
  storiesByKind.forEach((item) => {
    storyKindMap[item.kind] = item._count._all;
  });

  const listingStatusMap = {};
  listingsByStatus.forEach((item) => {
    listingStatusMap[item.status] = item._count._all;
  });

  return {
    usersAndChildren: {
      totalParents: totalUsers,
      totalChildren,
    },
    stories: {
      total: totalStories,
      private: storyKindMap.private,
      published: storyKindMap.published,
    },
    marketplace: {
      totalListings,
      byStatus: listingStatusMap,
    },
    moderationHealth: {
      openReports: openReportsCount,
      pendingReviews: pendingReviewsCount,
      activeStrikes: activeStrikesCount,
      unresolvedAppeals: unresolvedAppealsCount,
      needsAttention: openReportsCount > 0 || pendingReviewsCount > 0 || unresolvedAppealsCount > 0,
    },
  };
};

export default {
  getChildEqReport,
  getPlatformSupervisionOverview,
};
