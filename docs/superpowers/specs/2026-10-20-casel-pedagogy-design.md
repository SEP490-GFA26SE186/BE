# Thiết kế: luồng sư phạm CASEL (Specialist, kỹ năng con, mẫu câu hỏi, chấm điểm, báo cáo EQ)

Ngày: 2026-10-20 · Trạng thái: bản thảo chờ duyệt · Phạm vi: `BE/api`, `BE/ai`, `Web`, `docs/db`

## 1. Vì sao làm

StoryWeaver tự nhận là dạy trí tuệ cảm xúc theo khung **CASEL 5** (Self-awareness, Self-management,
Social awareness, Relationship skills, Responsible decision-making). Hội đồng sẽ hỏi: *"Điểm EQ này
dựa trên cơ sở nào?"* Hiện hệ thống không trả lời được:

1. **Checkpoint không theo topic.** Bộ checkpoint chỉ phụ thuộc độ dài truyện
   (`ai/docs/03-story-structure.md`): truyện nào cũng có `emotion_self` (luôn chấm Self-awareness)
   và `perspective` (luôn chấm Social awareness), chỉ đúng **1** câu `problem_solving` chấm năng lực
   của topic (`api/src/modules/kid/lib/play.js` `skillCodeFor`). Phụ huynh chọn topic Self-management
   thì 2/3 câu chấm lại đo năng lực khác → rời rạc, radar lệch theo cấu trúc chứ không theo trẻ.
2. **Không có kỹ năng con.** Topic chỉ gắn 1 năng lực + một ô `guidance` tự do. CASEL định nghĩa
   mỗi năng lực bằng các kỹ năng con; hệ thống không lưu, nên không truy ngược được điểm về CASEL.
3. **AI tự quyết câu hỏi và đáp án**, không ai duyệt; luật chấm (1 / 0,5 / 0) cứng trong code.
4. **Moderator sơ sài** — mentor đã yêu cầu đổi thành **Specialist** (chuyên gia sư phạm).
5. Báo cáo hiện điểm số 0–100 cho từng năng lực — dễ bị đọc như một kết luận về đứa trẻ, trái với
   khuyến nghị của CASEL (dữ liệu SEL để hỗ trợ phát triển, không để đánh giá/xếp loại).

## 2. Mục tiêu / không làm / phản mục tiêu

**Mục tiêu**
- Mỗi điểm số truy ngược được: *câu trả lời → checkpoint → mẫu câu hỏi (phiên bản) → kỹ năng con →
  câu gốc trong khung CASEL*. AI không quyết định điểm.
- Truyện thuộc topic năng lực nào thì **mọi câu được chấm chỉ đo năng lực đó** (qua kỹ năng con
  của topic).
- Specialist soạn và quản lý toàn bộ khung sư phạm.
- Báo cáo giúp phụ huynh **biết nói chuyện với con** và **chọn topic tiếp theo**.

**Không làm**
- Phiếu quan sát hành vi do phụ huynh điền (đã cân nhắc, người dùng bỏ).
- Chấm điểm truyện tự viết.
- Specialist duyệt từng truyện riêng trước khi bé đọc (vướng quyền riêng tư + làm phụ huynh chờ).

**Phản mục tiêu** (làm vậy là hỏng dù chạy được)
- Báo cáo khẳng định bé "có/không có" một năng lực ngoài đời. Hệ thống chỉ đo **mức hiểu qua tình
  huống truyện** và phải nói rõ như vậy.
- Một kỹ năng con không trỏ về mục gốc của CASEL.
- Điểm phụ thuộc vào thứ AI tự nghĩ ra (đáp án đúng, vai của phương án) mà không theo mẫu.

## 3. Cơ sở tham chiếu (ghi vào docs/SRS)

- CASEL framework, 5 năng lực và kỹ năng con:
  https://casel.org/fundamentals-of-sel/what-is-the-casel-framework/
- SELweb (McKown) — đánh giá trực tiếp K–3 bằng tình huống minh hoạ có đọc to: nhận diện cảm xúc,
  nhìn từ góc người khác, giải quyết vấn đề xã hội, tự kiểm soát. Là chỗ dựa cho việc đo **hiểu biết**
  xã hội–cảm xúc qua tình huống: https://edinstruments.org/instruments/selweb
- Khuyến nghị dùng dữ liệu SEL để hỗ trợ, không để đánh giá/xếp loại:
  https://schoolguide.casel.org/content/uploads/sites/2/2021/06/2024.10-Sources-of-Data.docx ,
  https://learningpolicyinstitute.org/node/2621

