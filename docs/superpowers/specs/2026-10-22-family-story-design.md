# Thiết kế: Hai lối vào tạo truyện AI — "Chuyện mẫu" và "Kể chuyện nhà mình"

Ngày: 2026-10-22 · Trạng thái: chờ người dùng duyệt · Thay thế phần "topic + chuyện thật" của
`2026-10-20-casel-pedagogy-design.md` (các phần khác của spec đó giữ nguyên).

## 1. Vì sao làm lại

Hiện tại truyện AI bắt phụ huynh **chọn topic rồi mới kể chuyện thật** (`stories.situation`). Topic
đang gộp hai thứ khác nhau:

- **sự việc** ("tập chia sẻ đồ chơi cùng bạn") — một tình huống cụ thể chuyên gia nghĩ sẵn;
- **kỹ năng EQ** ("quan tâm cảm xúc người khác") — năng lực, áp dụng cho vô số tình huống.

Chuyện thật của gia đình hiếm khi trùng sự việc của topic, nên AI phải chọn giữa bám chuyện thật
(→ câu hỏi đo lệch kỹ năng, điểm ghi sai kỹ năng mà không ai biết) và bám topic (→ truyện gượng,
phụ huynh không nhận ra chuyện nhà mình). Mình cũng không thể có đủ topic cho mọi tình huống.

**Hướng mới (người dùng chốt):** tách sự việc khỏi kỹ năng.

- **Sự việc** là của phụ huynh (kể tự do) **hoặc** của chuyên gia (chuyện mẫu) — không trộn hai
  nguồn trong một truyện.
- **Kỹ năng** luôn là của chuyên gia: danh mục kỹ năng con CASEL + mẫu câu hỏi viết **theo kỹ năng,
  không theo sự việc**.
- **AI là cầu nối**: đọc sự việc, tìm chỗ đặt kỹ năng, viết câu hỏi bằng chi tiết của chính
  chuyện. AI không quyết định cách chấm.

Điểm nổi bật để bảo vệ: *truyện của chính con, cho con diễn tập lại đúng khoảnh khắc thật con đã
gặp khó*, mà điểm EQ vẫn truy về CASEL.

## 2. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**
- G1. Phụ huynh kể bất kỳ chuyện gì vẫn ra truyện có giá trị EQ và được chấm điểm (trừ khi họ tắt).
- G2. Mọi câu chấm điểm đo đúng kỹ năng con đã được phụ huynh xác nhận; không có xung đột
  "chuyện thật vs topic".
- G3. Chuyện mẫu vẫn có cho phụ huynh chưa biết kể gì / muốn con tập một kỹ năng cụ thể.
- G4. Chuyên gia soạn mẫu câu hỏi nhanh hơn: ít ô bắt buộc, một màn hình, nhân bản được.

**Không làm (giữ nguyên như hiện tại)**
- Cách chấm (0 / 0,5 / 1 theo phiên bản mẫu, chỉ lần chọn đầu, chỉ lượt đọc đầu), cách xếp mức,
  tham số báo cáo, radar.
- Truyện tự viết (custom), Chợ truyện, kiểm duyệt, từ khoá chặn, credit/gói.
- Danh mục kỹ năng con (danh mục chuẩn, chỉ điều chỉnh — chốt sáng 2026-10-22).

**Phản mục tiêu (làm thế này là hỏng dù chạy được)**
- AI tự đặt điểm, vai, đáp án đúng, hoặc chọn kỹ năng ngoài danh mục đang bật.
- Tên thật của gia đình đi tới AI chữ hoặc AI ảnh (vẫn token hoá `{NVx}` như hiện nay).
- Trừ credit cho bước phân tích chuyện (phụ huynh bị tính tiền khi chưa đồng ý tạo truyện).
- Phụ huynh không biết trước AI sẽ thêm tình tiết gì vào chuyện của họ.
- Truyện chuyện mẫu nhận lời kể của phụ huynh (lại sinh xung đột cũ).

