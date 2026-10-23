// =============================================================================
// 40 muc cua khung CASEL — nguyen van tieng Anh, theo dung thu tu tren trang CASEL
// (https://casel.org/fundamentals-of-sel/what-is-the-casel-framework/), kem ban dich tieng Viet
// de hien tren giao dien (textEn van la can cu truy vet, textVi chi de doc).
// Moi muc la 1 ky nang con (1 tang, chot 2026-10-21; danh muc co dinh 2026-10-22): textEn -> eq_sub_skills.casel_text_en
// (khong sua qua API), textVi -> name_vi mac dinh cua 17 muc khong co ban soan o data/pedagogy.js.
// skill = casel_code cua eq_skills. code on dinh, la ma ky nang con (tru 23 muc co ma rieng o pedagogy.js).
// =============================================================================

export const CASEL_URL = 'https://casel.org/fundamentals-of-sel/what-is-the-casel-framework/';

// [code, textEn, textVi]
const raw = {
  self_awareness: [
    ['sa_integrating_identities', 'Integrating personal and social identities', 'Gắn kết bản sắc cá nhân và bản sắc xã hội'],
    ['sa_identifying_assets', 'Identifying personal, cultural, and linguistic assets', 'Nhận ra thế mạnh cá nhân, văn hoá và ngôn ngữ của mình'],
    ['sa_identifying_emotions', "Identifying one's emotions", 'Nhận biết cảm xúc của bản thân'],
    ['sa_honesty_integrity', 'Demonstrating honesty and integrity', 'Thể hiện sự trung thực và chính trực'],
    ['sa_linking_feelings_values_thoughts', 'Linking feelings, values, and thoughts', 'Kết nối cảm xúc, giá trị và suy nghĩ'],
    ['sa_examining_prejudices', 'Examining prejudices and biases', 'Xem xét định kiến và thiên kiến'],
    ['sa_self_efficacy', 'Experiencing self-efficacy', 'Tin vào khả năng của bản thân'],
    ['sa_growth_mindset', 'Having a growth mindset', 'Có tư duy phát triển'],
    ['sa_interests_purpose', 'Developing interests and a sense of purpose', 'Phát triển sở thích và ý thức về mục đích'],
  ],
  self_management: [
    ['sm_managing_emotions', "Managing one's emotions", 'Điều tiết cảm xúc của bản thân'],
    ['sm_stress_strategies', 'Identifying and using stress management strategies', 'Nhận biết và dùng cách giảm căng thẳng'],
    ['sm_self_discipline_motivation', 'Exhibiting self-discipline and self-motivation', 'Thể hiện tính kỷ luật và động lực tự thân'],
    ['sm_setting_goals', 'Setting personal and collective goals', 'Đặt mục tiêu cho bản thân và cho nhóm'],
    ['sm_planning_organizing', 'Using planning and organizational skills', 'Dùng kỹ năng lập kế hoạch và sắp xếp'],
    ['sm_courage_initiative', 'Showing the courage to take initiative', 'Dám chủ động bắt đầu'],
    ['sm_agency', 'Demonstrating personal and collective agency', 'Thể hiện quyền tự quyết của cá nhân và tập thể'],
  ],
  social_awareness: [
    ['soa_perspective_taking', "Taking others' perspectives", 'Đặt mình vào góc nhìn của người khác'],
    ['soa_strengths_in_others', 'Recognizing strengths in others', 'Nhận ra điểm mạnh của người khác'],
    ['soa_empathy_compassion', 'Demonstrating empathy and compassion', 'Thể hiện sự đồng cảm và lòng trắc ẩn'],
    ['soa_concern_for_feelings', 'Showing concern for the feelings of others', 'Quan tâm đến cảm xúc của người khác'],
    ['soa_gratitude', 'Understanding and expressing gratitude', 'Hiểu và bày tỏ lòng biết ơn'],
    ['soa_social_norms', 'Identifying diverse social norms, including unjust ones', 'Nhận biết các chuẩn mực xã hội khác nhau, kể cả chuẩn mực bất công'],
    ['soa_situational_demands', 'Recognizing situational demands and opportunities', 'Nhận ra yêu cầu và cơ hội của từng hoàn cảnh'],
    ['soa_organizations_systems', 'Understanding the influences of organizations and systems on behavior', 'Hiểu ảnh hưởng của tổ chức và hệ thống lên hành vi'],
  ],
  relationship_skills: [
    ['rs_communicating', 'Communicating effectively', 'Giao tiếp hiệu quả'],
    ['rs_positive_relationships', 'Developing positive relationships', 'Xây dựng mối quan hệ tích cực'],
    ['rs_cultural_competency', 'Demonstrating cultural competency', 'Ứng xử phù hợp với khác biệt văn hoá'],
    ['rs_teamwork', 'Practicing teamwork and collaborative problem-solving', 'Làm việc nhóm và cùng nhau giải quyết vấn đề'],
    ['rs_resolving_conflicts', 'Resolving conflicts constructively', 'Giải quyết xung đột một cách tích cực'],
    ['rs_resisting_pressure', 'Resisting negative social pressure', 'Không chạy theo áp lực tiêu cực từ người khác'],
    ['rs_leadership', 'Showing leadership in groups', 'Thể hiện vai trò dẫn dắt trong nhóm'],
    ['rs_support_help', 'Seeking or offering support and help when needed', 'Tìm kiếm hoặc đưa ra sự giúp đỡ khi cần'],
    ['rs_standing_up', 'Standing up for the rights of others', 'Lên tiếng bảo vệ quyền của người khác'],
  ],
  responsible_decision_making: [
    ['rdm_curiosity_open_mind', 'Demonstrating curiosity and open-mindedness', 'Thể hiện sự tò mò và cởi mở'],
    ['rdm_reasoned_judgment', 'Learning how to make a reasoned judgment after analyzing information, data, and facts', 'Học cách phán đoán có lý lẽ sau khi xem xét thông tin và sự việc'],
    ['rdm_identifying_solutions', 'Identifying solutions for personal and social problems', 'Tìm cách giải quyết vấn đề của bản thân và xã hội'],
    ['rdm_anticipating_consequences', "Anticipating and evaluating the consequences of one's actions", 'Dự đoán và đánh giá hậu quả việc mình làm'],
    ['rdm_critical_thinking', 'Recognizing how critical thinking skills are useful both inside and outside of school', 'Nhận ra tư duy phản biện có ích cả trong và ngoài trường học'],
    ['rdm_reflecting_role', "Reflecting on one's role to promote personal, family, and community well-being", 'Nghĩ về vai trò của mình trong việc vun đắp hạnh phúc cho bản thân, gia đình và cộng đồng'],
    ['rdm_evaluating_impacts', 'Evaluating personal, interpersonal, community, and institutional impacts', 'Đánh giá tác động đến bản thân, mọi người xung quanh, cộng đồng và tổ chức'],
  ],
};

// { code, skill, textEn, textVi, order } — order bat dau tu 1 trong tung nang luc
export const CASEL_REFERENCES = Object.entries(raw).flatMap(([skill, items]) =>
  items.map(([code, textEn, textVi], i) => ({ code, skill, textEn, textVi, order: i + 1 })),
);
