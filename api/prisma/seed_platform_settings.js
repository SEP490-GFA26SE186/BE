// =============================================================================
// Seed: platform_settings cho luong sinh truyen (spec story-generation-node §5.1)
// Gia tri khop BE/ai/docs/03-story-structure.md. O 'scored' dien bang mau cau hoi cua ky nang con
// cua topic khi tao truyen (spec casel-pedagogy §6.1); 'reflection' khong cham.
//
// Phai chay sau seedTopics: updated_by tro vao specialist ma seedTopics tao.
// upsert voi update: {} — chay lai KHONG ghi de gia tri Admin da chinh.
// =============================================================================

const SPECIALIST_EMAIL = 'pedagogy@storyweaver.ai';

export const platformSettingsData = [
  {
    key: 'story_layout.short',
    value: {
      pages: 6,
      checkpoints: [
        { type: 'scored', after: 2 },
        { type: 'scored', after: 3 },
        { type: 'scored', after: 4 },
        { type: 'reflection', after: 6 },
      ],
    },
  },
  {
    key: 'story_layout.medium',
    value: {
      pages: 8,
      checkpoints: [
        { type: 'scored', after: 2 },
        { type: 'scored', after: 4 },
        { type: 'scored', after: 5 },
        { type: 'reflection', after: 8 },
      ],
    },
  },
  {
    key: 'story_layout.long',
    value: {
      pages: 10,
      checkpoints: [
        { type: 'scored', after: 2 },
        { type: 'scored', after: 4 },
        { type: 'scored', after: 6 },
        { type: 'scored', after: 8 },
        { type: 'reflection', after: 10 },
      ],
    },
  },
  { key: 'limits.page_min_words', value: 20 },
  { key: 'limits.page_max_words', value: 70 },
  { key: 'limits.page_target_min_words', value: 40 },
  { key: 'limits.page_target_max_words', value: 60 },
  { key: 'limits.sentence_max_words', value: 15 },
  { key: 'limits.question_max_words', value: 15 },
  { key: 'limits.option_max_words', value: 12 },
  { key: 'limits.hint_max_words', value: 20 },
  { key: 'limits.feedback_max_words', value: 25 },
  { key: 'limits.max_scenes', value: 4 },
  { key: 'custom_limits.min_pages', value: 4 },
  { key: 'custom_limits.max_pages', value: 20 },
  { key: 'custom_limits.max_checkpoints', value: 6 },
  // Credit cho một lần AI viết truyện, theo độ dài (người dùng chốt 2026-10-19: giá khác nhau theo số trang).
  { key: 'ai_cost.story_text.short', value: 1 },
  { key: 'ai_cost.story_text.medium', value: 2 },
  { key: 'ai_cost.story_text.long', value: 3 },
  // Tranh AI (2026-10-19): chân dung nhân vật 1 credit (dùng lại mãi), mỗi tranh cảnh 1 credit.
  { key: 'ai_cost.character_portrait', value: 1 },
  { key: 'ai_cost.scene_image', value: 1 },
  // Giọng đọc kể truyện (spec TTS §5.2): preset VieNeu, Node luôn gửi tường minh. Đổi giọng làm
  // lệch vân tay mọi đoạn -> các truyện phải hoàn tất lại để đọc bằng giọng mới.
  { key: 'tts.voice', value: 'Kim Thanh' },
  // Chợ truyện (người dùng chốt 2026-10-18): người bán nhận 80% giá niêm yết, doanh thu giữ 3 ngày
  // (để xử lý hoàn tiền) rồi mới rút được. Rút tối thiểu 50.000đ.
  { key: 'market.seller_share_rate', value: 0.8 },
  { key: 'market.earning_hold_days', value: 3 },
  { key: 'market.min_withdrawal_vnd', value: 50000 },
  // Hoàn tiền: phụ huynh yêu cầu trong N ngày kể từ lúc trả tiền — bằng số ngày giữ doanh thu, để tiền
  // hoàn luôn lấy lại được từ doanh thu đang chờ của người bán.
  { key: 'market.refund_window_days', value: 3 },
  // Giám sát (luồng 7): đủ 3 người khác nhau báo cáo trong 24 giờ -> tự tạm gỡ; cảnh cáo hiệu lực 90 ngày,
  // 3 cảnh cáo còn hiệu lực -> khoá tài khoản bán; mỗi tuần chọn 3 truyện đang bán để kiểm tra ngẫu nhiên.
  { key: 'moderation.report_threshold', value: 3 },
  { key: 'moderation.strike_limit', value: 3 },
  { key: 'moderation.strike_valid_days', value: 90 },
  { key: 'moderation.audit_per_week', value: 3 },
  // Báo cáo EQ theo kỹ năng con (spec sư phạm CASEL §7, Specialist sửa được): xét N câu chấm gần nhất,
  // tối thiểu min_items câu mới xếp mức; tỉ lệ < developing_from = "Đang làm quen",
  // từ developing_from đến dưới secure_from = "Đang phát triển", từ secure_from = "Vững".
  { key: 'eq_report.window', value: 5 },
  { key: 'eq_report.min_items', value: 3 },
  { key: 'eq_report.developing_from', value: 0.5 },
  { key: 'eq_report.secure_from', value: 0.8 },
];

export async function seedPlatformSettings(prisma) {
  console.log('🌱 Seeding platform_settings...');

  const specialist = await prisma.user.findUnique({ where: { email: SPECIALIST_EMAIL } });
  if (!specialist) {
    throw new Error(`Không thấy ${SPECIALIST_EMAIL} — seedTopics phải chạy trước seedPlatformSettings.`);
  }

  for (const { key, value } of platformSettingsData) {
    await prisma.platformSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, updatedBy: specialist.id },
    });
  }

  console.log(`✅ platform_settings done (${platformSettingsData.length} khoá).`);
}