## 3. Trải nghiệm phụ huynh

Màn "Sáng tác truyện mới" mở bằng 3 lựa chọn:

| Lối vào | Phụ huynh nhập | Chấm điểm |
|---|---|---|
| **Kể chuyện nhà mình** (mới, đặt đầu tiên) | lời kể, nhân vật, độ dài, ảnh/giọng đọc | có (tắt được) |
| **Chuyện mẫu** (topic cũ, đổi tên hiển thị) | chọn chuyện mẫu, nhân vật, độ dài, ảnh/giọng đọc — **không có ô lời kể** | có |
| **Tự viết** (như hiện tại) | tự viết | không |

### 3.1 Kể chuyện nhà mình

1. Phụ huynh viết lời kể (bắt buộc, 20–2000 ký tự), chọn nhân vật (như hiện nay) và độ dài
   (ngắn / vừa / dài). Ô lời kể có ví dụ gợi ý: *"Bin đang xếp lego thì em Na làm đổ, Bin hét lên
   và đẩy em ngã."*
2. Bấm **"Xem bé sẽ tập gì"** → hệ thống phân tích (mục 5). Hiện vòng chờ (có thể 10–30 giây với
   provider `claude_code`).
3. **Màn xác nhận:**

   > **Truyện của Bin:** Bin xếp lego, em Na làm đổ tháp, Bin giận và đẩy em.
   > **Bin sẽ tập:** Bình tĩnh lại khi cảm xúc mạnh · Quan tâm đến cảm xúc của người khác
   > *(Nếu có tình tiết thêm:)* **Truyện sẽ thêm:** Khủng long con bị lạc mẹ và khóc.
   >
   > **[Tạo truyện]**   [Đổi kỹ năng]   [Chỉ kể truyện, không chấm điểm]   [Sửa lời kể]

   - *Đổi kỹ năng*: chọn 1–2 kỹ năng con trong danh mục đang dùng, nhóm theo 5 năng lực, hiện tên +
     mô tả tiếng Việt. Đổi kỹ năng khi chuyện không có khoảnh khắc khó → cần phân tích lại để có
     tình tiết mới (gọi lại bước phân tích với kỹ năng phụ huynh chọn, xem 5.3).
   - *Chỉ kể truyện*: truyện không có điểm dừng chấm điểm, chỉ có câu suy ngẫm cuối truyện.
   - *Sửa lời kể*: quay lại bước 1, giữ nội dung đã nhập.
4. **[Tạo truyện]** → tạo truyện như luồng AI hiện tại (giữ credit, sinh chữ, ảnh, giọng đọc).
   Credit chỉ bị trừ từ bước này.

### 3.2 Chuyện mẫu

Như luồng AI có topic hiện nay, **bỏ ô "chuyện thật"**. Link gợi ý từ báo cáo EQ (`?topicId=`) mở
thẳng lối vào này với chuyện mẫu đã chọn.

### 3.3 Báo cáo EQ

Không đổi cách tính. Bổ sung: ở phần bằng chứng của một câu trả lời thuộc truyện "Kể chuyện nhà
mình" **có `moment_summary`**, hiện thêm một dòng tóm tắt khoảnh khắc thật (đã thay tên thật vào lại),
ví dụ *"Từ chuyện: Bin giận khi em làm đổ tháp lego."* Truyện chỉ có tình tiết AI thêm
(`seed_event`) thì **không** hiện dòng này (đó không phải chuyện phụ huynh kể). Gợi ý bài học tiếp theo vẫn trỏ tới chuyện mẫu như hiện nay.

## 4. Chuyên gia

### 4.1 Chuyện mẫu (topic) — đổi tên hiển thị, không đổi dữ liệu

Màn "Bài học" đổi nhãn thành **"Chuyện mẫu"**: vẫn là `topics` (tên, năng lực, hướng dẫn nội dung,
1–3 kỹ năng con). Trường `guidance` giờ là **cốt truyện gợi ý** cho AI (chuyên gia viết sự việc ở
đây). Tên bảng / API giữ nguyên `topics`.

