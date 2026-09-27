import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';

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

/**
 * Get comprehensive EQ report for a child
 * @param {string} parentId
 * @param {string} childId
 * @param {Object} filter - { startDate, endDate }
 * @returns {Promise<Object>}
 */
const getChildEqReport = async (parentId, childId, filter = {}) => {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId, deletedAt: null },
    include: {
      characters: {
        where: { role: 'self', deletedAt: null },
        take: 1,
      },
    },
  });

  if (!child) {
    throw ApiError.notFound('Child profile not found or access denied');
  }

  // 1. Get all 5 CASEL competencies
  const allSkills = await prisma.eqSkill.findMany({
    orderBy: { displayOrder: 'asc' },
  });

  // 2. Query completed play sessions in date range
  const playSessionWhere = {
    childId,
    status: 'completed',
  };

  if (filter.startDate || filter.endDate) {
    playSessionWhere.completedAt = {};
    if (filter.startDate) playSessionWhere.completedAt.gte = new Date(filter.startDate);
    if (filter.endDate) {
      const endD = new Date(filter.endDate);
      endD.setHours(23, 59, 59, 999);
      playSessionWhere.completedAt.lte = endD;
    }
  }

  const playSessions = await prisma.playSession.findMany({
    where: playSessionWhere,
    orderBy: { completedAt: 'asc' },
    include: {
      eqScore: true,
      story: {
        select: {
          id: true,
          title: true,
          template: {
            select: {
              primarySkill: true,
              stages: {
                select: {
                  emotionToName: true,
                  learningObjective: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // 3. Compute Radar metrics
  const skillMap = {};
  allSkills.forEach((s) => {
    skillMap[s.id] = {
      skillId: s.id,
      caselCode: s.caselCode,
      nameVi: s.nameVi,
      nameEn: s.nameEn,
      description: s.description,
      score: 0,
      sessionsCount: 0,
    };
  });

  const emotionFrequencies = {};
  let totalScore = 0;

  playSessions.forEach((ps) => {
    if (ps.eqScore && skillMap[ps.eqScore.skillId]) {
      skillMap[ps.eqScore.skillId].score += ps.eqScore.scoreDelta;
      skillMap[ps.eqScore.skillId].sessionsCount += 1;
      totalScore += ps.eqScore.scoreDelta;
    }

    // Collect emotion challenges encountered
    if (ps.story?.template?.stages) {
      ps.story.template.stages.forEach((stage) => {
        if (stage.emotionToName) {
          const emotion = stage.emotionToName.trim();
          emotionFrequencies[emotion] = (emotionFrequencies[emotion] || 0) + 1;
        }
      });
    }
  });

  const skillsList = Object.values(skillMap).map((item) => ({
    ...item,
    percentage: totalScore > 0 ? Math.round((item.score / totalScore) * 100) : 20,
    rating:
      item.score >= 15
        ? 'Xuất sắc'
        : item.score >= 8
          ? 'Tốt'
          : item.score >= 3
            ? 'Đang phát triển'
            : 'Cần bồi dưỡng thêm',
  }));

  // Identify lowest and highest skill for pedagogical recommendation
  const sortedSkills = [...skillsList].sort((a, b) => a.score - b.score);
  const lowestSkill = sortedSkills[0];
  const highestSkill = sortedSkills[sortedSkills.length - 1];

  const recommendation = lowestSkill && PEDAGOGICAL_ADVICE[lowestSkill.caselCode]
    ? {
        focusSkill: PEDAGOGICAL_ADVICE[lowestSkill.caselCode].skill,
        caselCode: lowestSkill.caselCode,
        advice: PEDAGOGICAL_ADVICE[lowestSkill.caselCode].advice,
        suggestedActivities: PEDAGOGICAL_ADVICE[lowestSkill.caselCode].activities,
      }
    : null;

  // 4. Timeline progression (sessions chronologically)
  let cumulative = 0;
  const progressionTimeline = playSessions.map((ps) => {
    cumulative += ps.eqScore ? ps.eqScore.scoreDelta : 0;
    return {
      date: ps.completedAt ? ps.completedAt.toISOString().split('T')[0] : ps.createdAt.toISOString().split('T')[0],
      storyTitle: ps.story?.title || 'Truyện',
      scoreDelta: ps.eqScore?.scoreDelta || 0,
      cumulativeScore: cumulative,
    };
  });

  return {
    child: {
      id: child.id,
      name: child.name,
      avatar: child.characters?.[0]?.portraitImageKey || null,
    },
    summary: {
      totalStoriesCompleted: playSessions.length,
      totalScore,
      strongestSkill: highestSkill?.nameVi || null,
      focusSkill: lowestSkill?.nameVi || null,
    },
    radarMetrics: skillsList,
    recommendation,
    emotionTriggers: Object.entries(emotionFrequencies).map(([name, count]) => ({
      emotion: name,
      count,
    })),
    progressionTimeline,
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
