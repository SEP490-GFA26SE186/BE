-- Ban dich tieng Viet cho 40 muc CASEL (hien tren giao dien; text_en van la can cu truy vet).
-- DB chua seed (chua co dong nao) thi UPDATE khong lam gi: seed se ghi text_vi.
ALTER TABLE "casel_references" ADD COLUMN "text_vi" TEXT;

UPDATE "casel_references" c SET "text_vi" = v.text_vi
FROM (VALUES
  ('sa_integrating_identities', 'Gắn kết bản sắc cá nhân và bản sắc xã hội'),
  ('sa_identifying_assets', 'Nhận ra thế mạnh cá nhân, văn hoá và ngôn ngữ của mình'),
  ('sa_identifying_emotions', 'Nhận biết cảm xúc của bản thân'),
  ('sa_honesty_integrity', 'Thể hiện sự trung thực và chính trực'),
  ('sa_linking_feelings_values_thoughts', 'Kết nối cảm xúc, giá trị và suy nghĩ'),
  ('sa_examining_prejudices', 'Xem xét định kiến và thiên kiến'),
  ('sa_self_efficacy', 'Tin vào khả năng của bản thân'),
  ('sa_growth_mindset', 'Có tư duy phát triển'),
  ('sa_interests_purpose', 'Phát triển sở thích và ý thức về mục đích'),
  ('sm_managing_emotions', 'Điều tiết cảm xúc của bản thân'),
  ('sm_stress_strategies', 'Nhận biết và dùng cách giảm căng thẳng'),
  ('sm_self_discipline_motivation', 'Thể hiện tính kỷ luật và động lực tự thân'),
  ('sm_setting_goals', 'Đặt mục tiêu cho bản thân và cho nhóm'),
  ('sm_planning_organizing', 'Dùng kỹ năng lập kế hoạch và sắp xếp'),
  ('sm_courage_initiative', 'Dám chủ động bắt đầu'),
  ('sm_agency', 'Thể hiện quyền tự quyết của cá nhân và tập thể'),
  ('soa_perspective_taking', 'Đặt mình vào góc nhìn của người khác'),
  ('soa_strengths_in_others', 'Nhận ra điểm mạnh của người khác'),
  ('soa_empathy_compassion', 'Thể hiện sự đồng cảm và lòng trắc ẩn'),
  ('soa_concern_for_feelings', 'Quan tâm đến cảm xúc của người khác'),
  ('soa_gratitude', 'Hiểu và bày tỏ lòng biết ơn'),
  ('soa_social_norms', 'Nhận biết các chuẩn mực xã hội khác nhau, kể cả chuẩn mực bất công'),
  ('soa_situational_demands', 'Nhận ra yêu cầu và cơ hội của từng hoàn cảnh'),
  ('soa_organizations_systems', 'Hiểu ảnh hưởng của tổ chức và hệ thống lên hành vi'),
  ('rs_communicating', 'Giao tiếp hiệu quả'),
  ('rs_positive_relationships', 'Xây dựng mối quan hệ tích cực'),
  ('rs_cultural_competency', 'Ứng xử phù hợp với khác biệt văn hoá'),
  ('rs_teamwork', 'Làm việc nhóm và cùng nhau giải quyết vấn đề'),
  ('rs_resolving_conflicts', 'Giải quyết xung đột một cách tích cực'),
  ('rs_resisting_pressure', 'Không chạy theo áp lực tiêu cực từ người khác'),
  ('rs_leadership', 'Thể hiện vai trò dẫn dắt trong nhóm'),
  ('rs_support_help', 'Tìm kiếm hoặc đưa ra sự giúp đỡ khi cần'),
  ('rs_standing_up', 'Lên tiếng bảo vệ quyền của người khác'),
  ('rdm_curiosity_open_mind', 'Thể hiện sự tò mò và cởi mở'),
  ('rdm_reasoned_judgment', 'Học cách phán đoán có lý lẽ sau khi xem xét thông tin và sự việc'),
  ('rdm_identifying_solutions', 'Tìm cách giải quyết vấn đề của bản thân và xã hội'),
  ('rdm_anticipating_consequences', 'Dự đoán và đánh giá hậu quả việc mình làm'),
  ('rdm_critical_thinking', 'Nhận ra tư duy phản biện có ích cả trong và ngoài trường học'),
  ('rdm_reflecting_role', 'Nghĩ về vai trò của mình trong việc vun đắp hạnh phúc cho bản thân, gia đình và cộng đồng'),
  ('rdm_evaluating_impacts', 'Đánh giá tác động đến bản thân, mọi người xung quanh, cộng đồng và tổ chức')
) AS v(code, text_vi)
WHERE c."code" = v.code;