### 4.2 Mẫu câu hỏi — viết theo kỹ năng, gọn form

Mẫu câu hỏi giờ dùng cho **mọi sự việc** (chuyện mẫu lẫn chuyện nhà), nên ô câu hỏi là **ý định**,
không phải câu cho bé:

- Một màn hình duy nhất cho cả tạo mới lẫn soạn phiên bản (gộp popup "Thêm mẫu" + "Soạn nội dung").
  Chọn kỹ năng con + dạng trả lời rồi soạn luôn; tên mẫu tự sinh từ ô ① nếu để trống (cắt ~60 ký tự),
  sửa được.
- Nhóm ô theo thứ tự: ① **Bé được hỏi về điều gì** (`question_frame`) → ② **Chấm thế nào** (mô tả
  đáp án / 3 vai) → ③ **Gợi ý cho phụ huynh** → ④ **Căn cứ sư phạm** → ▸ **Nâng cao** (thu gọn).
- **Bắt buộc để ban hành** (sửa `assertVersionComplete`):
  - mọi dạng: `question_frame`, `rationale`, `parent_prompts` **1–3 câu** (trước là 2–3);
  - `single_correct`: `correct_desc`, `distractor_desc`;
  - `role_choice`: 3 mô tả vai + 3 điểm hợp lệ, điểm xây dựng lớn nhất (giữ luật cũ).
- **Không còn bắt buộc**: `page_setup`, `hint_guidance` (AI tự suy ra; prompt đã yêu cầu hint).
- **Giá trị mặc định điền sẵn** trong mục Nâng cao: điểm vai 1 / 0,5 / 0; `allowed_emotions` = cả 5;
  `reference_url` = trang CASEL (`CASEL_URL`).
- Khung **xem trước**: hiện ý định câu hỏi + nhãn các lựa chọn theo vai, ghi rõ "AI sẽ viết câu cụ
  thể theo từng truyện".
- Nút **"Nhân bản"** trên mỗi mẫu: tạo mẫu mới cùng kỹ năng con và dạng, bản nháp v1 chép nội dung từ
  bản ban hành mới nhất (hoặc bản nháp nếu chưa ban hành). API mới
  `POST /question-templates/:id/duplicate`.
- Sửa lời trong seed `data/pedagogy.js` không bắt buộc; mẫu cũ vẫn hợp lệ.

### 4.3 Soát câu hỏi AI — thêm ngữ cảnh chuyện nhà

Với câu hỏi thuộc truyện "Kể chuyện nhà mình", màn Soát câu hỏi AI hiện thêm (tên đã che "Bạn A/B"):
lời kể của phụ huynh, khoảnh khắc AI tìm ra, tình tiết thêm (nếu có), và kỹ năng đến từ đâu
(khoảnh khắc / nhu cầu của bé / phụ huynh chọn). Gắn cờ vẫn loại câu khỏi điểm như hiện nay — đây
là chỗ chuyên gia bắt lỗi "AI gán sai kỹ năng".

## 5. Phân tích lời kể (bước mới)

### 5.1 API

`POST /stories/analyze` (phụ huynh). Body: `{ situation, characters, length, subSkillIds? }`
(`characters` cùng dạng `POST /stories`). Trả về:

```json
{
  "momentSummary": "Bin giận khi em Na làm đổ tháp lego",   // null nếu không có khoảnh khắc khó
  "seedEvent": null,                                        // chỉ có khi momentSummary = null
  "subSkills": [ { "id": "...", "nameVi": "...", "descriptionVi": "...", "skill": {...}, "source": "moment" } ],
  "analysisToken": "..."
}
```

