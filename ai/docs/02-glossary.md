# 02 — Thuật ngữ

| Tiếng Việt (trong chat, tài liệu) | Trong code | Nghĩa |
|---|---|---|
| Truyện | `story` | Một truyện hoàn chỉnh gồm các trang và điểm dừng |
| Trang | `page` | Một màn hình: tranh + lời kể + giọng đọc |
| Điểm dừng | `checkpoint` | Chỗ truyện tạm dừng để hỏi trẻ một câu |
| Nhận diện cảm xúc (của nhân vật chính) | `emotion_self` | "An đang cảm thấy thế nào?" |
| Nhận diện cảm xúc (của người khác) | `emotion_other` | "Bin đang cảm thấy thế nào?" |
| Đặt mình vào vị trí người khác | `perspective` | "Vì sao Bin khóc?" |
| Giải quyết tình huống | `problem_solving` | "Nếu là An, con sẽ làm gì?" |
| Liên hệ bản thân | `reflection` | "Con đã bao giờ thấy như vậy chưa?" — không chấm |
| Vai của phương án | `role`: `constructive` / `avoidant` / `impulsive` | Xây dựng / né tránh / bốc đồng |
| Bộ 5 cảm xúc | `happy` `sad` `angry` `scared` `neutral` | Vui, buồn, giận, sợ, bình thường |
| Gợi ý | `hint` | Câu nói khi trẻ chọn sai lần đầu |
| Phản hồi | `feedback` | Câu hệ quả ngắn sau khi chọn phương án giải quyết tình huống |
| Bài học | `topic` | Chủ đề do Specialist quản lý, gắn 1 năng lực CASEL và 1–3 kỹ năng con cùng năng lực |
| Kỹ năng con | `sub_skill` (`eq_sub_skills`) | Một kỹ năng cụ thể trong 1 năng lực CASEL; **chính là một mục CASEL** (chốt 2026-10-21): `source = casel` là 40 mục gốc (câu tiếng Anh ở `casel_text_en`, tên tiếng Việt ở `name_vi`), `source = specialist` là kỹ năng chuyên gia bổ sung (câu tiếng Anh tuỳ chọn); đơn vị tính mức độ |
| Mẫu câu hỏi | `question_template` (+ `question_template_versions`) | Do Specialist soạn cho 1 kỹ năng con: khung câu hỏi, dạng trả lời (`emotion_pick` / `single_correct` / `role_choice`), điểm theo vai. Bất biến sau khi ban hành; AI chỉ viết chữ theo mẫu |
| Specialist | `role = specialist` | Chuyên gia sư phạm (trước là Moderator): soạn kỹ năng con / mẫu / bài học, đặt tham số báo cáo, soát điểm dừng, duyệt truyện đăng bán |
| Mức độ | `level`: `emerging` / `developing` / `secure` | "Đang làm quen" / "Đang phát triển" / "Vững"; tính theo kỹ năng con, mức năng lực = thấp nhất |
| Điểm dừng chấm | `checkpoint.scored = true` | Điểm dừng sinh từ mẫu (có `sub_skill_id`, `template_version_id`); điểm 0–1 chỉ lần chọn đầu. `reflection` và truyện tự viết không chấm |
| Cảnh | `scene` | Nhóm trang dùng chung một tranh |
| Chân dung | `portrait` | Ảnh nhân vật do AI vẽ, dùng làm ảnh tham chiếu |
| Token nhân vật | `{NV1}`, `{NV2}` | Thay cho tên thật khi gửi AI |
| Tên thật cấm gửi | `forbidden_terms` | Danh sách tên backend gửi để service kiểm tra |
| Tiếng | `word` trong code | Đơn vị đếm độ dài; tiếng Việt tách tiếng bằng khoảng trắng |
| Viết giúp tôi / Tự viết | `mode`: `ai` / `manual` | Hai chế độ tạo truyện (backend) |
| Độ dài | `length`: `short` / `medium` / `long` / `custom` | Ba mức đầu cho truyện AI viết; `custom` cho truyện tự viết |
| Năng lực CASEL | `competency` | `self_awareness`, `self_management`, `social_awareness`, `relationship_skills`, `responsible_decision_making` |