## 4. Vai trò Specialist

Đổi tên vai trò `moderator` → `specialist` ở mọi nơi: enum `user_role`, route guard, route Web
`/moderator/*` → `/specialist/*`, nhãn UI, seed (`pedagogy@…`, `kdv@storyweaver.vn` giữ email, đổi
role), swagger, DBML, docs. Hiện có ~72 chỗ trong `api/src` và 16 file ở `Web/src`.

Các việc Specialist đang làm (duyệt truyện đăng bán, chặn AI của người dùng, thư viện nội dung,
từ khoá cấm, checklist) **giữ nguyên** — *quyết định của Claude*: mentor chỉ yêu cầu đổi tên/định
hướng chuyên môn, không yêu cầu chuyển việc.

Việc mới của Specialist:
1. Quản lý **kỹ năng con** (mục 5.1).
2. Soạn **mẫu câu hỏi** có phiên bản (mục 5.2).
3. Soạn **topic** gắn kỹ năng con (mục 5.3).
4. **Soát mẫu** checkpoint AI đã sinh, gắn cờ câu sai (mục 8).
5. Đặt **tham số báo cáo** (N câu gần nhất, ngưỡng mức) (mục 7).

## 5. Dữ liệu gốc sư phạm

### 5.1 Kỹ năng con — hai tầng

**Tầng tham chiếu CASEL — bảng mới `casel_references` (chỉ đọc).** Seed **đủ 40 mục** nguyên văn
tiếng Anh của khung CASEL (SA 9, SM 7, SoA 8, RS 9, RDM 7 — xem trang CASEL ở mục 3): id, skill_id
(FK `eq_skills`), code, text_en, display_order. Không có API ghi; chỉ đổi bằng migration/seed.

**Tầng kỹ năng con — bảng mới `eq_sub_skills`, Specialist CRUD đầy đủ** (người dùng chốt 2026-10-20):

| Cột | Ghi chú |
|---|---|
| id, skill_id (FK `eq_skills`) | thuộc đúng 1 năng lực |
| casel_reference_id (FK `casel_references`) | **bắt buộc**; mục CASEL phải cùng năng lực với `skill_id` |
| code | duy nhất |
| name_vi, description_vi | lời cho phụ huynh/AI |
| age_min, age_max | độ tuổi phù hợp |
| is_active, display_order, created_by, timestamps | |