- Chữ trả về đã thay token về tên thật để hiện cho phụ huynh.
- Không trừ credit. Ghi một dòng `ai_requests` loại mới `story_analysis` (`credits_charged = 0`) để
  theo dõi chi phí và giới hạn: tối đa `limits.story_analysis_per_day` lượt/phụ huynh/ngày
  (mặc định 30, trong `platform_settings`); vượt → 429 với lời tiếng Việt.
- Lời kể đi qua `tokenizeOrReject` (tên thật → `{NVx}`, từ khoá chặn) **trước** khi gửi AI, như
  `situation` hiện nay.
- Gọi đồng bộ AI service (timeout ~90 giây). Lỗi AI → 502 với lời "Chưa phân tích được, thử lại".

### 5.2 Chọn ứng viên kỹ năng (API làm, trước khi gọi AI)

- **Danh mục dùng được** = kỹ năng con `is_active` có ≥1 mẫu đang bật với phiên bản ban hành; nếu
  truyện không có nhân vật phụ thì bỏ các phiên bản `needs_target` (cùng luật `planSlots`); kỹ năng
  con nào hết phiên bản thì loại.
- **Danh sách "bé đang cần"** (dùng khi chuyện không có khoảnh khắc khó): lấy bé gắn với nhân vật
  chính (`characters.child_id`), tính mức bằng `eqLevels` hiện có; xếp ưu tiên: *Đang làm quen* →
  *chưa đủ dữ liệu* → *Đang phát triển* → *Vững*; cùng hạng thì ngẫu nhiên; lấy tối đa 5. Nhân vật
  chính không gắn bé → lấy ngẫu nhiên 5 trong danh mục dùng được.
- "Bé đang cần" được xếp **trong danh mục dùng được** (không xếp trên cả 40 mục rồi mới lọc), theo
  **mức của chính kỹ năng con** (không dùng mức năng lực).
- **Độ tuổi:** tuổi của bé gắn với nhân vật chính (tính từ `child_profiles.birth_date`); không có bé
  thì dùng 5–8. Danh mục dùng được chỉ giữ kỹ năng con có `age_min ≤ tuổi ≤ age_max`; lọc xong rỗng
  thì bỏ lọc tuổi. `$age_range` của prompt (phân tích lẫn sinh truyện) lấy từ tuổi này
  (vd "trẻ 6 tuổi"), thay cho `topic.age_min/age_max`.
- Gửi AI cả **danh mục dùng được** (mã, tên, mô tả tiếng Việt, năng lực) và **danh sách bé đang
  cần**. Không gửi mẫu câu hỏi, điểm, hay mức của bé.

### 5.3 AI service: `POST /v1/story/analyze`

Prompt mới `analyze.v1.md`. Đầu vào: lời kể (token hoá), nhân vật (token + vai trò), danh mục dùng
được, danh sách bé đang cần, và `forced_sub_skills` (khi phụ huynh đã chọn kỹ năng ở "Đổi kỹ năng").
AI làm:

1. Tìm **khoảnh khắc khó** trong lời kể: lúc nhân vật chính có cảm xúc mạnh hoặc phải chọn cách cư
   xử (giận, sợ, buồn, giành đồ, làm sai...). Có → `moment_summary` (≤ 25 tiếng, có token).
2. Chọn **1–2 kỹ năng con**:
   - có khoảnh khắc → chọn trong **danh mục dùng được** kỹ năng khớp khoảnh khắc nhất
     (`source = moment`);
   - không có → chọn trong **danh sách bé đang cần** kỹ năng nào gieo tự nhiên nhất vào chuyện
     (`source = need`), và viết `seed_event` (≤ 30 tiếng): một tình tiết nhỏ, đời thường, an toàn,
     tạo ra đúng khoảnh khắc cho kỹ năng đó;
   - có `forced_sub_skills` → dùng đúng các kỹ năng đó (`source = parent`); nếu chuyện có khoảnh
     khắc hợp thì giữ khoảnh khắc, không thì viết `seed_event` cho chúng.
