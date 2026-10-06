// =============================================================================
// Seed: platform_settings cho luong sinh truyen (spec story-generation-node §5.1)
// Gia tri khop BE/ai/docs/03-story-structure.md.
//
// Phai chay sau seedTopics: updated_by tro vao moderator ma seedTopics tao.
// upsert voi update: {} — chay lai KHONG ghi de gia tri Admin da chinh.
// =============================================================================

const MODERATOR_EMAIL = 'pedagogy@storyweaver.ai';

export const platformSettingsData = [
  {
    key: 'story_layout.short',
    value: {
      pages: 6,
      checkpoints: [
        { type: 'emotion_self', after: 2 },
        { type: 'perspective', after: 3 },
        { type: 'problem_solving', after: 4 },
        { type: 'reflection', after: 6 },
      ],
    },
  },
  {
    key: 'story_layout.medium',
    value: {
      pages: 8,
      checkpoints: [
        { type: 'emotion_self', after: 2 },
        { type: 'perspective', after: 4 },
        { type: 'problem_solving', after: 5 },
        { type: 'reflection', after: 8 },
      ],
    },
  },
  {
    key: 'story_layout.long',
    value: {
      pages: 10,
      checkpoints: [
        { type: 'emotion_self', after: 2 },
        { type: 'perspective', after: 4 },
        { type: 'problem_solving', after: 6 },
        { type: 'emotion_other', after: 8 },
        { type: 'reflection', after: 10 },
      ],
    },
  },
  { key: 'limits.page_min_words', value: 20 },
  { key: 'limits.page_max_words', value: 70 },
  { key: 'limits.sentence_max_words', value: 15 },
  { key: 'limits.question_max_words', value: 15 },
  { key: 'limits.option_max_words', value: 12 },
  { key: 'limits.hint_max_words', value: 20 },
  { key: 'limits.feedback_max_words', value: 25 },
  { key: 'limits.max_scenes', value: 4 },
  { key: 'custom_limits.min_pages', value: 4 },
  { key: 'custom_limits.max_pages', value: 20 },
  { key: 'custom_limits.max_checkpoints', value: 6 },
  // tạm — câu hỏi mở §10.3 của spec
  { key: 'ai_cost.story_text', value: 1 },
];

export async function seedPlatformSettings(prisma) {
  console.log('🌱 Seeding platform_settings...');

  const moderator = await prisma.user.findUnique({ where: { email: MODERATOR_EMAIL } });
  if (!moderator) {
    throw new Error(`Không thấy ${MODERATOR_EMAIL} — seedTopics phải chạy trước seedPlatformSettings.`);
  }

  for (const { key, value } of platformSettingsData) {
    await prisma.platformSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, updatedBy: moderator.id },
    });
  }

  console.log(`✅ platform_settings done (${platformSettingsData.length} khoá).`);
}