- Specialist **tạo / sửa / tắt / xoá** kỹ năng con. Được chia nhỏ một mục CASEL thành nhiều kỹ năng
  con hợp tuổi (vd "Gọi tên cảm xúc cơ bản" và "Nhận ra dấu hiệu cơ thể của cảm xúc" cùng trỏ về
  *Identifying one's emotions*), nhưng **mỗi kỹ năng con bắt buộc trỏ về đúng một mục CASEL** — đây là
  điều kiện truy vết.
- Xoá: chỉ khi chưa có mẫu / topic / checkpoint dùng; đã dùng thì chỉ tắt (409 kèm lý do, giống luật
  topic hiện có). Đổi `casel_reference_id` / `skill_id` bị khoá khi đã có checkpoint dùng (422).
- Seed sẵn 1 kỹ năng con cho mỗi mục CASEL bật mặc định (Phụ lục A), lời Việt do Claude soạn.
  Mục CASEL không hợp lứa 5–8 (*examining prejudices and biases*, *influences of organizations and
  systems*, *evaluating institutional impacts*…) không có kỹ năng con seed.
- Trang Web Specialist: danh sách lọc theo năng lực, form tạo/sửa (chọn năng lực → chọn mục CASEL
  của năng lực đó, hiện nguyên văn tiếng Anh cạnh lời Việt).

### 5.2 Mẫu câu hỏi — bảng mới `question_templates` (có phiên bản)

Mỗi mẫu thuộc **1 kỹ năng con** và có **1 dạng trả lời** trong 3 dạng mà giao diện trẻ đã hỗ trợ:

| Dạng (`answer_format`) | Giao diện bé | Chấm lần chọn đầu |
|---|---|---|
| `emotion_pick` | chọn 1 trong 5 cảm xúc | đúng = 1, sai = 0 |
| `single_correct` | 3 phương án, 1 đúng | đúng = 1, sai = 0 |
| `role_choice` | 3 phương án theo 3 vai constructive / avoidant / impulsive | điểm từng vai **do mẫu quy định** (mặc định 1 / 0,5 / 0) |

Nội dung mẫu (Specialist soạn, tiếng Việt):
- `question_frame`: khung câu hỏi, vd "{NV1} có thể làm gì để bình tĩnh lại?".
- `page_setup`: trang ngay trước checkpoint phải dựng gì (vd "có dấu hiệu cảm xúc cụ thể, không gọi
  tên cảm xúc"). Thay cho các quy tắc cứng theo kiểu checkpoint hiện có trong `story.v1.md`.
- Với `single_correct`: mô tả phương án đúng và phương án nhiễu.
- Với `role_choice`: mô tả từng vai **trong tình huống của kỹ năng con này** + điểm từng vai.
- `needs_target`: câu hỏi có nhắm một nhân vật khác không (thay `target_token` của
  `emotion_other`/`perspective`).
- `hint_guidance` (cho `emotion_pick`, `single_correct`).
- `parent_prompts`: 2–3 câu gợi ý phụ huynh hỏi con (dùng ở báo cáo, mục 7).
- `rationale` + `reference_url`: vì sao câu này đo kỹ năng con này.

Phiên bản: bảng `question_templates` (định danh, sub_skill_id, is_active) + `question_template_versions`
(nội dung + điểm, bất biến sau khi ban hành). Sửa mẫu = tạo phiên bản mới; checkpoint đã sinh giữ
phiên bản cũ. Phiên bản có trạng thái **nháp → đã ban hành**; chỉ phiên bản đã ban hành mới được dùng
sinh truyện (mỗi mẫu dùng phiên bản ban hành mới nhất). Specialist CRUD mẫu + ban hành.
Mỗi kỹ năng con đang bật cần ≥ 1 mẫu có phiên bản đã ban hành mới gắn được vào topic.

Seed: Claude soạn 1–2 mẫu cho mỗi kỹ năng con seed, **ở trạng thái nháp** — *quyết định của Claude*
theo quy định dùng AI của môn (nội dung AI phải được người kiểm chứng): một thành viên đóng vai
Specialist đọc và ban hành. Để demo/test chạy được ngay, seed test và seed demo có cờ ban hành sẵn;
seed "thật" để nháp.

### 5.3 Topic

- Giữ: title, skill_id (1 năng lực), guidance, age_min/max, display_order, is_active.
- Thêm bảng nối `topic_sub_skills` (topic_id, sub_skill_id): **1–3 kỹ năng con, cùng năng lực với
  topic**, mỗi cái phải đang bật và có ≥ 1 mẫu đang bật.
- Luật khoá đổi năng lực khi đã có truyện (422) giữ nguyên; danh sách kỹ năng con đổi được (truyện
  cũ giữ checkpoint cũ).
- **Độ tuổi của topic gửi sang AI** (hiện prompt cứng "5–8 tuổi").
- `stories.topic_id`: bắt buộc với truyện AI (`short/medium/long`); **tuỳ chọn với `custom`**
  (chỉ để gắn nhãn / lọc ở Chợ truyện) — *quyết định của Claude*.

## 6. Sinh truyện AI và chấm điểm

### 6.1 Khung checkpoint theo topic

- Số và vị trí ô chấm vẫn theo độ dài (setting `platform_settings` hiện có): ngắn 3, vừa 3, dài 4
  ô chấm + 1 `reflection` ở cuối (không chấm). Bỏ việc gắn *kiểu* cố định vào từng vị trí.
- Backend điền mỗi ô chấm bằng **một phiên bản mẫu** thuộc kỹ năng con của topic:
  phân đều các kỹ năng con của topic (mỗi kỹ năng con ≥ 1 ô nếu đủ ô), trong mỗi kỹ năng con chọn
  một mẫu đang bật (cách chọn — ngẫu nhiên/xoay vòng — để builder).
- Gửi sang AI: topic (title, năng lực, guidance, **độ tuổi**, danh sách kỹ năng con với lời Việt),
  và với mỗi ô: `checkpoint_id`, `answer_format`, kỹ năng con, `question_frame`, `page_setup`, mô tả
  phương án/vai, `needs_target` + nhân vật được hỏi. AI **viết lời theo mẫu**, không chọn vai,
  không chọn điểm.
- Prompt lên phiên bản mới (`story.v2.md`); hợp đồng `docs/contracts/ai-service.md` và
  `ai/docs/03, 05` cập nhật. Service `ai` vẫn **không chấm điểm**.
- Kiểm cấu trúc sau khi AI trả về như hiện nay (đủ 3 phương án, đủ 3 vai mỗi vai 1 lần, đúng 1
  phương án đúng, cảm xúc thuộc 5 giá trị…).

### 6.2 Lưu checkpoint

`story_checkpoints` thêm: `sub_skill_id`, `template_version_id`, `answer_format`, `scored`
(bool), `excluded` (bool, Specialist gắn cờ) + `excluded_reason`, `excluded_by`, `excluded_at`.
Cột `type` hiện tại: giữ cho `reflection` và cho truyện tự viết, hoặc thay bằng `answer_format` —
builder chọn, miễn DBML/Prisma/migration đồng bộ.

### 6.3 Chấm

- Chỉ chấm khi: truyện AI (`short/medium/long`, kể cả bản đăng bán của truyện AI), checkpoint
  `scored = true`, `excluded = false`, lần chơi đầu, không bỏ qua, **lần chọn đầu**.
- Điểm lấy từ **phiên bản mẫu** của checkpoint (không còn `ROLE_SCORE` cứng).
- `checkpoint_answers` snapshot thêm `sub_skill_id` + `template_version_id` (cạnh `skill_id`,
  `score` hiện có).
- Thống kê theo **kỹ năng con** (bảng cache mới hoặc mở rộng `eq_competency_stats`) rồi gộp lên năng
  lực. Checkpoint bị gắn cờ sau khi bé đã trả lời → loại khỏi thống kê (tính lại cache cho các bé
  liên quan).
- Luồng gợi ý/chọn lại, phản hồi sau `role_choice`, không dấu X: giữ như hiện nay.

### 6.3b Sửa truyện AI (người dùng chốt 2026-10-20)

Với truyện AI (và bản đăng bán của nó), phụ huynh / người bán **chỉ sửa được nội dung truyện**
(chữ các trang, tiêu đề, tranh). **Mọi checkpoint bị khoá**: câu hỏi, phương án, đáp án, vai, gợi ý,
phản hồi — API trả 422 nếu cố sửa / thêm / xoá checkpoint của truyện AI; UI biên tập hiện checkpoint
ở dạng chỉ đọc kèm lời giải thích ("Câu hỏi do khung của chuyên gia quyết định"). Không có ngoại lệ
"đổi thành câu không chấm". Checkpoint của truyện tự viết vẫn sửa tự do (không chấm).

### 6.4 Truyện tự viết (`custom`)

- **Không bao giờ chấm**: không skill/score, không vào thống kê, không vào mức độ.
- Phụ huynh **chọn có đặt câu hỏi hay không**: 0 câu = truyện đọc liền mạch (đăng bán được);
  có câu hỏi thì bé vẫn dừng và trả lời, câu trả lời hiện ở phần trò chuyện của báo cáo nhưng không
  tính điểm. Giữ trình soạn checkpoint hiện có (bỏ chữ "có chấm" trong luật 0–6).

## 7. Báo cáo EQ cho phụ huynh

Mục đích: phụ huynh **biết nói chuyện với con** và **chọn topic tiếp theo**.

- **Mức độ theo kỹ năng con** thay cho điểm 0–100: "Đang làm quen / Đang phát triển / Vững", tính trên
  **N câu chấm gần nhất** của kỹ năng con đó. Mặc định *(quyết định của Claude, Specialist sửa
  được trong cài đặt)*: N = 5, tối thiểu 3 câu mới xếp mức, < 50% làm quen, 50–79% phát triển,
  ≥ 80% vững. Chưa đủ câu → "Chưa đủ dữ liệu".
- **Gộp lên năng lực** để giữ radar 5 năng lực làm phần tổng quan (năng lực không có dữ liệu hiện
  rõ "chưa có dữ liệu", không vẽ 0).
- **Bằng chứng**: bấm một kỹ năng con → các câu hỏi, truyện nào, bé chọn gì lần đầu, có cần gợi ý
  không, nguồn câu ("AI viết theo mẫu của chuyên gia"), câu gốc CASEL của kỹ năng con.
- **Gợi ý trò chuyện**: lấy `parent_prompts` của mẫu, gắn với truyện bé vừa đọc; kèm câu trả lời
  `reflection` / câu hỏi của truyện tự viết.
- **Topic gợi ý tiếp theo**: 1–3 topic đang bật, hợp tuổi bé, ưu tiên kỹ năng con/năng lực **chưa
  đủ dữ liệu** hoặc **đang làm quen**, tránh topic vừa đọc gần đây; bấm → trang tạo truyện chọn sẵn
  topic.
- Dòng ghi chú cố định: báo cáo phản ánh mức hiểu qua tình huống trong truyện, không phải đánh giá
  hành vi.
- Trang hiện có: `Web/src/pages/parent/EqJourneyPage.jsx`, `EqRadarCard` ở dashboard; API
  `GET /children/:id/eq-report`, `/eq-journey` — sửa theo cấu trúc mới.

## 8. Soát mẫu của Specialist

- Trang hàng đợi các checkpoint AI đã sinh (mới nhất trước), lọc theo năng lực / kỹ năng con / mẫu.
- Hiện: trang ngay trước checkpoint + câu hỏi + phương án + vai/đáp án, **chỉ dạng token / tên
  chung** (không tên thật, không `situation`).
- Hành động: "Ổn" hoặc "Gắn cờ" (lý do bắt buộc). Gắn cờ → `excluded = true` → điểm bị loại (mục 6.3).
  Không chặn bé đọc, không sửa nội dung truyện.
- Thống kê đơn giản theo mẫu: số đã soát, số bị cờ → giúp Specialist sửa mẫu (phiên bản mới).

## 9. Dữ liệu cũ

Đang ở giai đoạn phát triển, dữ liệu là demo. Migration thêm cột/bảng mới; checkpoint/answers cũ
không có `sub_skill_id` thì **không vào báo cáo mới**. Seed demo được viết lại để có truyện AI theo
khung mới và lịch sử trả lời đủ cho báo cáo. DB Supabase dùng chung: chỉ đọc / rollback — migration
chạy trên DB local trước (nhớ ghi đè cả `DATABASE_URL` lẫn `DIRECT_URL`).

## 9b. Các quyết định của Claude sau vòng đọc soát (người dùng kiểm lại)

- **Đáp án `emotion_pick`:** mẫu có thể giới hạn tập cảm xúc được phép (tuỳ chọn); AI chọn cảm xúc
  trong tập đó và dựng trang trước theo `page_setup`; backend kiểm cảm xúc thuộc tập; Specialist bắt
  lỗi qua soát mẫu (mục 8).
- **Radar bỏ**: thay bằng 5 thẻ năng lực, mỗi thẻ hiện mức độ (hoặc "chưa có dữ liệu") và các kỹ
  năng con bên trong. Không hiện số % cho phụ huynh. Mức năng lực = mức thấp nhất trong các kỹ năng
  con đủ dữ liệu *(builder có thể đề xuất cách gộp khác nếu có lý do)*.
- **Độ tuổi:** tuổi của kỹ năng con dùng để kiểm khi lưu topic (khoảng tuổi topic phải giao với của
  từng kỹ năng con, sai → 422). Mẫu không có tuổi. Lúc sinh truyện dùng tuổi của topic, không lọc
  thêm → không có ô thiếu mẫu.
- **Lịch sử theo tuần:** giữ biểu đồ theo tuần ở dạng mới — số câu chấm mỗi tuần theo năng lực và
  mức độ cuối mỗi tuần. Câu trả lời cũ không có `sub_skill_id` không hiện.

## 10. Phần để builder tự quyết

Tên bảng/cột cụ thể, giữ hay bỏ cột `type`, cách chọn mẫu cho ô, cấu trúc bảng cache, bố cục UI
các trang Specialist và báo cáo (theo design system hiện có), chia nhỏ công việc/commit. DBML là
nguồn sự thật, `schema.prisma` dẫn xuất; migration viết tay (không `migrate dev`).

## Phụ lục A — kỹ năng con gợi ý bật mặc định (lứa 5–8)

| Năng lực | Bật mặc định |
|---|---|
| Self-awareness | Identifying one's emotions · Linking feelings, values, and thoughts · Experiencing self-efficacy · Having a growth mindset |
| Self-management | Managing one's emotions · Identifying and using stress management strategies · Exhibiting self-discipline and self-motivation · Showing the courage to take initiative |
| Social awareness | Taking others' perspectives · Demonstrating empathy and compassion · Showing concern for the feelings of others · Understanding and expressing gratitude · Recognizing strengths in others |
| Relationship skills | Communicating effectively · Developing positive relationships · Practicing teamwork and collaborative problem-solving · Resolving conflicts constructively · Resisting negative social pressure · Seeking or offering support and help when needed |
| Responsible decision-making | Identifying solutions for personal and social problems · Anticipating and evaluating the consequences of one's actions · Demonstrating curiosity and open-mindedness · Reflecting on one's role to promote personal, family, and community well-being |