3. Trả JSON `{ moment_summary, seed_event, sub_skill_codes, reasons }`. `sub_skill_codes` **có thứ
   tự: mã đầu là kỹ năng chính** — kỹ năng mà khoảnh khắc / tình tiết thêm được dựng cho. Với
   `forced_sub_skills`, kỹ năng chính là kỹ năng phụ huynh chọn đầu tiên.

**Validator** (bắt viết lại, tối đa 3 lần như luồng sinh truyện; vẫn sai → lỗi):
`sub_skill_codes` 1–2 mã, nằm trong danh sách tương ứng (moment: danh mục; need: bé đang cần;
forced: đúng danh sách ép); đúng một trong `moment_summary` / `seed_event` có giá trị (forced có
thể có `moment_summary` thay cho `seed_event`); độ dài; token chỉ dùng token đã cho; từ khoá chặn.
`reasons` chỉ để ghi log/soát, không hiện cho phụ huynh.

Provider `mock` phải trả kết quả xác định để test (vd: luôn có khoảnh khắc nếu lời kể chứa
"giận"/"sợ"/"khóc", ngược lại seed_event; chọn mã đầu danh sách).

### 5.4 `analysisToken`

Kết quả phân tích được ký (HMAC bằng secret hiện có của API, hạn 2 giờ) và gửi lại khi tạo truyện,
để `POST /stories` không phải tin `momentSummary` / `seedEvent` / nguồn kỹ năng do client gửi.
Token chứa: owner, situation đã token hoá (hash), danh sách nhân vật, `moment_summary`,
`seed_event`, `sub_skill_ids` (giữ thứ tự, đầu là kỹ năng chính) + `source`. Phụ huynh "Đổi kỹ năng" nghĩa là gọi lại analyze với
`subSkillIds` → nhận token mới.

## 6. Tạo và sinh truyện

### 6.1 `POST /stories`

Thêm trường `entry`:

- `entry = "topic"` (chuyện mẫu): như hiện nay, **bỏ `situation`** (gửi `situation` → 400).
- `entry = "family"`: bắt buộc `analysisToken` + `situation` (khớp hash trong token) +
  `characters` (khớp token); `scored` (boolean, mặc định true — false khi phụ huynh bấm "Chỉ kể
  truyện"); không có `topicId`; `length` ∈ short/medium/long.
- `length = "custom"` (tự viết): như hiện nay; `entry` mặc định `handwritten`.

Truyện `family`:
- `scored = true`: `planSlots` dùng `subSkills` = kỹ năng đã xác nhận (1–2) thay vì kỹ năng của
  topic, thêm một luật: **ô chấm thứ hai (`k2`, hoặc ô chấm cuối nếu chỉ có 1 ô) luôn lấy kỹ năng
  chính**; các ô còn lại xoay vòng trên danh sách bắt đầu từ kỹ năng chính. Nhờ vậy câu hỏi ngay sau
  khoảnh khắc đo đúng kỹ năng của khoảnh khắc đó. Kỹ năng chính không dùng được (hết phiên bản) → 422
  "phân tích lại".
- `scored = false` (Chỉ kể truyện): khung chỉ giữ các trang và điểm dừng `reflection`. Vẫn lưu và
  vẫn dùng `moment_summary` để truyện bám khoảnh khắc thật (đặt ở trang ngay trước trang cuối);
  **không** lưu `seed_event` và `story_sub_skills` (không có kỹ năng để phục vụ).
- Lưu `situation`, `moment_summary`, `seed_event` (dạng token) và `story_sub_skills` (kèm thứ tự,
  cột `position`, 1 = kỹ năng chính).
- **Khoá sau khi tạo:** với `entry = family`, `PATCH` đổi `situation` và đổi nhân vật
  (`PUT /stories/:id/characters`) trả 409 "Muốn đổi lời kể hay nhân vật, hãy tạo truyện mới" — vì
  khoảnh khắc, tình tiết và token `{NVx}` đã gắn với bản phân tích. Tiêu đề, ảnh/giọng đọc vẫn sửa
  được. Lúc `generate` không cần kiểm token lần nữa.

### 6.2 Prompt sinh truyện `story.v3`

Kế thừa `story.v2`, thay đổi:

- Phần "Bài học / Năng lực / Hướng dẫn của chuyên gia" chỉ có với `entry = topic`.
- Phần "Chuyện thật phụ huynh kể" chỉ có với `entry = family`, kèm:
  - **Khoảnh khắc chính**: "$moment" → *trang ngay trước điểm dừng chấm điểm thứ hai (`k2`) phải
    là khoảnh khắc này*; các điểm dừng khác xoay quanh diễn biến trước/sau nó.
  - **Tình tiết thêm** (khi có): "$seed_event" → đưa tình tiết này vào chuyện, trang ngay trước `k2`
    là lúc tình tiết xảy ra; phần còn lại giữ diễn biến phụ huynh kể.
  - Luật ưu tiên: *điểm dừng chấm điểm luôn đúng hướng dẫn của chuyên gia; lời kể quyết định bối
    cảnh, nhân vật, diễn biến*.
- Nếu truyện chỉ có 1 ô chấm điểm khả dụng thì "k2" thay bằng ô chấm cuối cùng (builder tính khi
  dựng payload). Truyện `scored = false`: khoảnh khắc đặt ở trang ngay trước trang cuối.
- Không đổi: bảy nguyên tắc nội dung, quy tắc cấu trúc, ràng buộc độ dài, token, JSON đầu ra,
  validator hiện có (gồm `EMOTION_NOT_ALLOWED`).

**Một prompt duy nhất `story.v3` cho mọi truyện AI**, kể cả thử lại truyện cũ: phần chuyện thật hiện
khi `situation` có giá trị (truyện topic cũ có `situation` vẫn sinh được, coi như bối cảnh bổ sung
như v2); phần khoảnh khắc / tình tiết chỉ hiện với `entry = family`. Không cần cột lưu phiên bản
prompt; `story.v2.md` giữ trong repo làm lịch sử nhưng không còn được nạp.

## 7. Dữ liệu (DBML là nguồn sự thật, migration viết tay)

```
Enum story_entry { topic, family, handwritten }
Enum story_sub_skill_source { moment, need, parent }
ai_request_type += story_analysis

stories
  + entry story_entry [not null, default: 'topic']        -- backfill: length = custom → handwritten
  + moment_summary text   [note: 'family: khoảnh khắc khó, dạng token']
  + seed_event text       [note: 'family: tình tiết AI thêm, dạng token']
  + scored boolean [not null, default: true]               -- family "chỉ kể truyện" → false
  CHECK cũ "length = custom OR topic_id IS NOT NULL" → "entry <> 'topic' OR topic_id IS NOT NULL"
  CHECK: entry = 'family' = (moment_summary IS NOT NULL OR seed_event IS NOT NULL OR NOT scored)

Table story_sub_skills {
  story_id uuid, sub_skill_id uuid, source story_sub_skill_source, position smallint (1 = kỹ năng chính)
  pk (story_id, sub_skill_id); unique (story_id, position)
  note: 'family: kỹ năng phụ huynh đã xác nhận, 1–2'
}
```

- Truyện cũ có `topic_id` + `situation`: giữ nguyên (entry = topic), vẫn đọc / chơi / báo cáo được.
- `platform_settings`: thêm `limits.story_analysis_per_day = 30`; `ai_cost.story_analysis = 0`.
- Bán truyện: truyện `family` là truyện riêng như truyện AI hiện nay; luật đăng bán không đổi.

## 8. Web

- `CreateStoryPage`: bước chọn lối vào (3 thẻ), rồi form theo lối vào; form "Kể chuyện nhà mình" có
  màn xác nhận (mục 3.1) và picker "Đổi kỹ năng". Bỏ ô chuyện thật khỏi form chuyện mẫu.
- Trình sửa truyện: truyện `family` khoá câu hỏi chấm điểm giống truyện AI có topic hiện nay.
- Báo cáo EQ: dòng "Từ chuyện: …" ở bằng chứng (mục 3.3).
- Chuyên gia: đổi nhãn "Bài học" → "Chuyện mẫu"; form mẫu câu hỏi mới + nút Nhân bản (mục 4.2);
  khung ngữ cảnh ở Soát câu hỏi AI (mục 4.3).

## 9. Kiểm thử

- API (node --test, DB test): analyze (token hoá, giới hạn ngày, 3 nguồn kỹ năng, chọn "bé đang
  cần" theo mức, token ký/hết hạn/không khớp), `POST /stories` với 3 `entry`, `scored = false`,
  CHECK mới, duplicate mẫu, luật ban hành mới, truyện cũ vẫn chơi được.
- AI (pytest): prompt analyze + validator (mã ngoài danh sách, cả hai/không trường nào, độ dài,
  token lạ), payload `story.v3` có/không seed_event, mock provider.
- Web: lint + build (không có test runner).

## 10. Builder tự quyết

Bố cục chi tiết các màn hình, lời tiếng Việt trên UI, cách hiện vòng chờ phân tích, tên file/hàm,
cách ký `analysisToken`, cách chia commit, thứ tự làm.

## 11. Các quyết định do Claude đề xuất (người dùng kiểm khi đọc)

1. Bước phân tích không trừ credit, giới hạn 30 lượt/ngày.
2. "Bé đang cần" ưu tiên Đang làm quen → chưa đủ dữ liệu → Đang phát triển → Vững.
3. Mỗi truyện chuyện nhà đo 1–2 kỹ năng (chuyện mẫu vẫn 1–3 theo topic).
4. Khoảnh khắc chính / tình tiết thêm đặt ngay trước điểm dừng chấm điểm thứ hai.
5. "Chỉ kể truyện" vẫn giữ câu suy ngẫm cuối truyện.
6. `page_setup`, `hint_guidance` không còn bắt buộc; gợi ý phụ huynh tối thiểu 1 câu.
7. Báo cáo thêm dòng "Từ chuyện: …"; Soát câu hỏi AI thêm ngữ cảnh chuyện nhà.
8. Đổi nhãn "Bài học" thành "Chuyện mẫu" nhưng giữ tên bảng/API `topics`.
9. Kỹ năng chính (mã đầu từ AI / kỹ năng phụ huynh chọn đầu) luôn ở ô chấm ngay sau khoảnh khắc.
10. Truyện chuyện nhà khoá đổi lời kể và nhân vật sau khi tạo (muốn đổi thì tạo truyện mới).
11. Độ tuổi lấy từ ngày sinh của bé (không có thì 5–8), lọc danh mục kỹ năng con theo tuổi.
12. Dòng "Từ chuyện: …" chỉ hiện khi có khoảnh khắc thật, không hiện cho tình tiết AI thêm.
13. "Chỉ kể truyện" vẫn bám khoảnh khắc thật nhưng không lưu kỹ năng / tình tiết.
14. Một prompt `story.v3` cho mọi truyện AI, kể cả thử lại truyện cũ.
15. "Bé đang cần" xếp trong danh mục dùng được, theo mức của chính kỹ năng con.

## Phụ lục A. Hợp đồng chốt để làm song song (2026-10-22)

### A.1 Web ↔ API

`POST /api/v1/stories/analyze` (parent) — body:
`{ situation: string(20..2000), characters: [{ characterId, isMain }], length: 'short'|'medium'|'long', subSkillIds?: uuid[1..2] }`
→ 200 `data`:
```
{ momentSummary: string|null, seedEvent: string|null,     // đã thay tên thật
  subSkills: [{ id, code, nameVi, descriptionVi, skill: { id, caselCode, nameVi }, source: 'moment'|'need'|'parent', position }],
  analysisToken: string, expiresAt: ISO }
```
Lỗi: 400 dữ liệu sai · 422 lời kể có từ khoá chặn / tên không thuộc nhân vật (như `situation` hiện nay) ·
429 quá lượt/ngày · 502 AI lỗi ("Chưa phân tích được, thử lại").

`GET /api/v1/sub-skills` (đã có) dùng cho picker "Đổi kỹ năng" (chỉ mục đang dùng).

`POST /api/v1/stories` thêm `entry`:
- `{ entry: 'topic', topicId, length, title, characters, useAiImage, useTts }` — gửi `situation` → 400.
- `{ entry: 'family', length, title, situation, characters, analysisToken, scored?: boolean (mặc định true), useAiImage, useTts }`.
- `length: 'custom'` như cũ (không cần `entry`; server đặt `handwritten`). Thiếu `entry` với length AI → coi là `topic`.
Response như hiện tại. Chi tiết truyện (`GET /stories/:id` và danh sách) thêm
`entry, scored, momentSummary, seedEvent, subSkills[{id,nameVi,source,position}]` (chữ đã thay tên thật).
Truyện family: `PATCH` có `situation` và `PUT /stories/:id/characters` → 409.

`POST /api/v1/question-templates/:id/duplicate` (specialist/admin) → 201, mẫu mới (cùng dạng phản hồi
`GET /question-templates` một phần tử) với bản nháp v1 chép nội dung.

Báo cáo EQ: mỗi phần tử evidence thêm `momentSummary: string|null` (đã thay tên thật; chỉ truyện family có khoảnh khắc).
Soát câu hỏi AI: mỗi phần tử thêm `family: null | { situation, momentSummary, seedEvent, source }`
(đã che tên "Bạn A/B" như câu hỏi; `source` là nguồn kỹ năng con của checkpoint đó trong `story_sub_skills`).

### A.2 API ↔ AI service (snake_case, header nội bộ như `/v1/story/generate`)

`POST /v1/story/analyze` — request (StrictModel, ForceableRequest):
```
{ request_id, situation,                          // đã token hoá {NVx}
  characters: [{ token, description, is_main }],
  age_min, age_max,
  catalog: [{ code, name, description, competency }],   // danh mục dùng được, ≥1
  needs: [code],                                   // ⊂ catalog, 0..5
  forced_sub_skills: [code],                       // ⊂ catalog, 0..2
  limits: { moment_max_words, seed_event_max_words },   // API gửi 25, 30
  forbidden_terms: [str], blocked_keywords: [{ keyword, severity }] }
```
→ `{ moment_summary: str|null, seed_event: str|null, sub_skill_codes: [str] (1..2, mã đầu = kỹ năng chính),
reasons: [str], usage, provider, model }` (các trường usage/provider/model cùng dạng response generate).
Lỗi theo bảng mã lỗi hiện có (OUTPUT_INVALID khi validator vẫn sai sau khi thử lại...).
Luật chọn mã như mục 5.3 (forced → đúng forced; có khoảnh khắc → ⊂ catalog; không → ⊂ needs, cần seed_event;
`needs` rỗng mà không có khoảnh khắc → ⊂ catalog).

`POST /v1/story/generate` — thay đổi request:
- `topic` thành tuỳ chọn (`null` với truyện family).
- thêm `age_min`, `age_max` tuỳ chọn ở cấp gốc (ưu tiên hơn topic; không có thì topic, rồi 5–8).
- thêm `family: null | { moment: str|null, seed_event: str|null, anchor_page: page_id, sub_skills: [{ name, description }] }`;
  `anchor_page` = trang ngay trước điểm dừng chấm điểm thứ hai (hoặc ô chấm cuối nếu chỉ 1 ô; truyện không chấm:
  trang áp cuối) — API tính.
- validator request: đúng một trong `topic` / `family` khác null; `anchor_page` ∈ pages.
Prompt `story.v3.md` dùng cho mọi request (mục 6.2).
