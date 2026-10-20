# Luồng sư phạm CASEL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Điểm EQ truy ngược được về CASEL: Specialist quản lý kỹ năng con + mẫu câu hỏi có phiên bản; truyện AI sinh checkpoint theo mẫu của đúng năng lực topic; chấm theo mẫu; báo cáo theo mức độ kèm bằng chứng, gợi ý trò chuyện, gợi ý topic.

**Architecture:** Dữ liệu sư phạm mới (`casel_references` → `eq_sub_skills` → `question_templates`/`_versions`, `topic_sub_skills`) trong Postgres (DBML là nguồn sự thật). Backend xếp mỗi ô chấm của khung truyện thành một **phiên bản mẫu**, gửi "guide" sang service `ai`; service chỉ viết lời. Mẫu quy định *dạng trả lời*, ánh xạ về `checkpoint_type` cũ nên giao diện trẻ và output AI giữ nguyên hình dạng. Mức độ báo cáo tính lúc đọc từ `checkpoint_answers` (bỏ cache `eq_competency_stats`).

**Tech Stack:** Node 20 ESM · Express 5 · Prisma 6.19 · zod · `node --test` · Python 3.12 FastAPI + pydantic + pytest · React + Vite + react-query + Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-20-casel-pedagogy-design.md` (đọc kèm; plan chỉ ghi các quyết định spec bỏ ngỏ).

## Global Constraints

- DBML `docs/db/schema_rev8.dbml` là nguồn sự thật; `api/prisma/schema.prisma` dẫn xuất; migration **viết tay** trong `api/prisma/migrations/<timestamp>_<name>/migration.sql`, timestamp tiếp sau `20261023000000`. Không `prisma migrate dev`.
- Áp migration local trên **cả hai** DB, ghi đè cả hai biến (bẫy `DIRECT_URL`):
  `U=postgresql://storyweaver:storyweaver@localhost:5432/<db>?schema=public; DATABASE_URL=$U DIRECT_URL=$U npx prisma migrate deploy` với `<db>` = `storyweaver` và `storyweaver_test`. **Không** chạy lên Supabase.
- Test API: `cd api && TEST_DATABASE_URL=postgresql://storyweaver:storyweaver@localhost:5432/storyweaver_test?schema=public npm test`. Mốc hiện tại 383/385; 2 test fail có sẵn ("PUT /stories/:id/characters…", "Route editor/generation … 501") — không được tăng số fail.
- Test `ai`: `cd ai && .venv/Scripts/python -m pytest` (mốc 525 pass).
- Web không có test runner: kiểm bằng `npm run lint`, `npm run build` và chạy thử trên trình duyệt (Playwright, context riêng, script trong `D:\sep490\.playwright-mcp\`).
- Comment trong `api/` viết tiếng Việt không dấu theo file xung quanh; trong `ai/` comment/log tiếng Anh; chữ hiển thị/nội dung tiếng Việt có dấu.
- Không log tên thật, không gửi tên thật sang AI (giữ cơ chế token `{NVx}` hiện có).
- Commit + push từng task; message tiếng Việt không dấu; **không** có dòng `Co-Authored-By`. BE nhánh `feature/ai-core`, Web nhánh `feature/integration`.
- Ngưỡng báo cáo mặc định (spec §7): N = 5 câu gần nhất, tối thiểu 3 câu, < 50% "Đang làm quen", 50–79% "Đang phát triển", ≥ 80% "Vững".
- Mỗi topic 1–3 kỹ năng con cùng năng lực; mỗi kỹ năng con trỏ đúng 1 mục CASEL cùng năng lực.

## Review Focus

1. Topic có kỹ năng con mà mẫu của nó cần nhân vật phụ (`needs_target`) nhưng truyện chỉ có 1 nhân vật → chọn mẫu khác của cùng kỹ năng con; không còn mẫu nào → 422 rõ ràng trước khi trừ credit (test ở Task 9).
2. Specialist tắt kỹ năng con / mẫu đang được topic dùng → topic không còn mẫu ban hành → tạo truyện AI với topic đó trả 422 thay vì 500 (test ở Task 9).
3. Gắn cờ một checkpoint sau khi bé đã trả lời → câu đó biến mất khỏi mức độ và bằng chứng ngay lần đọc báo cáo kế tiếp (test ở Task 14).
4. Phụ huynh cố `PUT` checkpoint của truyện AI qua API (bỏ qua UI) → 422, dữ liệu không đổi (test ở Task 12).
5. Bé chơi lại truyện (lượt thứ hai) hoặc đọc truyện tự viết → không có điểm, không lọt vào mức độ (test ở Task 13).

---

## Phase A — Đổi vai trò Moderator → Specialist

### Task 1: Đổi role ở BE

**Files:**
- Create: `api/prisma/migrations/20261024000000_role_specialist/migration.sql`
- Modify: `docs/db/schema_rev8.dbml` (enum `user_role`), `api/prisma/schema.prisma`, mọi `authorize('moderator'…)` / `'moderator'` trong `api/src` (~72 chỗ — `grep -rn "moderator" api/src`), `api/prisma/seed*.js`, `api/src/docs/**`, `api/tests/**`
- Rename: `api/tests/integration/moderator.test.js` → `specialist.test.js`

**Interfaces:** Produces: role string `'specialist'` (thay `'moderator'` ở JWT, `req.user.role`, `authorize(...)`).

- [ ] **Step 1:** Sửa test trước: thay `createUser({ role: 'moderator' })` → `'specialist'` trong mọi test; chạy test → FAIL (enum chưa có giá trị).
- [ ] **Step 2:** Migration: `ALTER TYPE "user_role" RENAME VALUE 'moderator' TO 'specialist';` Cập nhật DBML + Prisma enum. Áp lên 2 DB local.
- [ ] **Step 3:** Thay toàn bộ chuỗi role trong `api/src`, seed, swagger (tag/mô tả "Moderator" → "Specialist (chuyên gia sư phạm)"). Tên biến nội bộ như `MANAGERS` giữ. Comment đổi "Moderator" → "Specialist".
- [ ] **Step 4:** Chạy test API → về đúng mốc (chỉ 2 fail có sẵn). `npx prisma generate` không lỗi.
- [ ] **Step 5:** Commit `doi role moderator thanh specialist (chuyen gia su pham) theo yeu cau mentor`.

### Task 2: Đổi role ở Web

**Files:**
- Modify: `Web/src/constants/roles.js`, `Web/src/constants/routes.js` (`MODERATOR` → `SPECIALIST`, `/moderator` → `/specialist`), `Web/src/routes/AppRoutes.jsx`, `Web/src/layouts/ModeratorLayout.jsx` → rename `SpecialistLayout.jsx`, `Web/src/hooks/useModerator.js` → `useSpecialist.js`, `Web/src/services/moderatorService.js` → `specialistService.js`, `Web/src/pages/moderator/` → `pages/specialist/`, `Web/src/components/moderator/` → `components/specialist/`, các file admin nhắc role (`AccountsPage.jsx`, `AuditLogsPage.jsx`, `adminService.js`, `ComingSoonPage.jsx`).
- Nhãn UI: badge "MOD" → "CG", subtitle "Kiểm duyệt" → "Chuyên gia sư phạm".

- [ ] **Step 1:** Đổi tên file/thư mục bằng `git mv`, sửa import; giữ redirect `/moderator/*` → `/specialist/*` trong `AppRoutes.jsx` (link cũ không gãy).
- [ ] **Step 2:** `npm run lint` và `npm run build` sạch.
- [ ] **Step 3:** Chạy app, đăng nhập `kdv@storyweaver.vn` / `123456` → vào `/specialist`, menu đầy đủ; mở `/moderator/topics` → tự sang `/specialist/topics`.
- [ ] **Step 4:** Commit Web `doi role moderator thanh specialist`.

---

## Phase B — Dữ liệu gốc sư phạm

### Task 3: Schema sư phạm

**Files:**
- Create: `api/prisma/migrations/20261025000000_pedagogy_master_data/migration.sql`
- Modify: `docs/db/schema_rev8.dbml`, `api/prisma/schema.prisma`, `docs/db/schema-guide.md`

**Bảng / cột (tên chốt ở đây; kiểu theo quy ước DBML hiện có):**

| Bảng | Cột |
|---|---|
| `casel_references` | `id uuid pk`, `skill_id → eq_skills` not null, `code varchar(60) unique`, `text_en text not null`, `display_order int` |
| `eq_sub_skills` | `id`, `skill_id → eq_skills` not null, `casel_reference_id → casel_references` not null, `code varchar(60) unique`, `name_vi varchar(200)`, `description_vi text`, `age_min int default 5`, `age_max int default 8`, `is_active bool default true`, `display_order int default 0`, `created_by → users`, `created_at`, `updated_at`. CHECK `age_min <= age_max`. Trigger/check ứng dụng: reference cùng `skill_id` (kiểm ở service, Task 5) |
| enum `answer_format` | `emotion_pick`, `single_correct`, `role_choice` |
| enum `template_status` | `draft`, `published` |
| `question_templates` | `id`, `sub_skill_id → eq_sub_skills` not null, `title varchar(200)` (tên nội bộ), `answer_format` not null, `is_active bool default true`, `created_by`, `created_at`, `updated_at` |
| `question_template_versions` | `id`, `template_id → question_templates` not null, `version int`, `status template_status default draft`, `question_frame text`, `page_setup text`, `needs_target bool default false`, `allowed_emotions emotion[]` (chỉ emotion_pick; rỗng = cả 5), `correct_desc text`, `distractor_desc text` (single_correct), `constructive_desc`, `avoidant_desc`, `impulsive_desc text` + `constructive_score`, `avoidant_score`, `impulsive_score numeric(3,2)` (role_choice), `hint_guidance text`, `parent_prompts text[]`, `rationale text`, `reference_url varchar(500)`, `created_by`, `created_at`, `published_by`, `published_at`. UNIQUE `(template_id, version)`; partial unique `(template_id) WHERE status = 'draft'` (tối đa 1 nháp) |
| `topic_sub_skills` | `topic_id → topics`, `sub_skill_id → eq_sub_skills`, PK `(topic_id, sub_skill_id)` |
| `story_checkpoints` + | `sub_skill_id → eq_sub_skills` null, `template_version_id → question_template_versions` null, `scored bool not null default false`, `excluded bool not null default false`, `excluded_reason text`, `excluded_by → users`, `excluded_at timestamptz`, `reviewed_ok_at timestamptz`, `reviewed_ok_by → users` |
| `checkpoint_answers` + | `sub_skill_id → eq_sub_skills` null, `template_version_id → question_template_versions` null |
| `stories` | `topic_id` thành **nullable**; CHECK `length = 'custom' OR topic_id IS NOT NULL` |
| `story_checkpoints` CHECK | đổi `type IN (emotion_other, perspective) = (target_token IS NOT NULL)` thành `(type = 'emotion_other') <= (target_token IS NOT NULL)` và `type NOT IN ('emotion_self','problem_solving','reflection') OR target_token IS NULL` (perspective/single_correct được có hoặc không có target) |
| bỏ | `eq_competency_stats` (DROP TABLE; mức độ tính lúc đọc — Task 14) |
| `platform_settings` | `UPDATE` 3 khoá `story_layout.*`: mọi `type` khác `reflection` → `"scored"` (giữ `after`) |

Mọi FK tới dữ liệu sư phạm `ON DELETE RESTRICT`.

- [ ] **Step 1:** Viết DBML + Prisma (quan hệ hai chiều, tên model `CaselReference`, `EqSubSkill`, `QuestionTemplate`, `QuestionTemplateVersion`, `TopicSubSkill`), migration SQL khớp. Xoá model `EqCompetencyStat`.
- [ ] **Step 2:** Áp migration 2 DB local; `npx prisma generate`.
- [ ] **Step 3:** Chạy test API — các test đụng `eqCompetencyStat` (kid.test.js:77) sẽ fail; đánh dấu `todo` kèm ghi chú "Task 13" để không chặn, mốc còn lại không đổi.
- [ ] **Step 4:** Commit `schema su pham: casel_references, eq_sub_skills, question_templates + versions, topic_sub_skills, cot truy vet checkpoint/answer, bo eq_competency_stats`.

### Task 4: Seed dữ liệu sư phạm

**Files:**
- Create: `api/prisma/data/casel.js` (40 mục CASEL: `{ code, skill: caselCode, textEn, order }` — nguyên văn trang CASEL, spec §3), `api/prisma/data/pedagogy.js` (kỹ năng con + mẫu), `api/prisma/seed_pedagogy.js` (`export async function seedPedagogy(prisma, { publish })`)
- Modify: `api/prisma/seed.js` (gọi sau `seedEqSkills`, trước `seedTopics`), `api/prisma/seed_topics.js` (gắn `topic_sub_skills` cho 5 topic có sẵn), `api/prisma/seed_platform_settings.js` (layout mới + khoá báo cáo), `api/tests/lib/seedDemo.test.js` hoặc test mới `api/tests/lib/pedagogySeed.test.js`

**Nội dung:**
- `casel.js`: đủ 9/7/8/9/7 mục.
- `pedagogy.js`: 1 kỹ năng con cho mỗi mục ở Phụ lục A của spec (23 mục), lời Việt, tuổi 5–8. Mỗi kỹ năng con 1–2 mẫu; dạng trả lời hợp kỹ năng (vd *Identifying one's emotions* → `emotion_pick`; *Taking others' perspectives* → `single_correct` + `needs_target`; *Managing one's emotions* → `role_choice` điểm 1/0.5/0; *Seeking or offering support…* → `role_choice` với tránh = 0.5). Mỗi phiên bản có `parent_prompts` 2–3 câu, `rationale`, `reference_url` = trang CASEL.
- `seedPedagogy(prisma, { publish })`: idempotent (upsert theo `code` / theo `(template title, sub_skill)`), không ghi đè bản Specialist đã sửa. `publish: true` → phiên bản 1 ở trạng thái `published`; `false` → `draft`. `seed.js` gọi với `publish: process.env.SEED_PUBLISH_PEDAGOGY !== 'false'` (mặc định ban hành để test/demo chạy; spec §5.2 — bản "thật" chạy với biến `false`).
- `seed_platform_settings.js`: layout `{ pages, checkpoints: [{ type: 'scored', after }, …, { type: 'reflection', after }] }` cùng vị trí cũ; thêm `eq_report.window = 5`, `eq_report.min_items = 3`, `eq_report.developing_from = 0.5`, `eq_report.secure_from = 0.8`.

- [ ] **Step 1: Test** `pedagogySeed.test.js` (unit, không DB): `casel.js` có đúng 40 mục, đếm theo năng lực `{self_awareness: 9, self_management: 7, social_awareness: 8, relationship_skills: 9, responsible_decision_making: 7}`; mỗi kỹ năng con trong `pedagogy.js` trỏ `caselCode` tồn tại và cùng năng lực; mỗi mẫu `role_choice` có đủ 3 mô tả + 3 điểm trong [0,1]; mỗi mẫu có 2–3 `parentPrompts`. Chạy → FAIL.
- [ ] **Step 2:** Viết dữ liệu + `seedPedagogy`. Test PASS.
- [ ] **Step 3:** `npm run db:seed` trên `storyweaver_test` và `storyweaver` (ghi đè `DATABASE_URL`/`DIRECT_URL` như Global Constraints) chạy hai lần liền không lỗi, không nhân bản dòng.
- [ ] **Step 4:** Commit `seed su pham: 40 muc CASEL, 23 ky nang con, mau cau hoi, layout o cham, tham so bao cao`.

### Task 5: API kỹ năng con (Specialist CRUD)

**Files:**
- Create: `api/src/modules/sub-skills/{sub-skills.routes,controller,service,validation}.js`, `api/src/modules/eq-skills/` thêm `GET /eq-skills/casel-references`, `api/tests/integration/subSkills.test.js`, swagger paths
- Modify: `api/src/routes/v1/index.js` (mount `/sub-skills`)

**Interfaces — Produces:**
- `GET /eq-skills/casel-references?skillId` → `[{ id, skillId, code, textEn, displayOrder }]` (auth bất kỳ).
- `GET /sub-skills?skillId&isActive&search` → `[{ id, skillId, skill:{caselCode,nameVi}, caselReference:{id,code,textEn}, code, nameVi, descriptionVi, ageMin, ageMax, isActive, displayOrder, templatesCount, publishedTemplatesCount, topicsCount, checkpointsCount }]`. Phụ huynh: chỉ `isActive`, không kèm các count.
- `POST /sub-skills` (specialist/admin) body `{ skillId, caselReferenceId, code?, nameVi, descriptionVi, ageMin?, ageMax?, displayOrder?, isActive? }` → 201. `code` thiếu thì sinh từ `caselReference.code` + hậu tố.
- `PUT /sub-skills/:id`, `DELETE /sub-skills/:id`.

**Luật (service):** reference phải cùng `skillId` → 400; `ageMin <= ageMax` → 400; đã có checkpoint dùng thì đổi `skillId`/`caselReferenceId` → 422; xoá khi có mẫu/topic/checkpoint dùng → 409 kèm thông điệp "đã có … dùng, chỉ tắt được"; `code` trùng → 409.

- [ ] **Step 1: Test** (integration, theo mẫu `specialist.test.js`): phụ huynh POST → 403; reference khác năng lực → 400; tạo OK → 201 có `caselReference.textEn`; xoá kỹ năng con đã gắn topic → 409; tắt OK; phụ huynh GET không thấy bản tắt. Chạy → FAIL.
- [ ] **Step 2:** Viết module theo khuôn `topics` (zod, `catchAsync`, `ApiResponse`, `ApiError`). PASS.
- [ ] **Step 3:** Swagger thêm 5 path; test `routesRev8.test.js` (nếu liệt kê route) cập nhật.
- [ ] **Step 4:** Commit `api ky nang con: CRUD cho specialist, bat buoc tro ve muc CASEL cung nang luc`.

### Task 6: API mẫu câu hỏi có phiên bản

**Files:**
- Create: `api/src/modules/question-templates/{routes,controller,service,validation}.js`, `api/src/modules/question-templates/lib/templateRules.js`, `api/tests/lib/templateRules.test.js`, `api/tests/integration/questionTemplates.test.js`

**Interfaces — Produces:**
- `templateRules.js`: `assertVersionComplete(format, version) -> void` (ném 422 liệt kê trường thiếu); `checkpointTypeFor(format, needsTarget) -> 'emotion_self'|'emotion_other'|'perspective'|'problem_solving'` (emotion_pick → emotion_other nếu needsTarget, ngược lại emotion_self; single_correct → perspective; role_choice → problem_solving); `scoreFor(version, { type, correct, role }) -> number` (role_choice → điểm vai; còn lại → `correct ? 1 : 0`).
- `GET /question-templates?subSkillId&skillId&isActive` (specialist/admin) → mẫu + `latestPublished` + `draft` (nếu có).
- `POST /question-templates` `{ subSkillId, title, answerFormat }` → tạo mẫu + phiên bản 1 nháp rỗng.
- `PUT /question-templates/:id` `{ title?, isActive? }`.
- `PUT /question-templates/:id/draft` (nội dung phiên bản; tạo nháp mới sao từ bản ban hành gần nhất nếu chưa có nháp).
- `POST /question-templates/:id/publish` → kiểm `assertVersionComplete`, chuyển nháp thành `published`, ghi `published_by/at`; không có nháp → 409.
- `DELETE /question-templates/:id` → xoá khi chưa có checkpoint dùng phiên bản nào, ngược lại 409 (tắt thay thế).

**Đủ trường để ban hành (`assertVersionComplete`):** mọi dạng: `questionFrame`, `pageSetup`, `parentPrompts` 2–3 câu, `rationale`. `emotion_pick`: `hintGuidance`; `allowedEmotions` ⊆ 5 cảm xúc. `single_correct`: `correctDesc`, `distractorDesc`, `hintGuidance`. `role_choice`: 3 mô tả + 3 điểm ∈ [0,1], `constructiveScore` lớn nhất.

- [ ] **Step 1: Test unit** `templateRules.test.js`: `checkpointTypeFor('emotion_pick', true) === 'emotion_other'`; `checkpointTypeFor('single_correct', false) === 'perspective'`; `scoreFor({answerFormat:'role_choice', avoidantScore: 0.5, …}, {role:'avoidant'}) === 0.5`; `assertVersionComplete('role_choice', {…thiếu impulsiveDesc})` ném 422 nhắc `impulsiveDesc`; điểm 1.2 → 422. FAIL → viết → PASS.
- [ ] **Step 2: Test integration**: tạo mẫu → nháp v1; ban hành khi thiếu trường → 422; điền đủ → publish → `latestPublished.version === 1`; sửa nháp → v2 nháp, v1 vẫn published; publish khi không có nháp → 409; phụ huynh → 403. FAIL → viết module → PASS.
- [ ] **Step 3:** Swagger. Commit `api mau cau hoi: phien ban nhap/ban hanh, luat du truong, anh xa dang tra loi ve kieu checkpoint`.

### Task 7: Topic gắn kỹ năng con

**Files:**
- Modify: `api/src/modules/topics/topics.{service,validation}.js`, `api/tests/integration/specialist.test.js`

**Luật:** body thêm `subSkillIds: uuid[]` (create bắt buộc, 1–3, không trùng); mỗi kỹ năng con: đang bật, cùng `skillId` với topic, khoảng tuổi giao với topic (`sub.ageMin <= topic.ageMax && topic.ageMin <= sub.ageMax`), có ≥ 1 mẫu đang bật có phiên bản `published` — sai → 422 nêu tên kỹ năng con. Update `subSkillIds` thay toàn bộ liên kết (truyện cũ không đổi). Phụ huynh nhận thêm `subSkills: [{ id, nameVi }]`; manager nhận thêm `subSkills: [{ id, nameVi, caselReference:{textEn} }]`.

- [ ] **Step 1: Test**: tạo topic thiếu `subSkillIds` → 400; 4 kỹ năng con → 400; kỹ năng con khác năng lực → 422; tuổi không giao → 422; kỹ năng con chưa có mẫu ban hành → 422; hợp lệ → 201 có `subSkills.length === 2`; phụ huynh GET thấy `subSkills`. FAIL → sửa → PASS (test topic cũ cập nhật thêm `subSkillIds`).
- [ ] **Step 2:** Commit `topic gan 1-3 ky nang con: cung nang luc, giao tuoi, co mau ban hanh`.

### Task 8: Web — trang Specialist cho kỹ năng con, mẫu câu hỏi, topic

**Files:**
- Create: `Web/src/services/pedagogyService.js`, `Web/src/hooks/usePedagogy.js`, `Web/src/pages/specialist/SubSkillsPage.jsx`, `Web/src/pages/specialist/TemplatesPage.jsx`, `Web/src/components/specialist/TemplateVersionForm.jsx`
- Modify: `Web/src/pages/specialist/TopicsPage.jsx` (chọn 1–3 kỹ năng con lọc theo năng lực đã chọn), `Web/src/constants/routes.js` (`SUB_SKILLS: "/specialist/sub-skills"`, `TEMPLATES: "/specialist/templates"`), `AppRoutes.jsx`, `SpecialistLayout.jsx` (nhóm menu "Chương trình sư phạm": Kỹ năng con, Mẫu câu hỏi, Bài học)

**Hành vi:**
- Kỹ năng con: bảng lọc theo năng lực; form chọn năng lực → chọn mục CASEL (hiện `textEn` nguyên văn cạnh ô tên Việt); nút Tắt/Xoá hiện thông điệp 409 của API.
- Mẫu câu hỏi: lọc theo kỹ năng con; mỗi mẫu hiện badge phiên bản ban hành + "Có bản nháp"; form nháp đổi trường theo `answerFormat` (emotion_pick: chọn cảm xúc cho phép; single_correct: mô tả đúng/nhiễu; role_choice: 3 mô tả + 3 ô điểm 0–1); nút "Ban hành" hiện lỗi 422 theo trường.

- [ ] **Step 1:** Service + hook theo khuôn `topicService.js` / `useTopics.js` (cùng hàm `call`, invalidate theo key).
- [ ] **Step 2:** Trang + form; `npm run lint`, `npm run build` sạch.
- [ ] **Step 3:** Chạy thử bằng tài khoản specialist: tạo kỹ năng con → tạo mẫu role_choice → ban hành thiếu trường (thấy lỗi) → điền đủ → ban hành → tạo topic gắn kỹ năng con đó. Chụp ảnh `D:\sep490\.playwright-mcp\sweep\pedagogy-*.png`.
- [ ] **Step 4:** Commit Web `trang specialist: ky nang con, mau cau hoi co phien ban, bai hoc gan ky nang con`.

---

## Phase C — Sinh truyện theo mẫu

### Task 9: Xếp mẫu vào ô chấm

**Files:**
- Create: `api/src/modules/stories/lib/slotPlan.js`, `api/tests/lib/slotPlan.test.js`
- Modify: `api/src/modules/stories/lib/skeleton.js`, `api/src/modules/stories/lib/storySettings.js` (chấp nhận `type: 'scored'|'reflection'`), `api/src/modules/stories/stories.generation.service.js` (nạp topic + kỹ năng con + mẫu ban hành trước khi trừ credit), `api/tests/lib/skeleton.test.js`

**Interfaces — Produces:**
- `planSlots({ slots, subSkills, hasSecondary, rng }) -> [{ afterPageOrder, subSkillId, templateVersion }]` — `slots`: các `after` của ô `scored`; `subSkills`: `[{ id, displayOrder, versions: [published version + template.answerFormat] }]` theo `displayOrder`; ô thứ i lấy kỹ năng con `i % n`; trong kỹ năng con chọn ngẫu nhiên (`rng()` ∈ [0,1)) một phiên bản; bỏ phiên bản `needsTarget` khi `!hasSecondary`; kỹ năng con không còn phiên bản dùng được → bỏ qua sang kỹ năng con kế; không ô nào điền được → ném 422 "Bài học chưa có mẫu câu hỏi dùng được…" (hoặc "…cần thêm ít nhất một nhân vật phụ" khi lý do là target).
- `buildSkeleton({ length, layouts, customLimits, storyCharacters, plan })` → checkpoint thêm `subSkillId`, `templateVersionId`, `scored: true`, `type = checkpointTypeFor(format, needsTarget)`, `targetToken` khi `needsTarget`, `answerEmotion: 'neutral'` tạm cho kiểu cảm xúc; ô `reflection` giữ như cũ (`scored: false`).

- [ ] **Step 1: Test** `slotPlan.test.js`: 3 ô + 2 kỹ năng con → kỹ năng con [A,B,A]; `hasSecondary=false` loại phiên bản `needsTarget`; mọi phiên bản cần target + không nhân vật phụ → ném 422 chứa "nhân vật phụ"; `subSkills=[]` → 422 chứa "mẫu câu hỏi"; `rng` cố định cho kết quả lặp lại. FAIL → viết → PASS.
- [ ] **Step 2:** Sửa `skeleton.js` + test skeleton theo layout mới.
- [ ] **Step 3: Test integration** trong `stories.generation.test.js`: topic có kỹ năng con mà mẫu đã tắt hết → POST tạo truyện AI trả 422 và **số dư credit không đổi** (Review Focus 1–2).
- [ ] **Step 4:** Commit `xep mau cau hoi vao o cham theo ky nang con cua topic`.

### Task 10: Gửi guide sang AI và lưu checkpoint truy vết

**Files:**
- Modify: `api/src/modules/stories/lib/aiRequest.js`, `api/src/modules/stories/lib/persistPlan.js`, `api/src/modules/stories/stories.generation.store.js`, `docs/contracts/ai-service.md`, `api/tests/lib/aiRequest.test.js`, `api/tests/lib/persistPlan.test.js`

**Hợp đồng mới (bổ sung, không đổi output):**
- `topic`: thêm `age_min`, `age_max`, `sub_skills: [{ name, description }]` (lời Việt).
- Mỗi checkpoint `type ≠ reflection` thêm `guide`: `{ sub_skill, question_frame, page_setup, hint_guidance?, allowed_emotions?, correct_desc?, distractor_desc?, roles?: { constructive, avoidant, impulsive } }` (chỉ các trường của dạng đó; không gửi điểm, không gửi `rationale`).
- `target` cho `perspective` trở thành tuỳ chọn.

- [ ] **Step 1: Test** `aiRequest.test.js`: topic có `age_min/age_max/sub_skills`; checkpoint role_choice có `guide.roles` 3 khoá và **không** có khoá điểm; emotion_pick có `guide.allowed_emotions`; reflection không có `guide`. `persistPlan.test.js`: cảm xúc ngoài `allowedEmotions` của checkpoint → `AiServiceError('OUTPUT_INVALID')`. FAIL → sửa → PASS.
- [ ] **Step 2:** `stories.generation.store.js` ghi `subSkillId`, `templateVersionId`, `scored` khi tạo khung checkpoint (trước khi gọi AI).
- [ ] **Step 3:** Cập nhật `docs/contracts/ai-service.md` (ví dụ request mới). Commit `gui guide mau cau hoi sang ai, luu checkpoint kem ky nang con + phien ban mau`.

### Task 11: Service `ai` — prompt story.v2 theo guide

**Files:**
- Create: `ai/app/prompts/story.v2.md`
- Modify: `ai/app/schemas/story.py` (`Topic` + `age_min`, `age_max`, `sub_skills`; `CheckpointFrame.guide: CheckpointGuide | None`; `_NEEDS_TARGET = {EMOTION_OTHER}`), `ai/app/core/prompt.py` (`_TEMPLATE_PATH` → v2, render `$age_range`, `$sub_skills`, khối checkpoint có guide), `ai/app/core/validator/rules.py` (rule mới `EMOTION_NOT_ALLOWED`: answer ∉ `guide.allowed_emotions` → lỗi retry), `ai/docs/03-story-structure.md`, `ai/docs/05-api-contract.md`, `ai/docs/01-decisions.md` (mục EQ), tests `ai/tests/unit/test_schemas.py`, `test_prompt_render.py`, `test_validator_rules.py`, `ai/tests/api/test_node_contract.py`, fixtures liên quan

**Prompt v2 (khác v1):** câu đầu dùng `$age_range` thay "5–8"; thêm "Kỹ năng con của bài học: $sub_skills"; mục "Điểm dừng theo kiểu" giữ quy tắc hình dạng output, nhưng nội dung từng điểm dừng lấy từ guide: câu hỏi viết theo `question_frame`, trang ngay trước làm đúng `page_setup`, các phương án `role_choice` viết đúng mô tả vai, `single_correct` theo mô tả đúng/nhiễu, cảm xúc chọn trong `allowed_emotions`. Bỏ các câu cứng "trang trước emotion_self…/perspective…" (đã chuyển vào `page_setup`), giữ quy tắc "sau problem_solving đi theo hướng làm lành". Bảy nguyên tắc giữ nguyên.

- [ ] **Step 1: Test** `test_schemas.py`: perspective không target hợp lệ; emotion_other không target → lỗi; guide sai khoá → lỗi (StrictModel). `test_prompt_render.py`: prompt chứa `question_frame` của từng checkpoint, chứa "6–9 tuổi" khi `age_min=6, age_max=9`, không chứa chữ "5–8". `test_validator_rules.py`: `EMOTION_NOT_ALLOWED` bắt `answer='angry'` khi `allowed_emotions=['sad','scared']`. FAIL.
- [ ] **Step 2:** Viết schema/prompt/rule. `PROMPT_VERSION` = `story.v2`. Toàn bộ pytest PASS (≥ 525 + test mới).
- [ ] **Step 3:** Thử thật một lần với provider đang cấu hình: `cd ai && .venv/Scripts/python scripts/try_story.py` (thêm mẫu trong `scripts/try_story_samples/`) với fixture topic Self-management 2 kỹ năng con → đọc output: mọi câu hỏi bám `question_frame`. Ghi kết quả vào commit message ngắn.
- [ ] **Step 4:** Cập nhật docs 01/03/05. Commit `ai: prompt story.v2 viet checkpoint theo guide mau cua chuyen gia, tuoi theo topic, rule cam xuc cho phep`.

### Task 12: Khoá checkpoint truyện AI; truyện tự viết không chấm, topic tuỳ chọn

**Files:**
- Modify: `api/src/modules/stories/stories.editor.service.js` (`updateCheckpoint`), `api/src/modules/stories/stories.service.js` + `stories.validation.js` (tạo truyện custom không bắt buộc `topicId`), `api/src/modules/publishing/publishing.service.js` (chép `subSkillId`, `templateVersionId`, `scored`, `excluded`), `api/src/modules/stories/lib/storyFormat.js` (trả `scored`, `locked`), `api/tests/integration/stories.editor.test.js`, `api/tests/integration/publishing.test.js`, `api/tests/integration/stories.crud.test.js`
- Web: `Web/src/components/parent/studio/CheckpointEditor.jsx` (checkpoint `locked` → chỉ đọc + dòng "Câu hỏi do khung của chuyên gia sư phạm quyết định"), `Web/src/pages/parent/studio/CreateStoryPage.jsx` (truyện tự viết: topic tuỳ chọn; truyện tự viết ghi rõ "không tính vào báo cáo EQ")

**Luật:** `updateCheckpoint` với truyện `length ≠ 'custom'` → 422 "Câu hỏi của truyện AI theo khung của chuyên gia, không sửa được." (kể cả bản published). `storyFormat` thêm `checkpoint.locked = story.length !== 'custom'`.

- [ ] **Step 1: Test**: PUT checkpoint truyện AI → 422 và câu hỏi trong DB không đổi (Review Focus 4); PUT checkpoint truyện custom → 200; tạo truyện custom không `topicId` → 201; tạo truyện AI không `topicId` → 400; đăng bán truyện AI → bản sao giữ `templateVersionId`, `scored`. FAIL → sửa → PASS.
- [ ] **Step 2:** Web: lint/build; chạy thử mở trang biên tập truyện AI (checkpoint chỉ đọc) và truyện tự viết (sửa được, tạo không chọn topic).
- [ ] **Step 3:** Commit BE `khoa checkpoint truyen AI, truyen tu viet khong bat buoc topic, ban dang ban giu truy vet` và commit Web tương ứng.

---

## Phase D — Chấm điểm, soát mẫu, báo cáo

### Task 13: Chấm theo phiên bản mẫu

**Files:**
- Modify: `api/src/modules/kid/lib/play.js` (bỏ `ROLE_SCORE`, `skillCodeFor`), `api/src/modules/kid/kid.service.js` (`answer`, `PLAY_STORY_INCLUDE` nạp `templateVersion` + `subSkill`), `api/tests/lib/play.test.js`, `api/tests/integration/kid.test.js`, `api/src/docs/swagger.js` (mô tả answer)

**Interfaces — Produces:** `firstScore(checkpoint, choice) -> number|null` dùng `scoreFor(checkpoint.templateVersion, …)`; trả `null` khi `!checkpoint.scored || checkpoint.excluded || type === 'reflection'`. `answer` snapshot `skillId` (= `subSkill.skillId`), `subSkillId`, `templateVersionId`, `score`; không còn upsert stats.

- [ ] **Step 1: Test unit** `play.test.js`: role_choice dùng điểm vai của phiên bản (`avoidantScore: 0.25` → 0.25); checkpoint `scored:false` → `null`; `excluded:true` → `null`. **Integration** `kid.test.js` (thay đoạn `eqCompetencyStat` đã `todo` ở Task 3): lượt đầu truyện AI lưu `subSkillId` + `score`; lượt chơi lại có `score` nhưng không tính ở báo cáo (kiểm ở Task 14); truyện custom → `score null`, `skillId null` (Review Focus 5). FAIL → sửa → PASS.
- [ ] **Step 2:** Commit `cham diem theo phien ban mau, snapshot ky nang con, truyen tu viet va checkpoint bi co khong cham`.

### Task 14: Báo cáo EQ theo mức độ

**Files:**
- Create: `api/src/modules/children/lib/eqLevels.js`, `api/src/modules/children/lib/recommend.js`, `api/tests/lib/eqLevels.test.js`, `api/tests/lib/recommend.test.js`, `api/src/modules/pedagogy-settings/` (`GET/PUT /pedagogy/report-settings`, specialist/admin)
- Modify: `api/src/modules/children/children.service.js` (`getChildEqReport`, `getChildEqJourney`), `api/src/modules/children/lib/childFormat.js` (bỏ `eqSkillsFromStats`, `EQ_MIN_ITEMS`), `api/src/modules/children/lib/eqJourney.js` (trend mới), `api/tests/lib/childFormat.test.js`, `api/tests/lib/eqJourney.test.js`, swagger

**Interfaces — Produces:**
- `levelFor(scores: number[], { window, minItems, developingFrom, secureFrom }) -> 'emerging'|'developing'|'secure'|null` — lấy `window` điểm **mới nhất**, `< minItems` → `null`; trung bình `< developingFrom` → emerging, `< secureFrom` → developing, còn lại secure.
- `buildEqLevels(rows, skills, subSkills, settings) -> { competencies: [{ caselCode, nameVi, level, subSkills: [{ id, nameVi, caselTextEn, level, items }] }] }` — `rows`: câu trả lời lượt đầu, có `score`, checkpoint không `excluded`, mới → cũ. Mức năng lực = mức **thấp nhất** trong các kỹ năng con có mức; không kỹ năng con nào có mức → `null`.
- `recommendTopics({ levels, topics, childAge, recentTopicIds, limit = 3 }) -> topic[]` — chỉ topic đang bật, tuổi chứa `childAge` (tuổi null → bỏ lọc); ưu tiên (1) năng lực `null`, (2) kỹ năng con `emerging`, (3) `developing`; loại `recentTopicIds` (topic của 3 truyện đọc gần nhất); hoà thì theo `displayOrder`.
- `GET /children/:id/eq-report` → `{ childId, childName, settings, competencies, recommendations: [{ id, title, skill, subSkills }] }`.
- `GET /children/:id/eq-journey?weeks` → `{ …eq-report, evidence: [{ subSkillId, answeredAt, storyTitle, question (detokenize), firstChoiceText, correctFirstTry, usedHint, source: 'ai_template' }], conversation: [{ storyTitle, subSkillId, prompts: string[] , reflection?: { question, answer? } }], trend: [{ weekStart, competencies: { [caselCode]: { items, level } } }] }`. Bằng chứng tối đa 5 câu/kỹ năng con; `conversation` lấy `parentPrompts` của phiên bản mẫu ở 3 truyện gần nhất + câu hỏi reflection / câu hỏi truyện tự viết.
- Settings đọc từ `platform_settings` khoá `eq_report.*` (Task 4); `PUT` kiểm `1 ≤ minItems ≤ window ≤ 20`, `0 < developingFrom < secureFrom ≤ 1`.

- [ ] **Step 1: Test unit** `eqLevels.test.js`: `[1,1,0]` với minItems 3 → `developing` (0.67); `[1,1]` → `null`; window 5 lấy 5 điểm mới nhất (điểm cũ thấp không kéo mức); năng lực có kỹ năng con secure + emerging → `emerging`. `recommend.test.js`: năng lực chưa có dữ liệu xếp trước kỹ năng con emerging; topic vừa đọc bị loại; topic ngoài tuổi bị loại.
- [ ] **Step 2: Test integration** (`kid.test.js` hoặc file mới `eqReport.test.js`): bé trả lời 3 câu cùng kỹ năng con → report có `level`; specialist gắn cờ 1 câu (Task 15 API — viết test này sau Task 15 hoặc gọi thẳng `prisma.storyCheckpoint.update({ excluded: true })`) → report lần sau còn 2 câu → `level null` (Review Focus 3); câu lượt chơi lại không được tính.
- [ ] **Step 3:** Viết lib + service + settings module. Tất cả PASS. Commit `bao cao EQ theo muc do ky nang con, bang chung, goi y tro chuyen, goi y topic, tham so do specialist dat`.

### Task 15: Soát mẫu checkpoint (Specialist)

**Files:**
- Create: `api/src/modules/checkpoint-review/{routes,controller,service,validation}.js`, `api/tests/integration/checkpointReview.test.js`

**Interfaces — Produces:**
- `GET /checkpoint-review?status=pending|ok|flagged&skillId&subSkillId&templateId&cursor` → `[{ checkpointId, createdAt, skill, subSkill, template:{ title, version }, pageBefore (text dạng tên chung), question, options:[{ text, role?, isCorrect? }], answerEmotion?, status, excludedReason? }]`. Chỉ checkpoint `scored = true` của truyện AI. **Không** detokenize: thay `{NVx}` bằng tên chung "Bạn A/B…" (`aliasName` nếu là bản published), không trả `situation`, không trả tên thật.
- `POST /checkpoint-review/:checkpointId/ok` → ghi `reviewed_ok_at/by`.
- `POST /checkpoint-review/:checkpointId/flag` `{ reason }` (bắt buộc, 5–500 ký tự) → `excluded = true` + lý do/người/lúc. Gỡ cờ: `DELETE /checkpoint-review/:checkpointId/flag`.
- `GET /checkpoint-review/stats` → theo mẫu: `{ templateId, title, reviewed, flagged }`.

- [ ] **Step 1: Test**: phụ huynh → 403; hàng đợi không chứa chuỗi tên thật của nhân vật (tạo truyện có nhân vật tên "Bin", assert JSON không chứa "Bin"); flag thiếu lý do → 400; flag → checkpoint `excluded`; stats đếm đúng. FAIL → viết → PASS.
- [ ] **Step 2:** Commit `soat mau checkpoint cho specialist: an ten, gan co loai khoi diem, thong ke theo mau`.

### Task 16: Web — báo cáo EQ mới, trang soát mẫu, tạo truyện từ gợi ý

**Files:**
- Modify: `Web/src/pages/parent/EqJourneyPage.jsx`, `Web/src/components/parent/EqRadarCard.jsx`, `Web/src/services/childService.js`, `Web/src/hooks/useChildProfile.js` (hoặc hook đang gọi eq-report), `Web/src/constants/eqAdvice.js` (bỏ lời khuyên theo điểm; giữ nếu còn dùng cho thẻ năng lực), `Web/src/pages/parent/studio/CreateStoryPage.jsx` (đọc `?topicId=` để chọn sẵn)
- Create: `Web/src/pages/specialist/CheckpointReviewPage.jsx`, `Web/src/pages/specialist/ReportSettingsPage.jsx` (hoặc gộp vào trang mẫu), route + menu "Soát câu hỏi AI"

**Hành vi:**
- Radar 5 trục, 3 vòng nhãn "Đang làm quen / Đang phát triển / Vững" (giá trị 1/2/3); trục `level null` để trống + chú thích "chưa có dữ liệu"; **không** hiện %.
- Dưới radar: 5 thẻ năng lực, mỗi thẻ liệt kê kỹ năng con + mức + nút "Xem bằng chứng" (câu hỏi, truyện, bé chọn gì, đúng ngay hay cần gợi ý, nguồn "AI viết theo mẫu của chuyên gia", câu gốc CASEL).
- Khối "Gợi ý trò chuyện" và "Bài học nên đọc tiếp" (bấm → `/parent/studio/create?topicId=…`).
- Biểu đồ theo tuần: số câu chấm mỗi tuần theo năng lực + mức cuối tuần.
- Dòng ghi chú cố định: "Báo cáo phản ánh mức hiểu của con qua tình huống trong truyện, không phải đánh giá hành vi ngoài đời."
- `EqRadarCard` ở dashboard dùng cùng thang mức độ.
- Trang soát mẫu: bảng hàng đợi lọc trạng thái/kỹ năng con; xem trang trước + câu hỏi + phương án (kèm vai/đáp án); nút "Ổn" / "Gắn cờ" (modal lý do); tab thống kê theo mẫu.

- [ ] **Step 1:** Service/hook + trang; lint/build sạch.
- [ ] **Step 2:** Chạy thử: phụ huynh `me.lanhuong@storyweaver.vn` mở báo cáo bé Bin (sau seed demo Task 17) thấy radar mức độ, bằng chứng, gợi ý, bấm gợi ý sang trang tạo truyện chọn sẵn topic; specialist gắn cờ 1 câu → tải lại báo cáo thấy câu đó biến mất. Chụp ảnh vào `sweep\`.
- [ ] **Step 3:** Commit Web `bao cao EQ theo muc do (radar 3 muc, bang chung, goi y tro chuyen va bai hoc), trang soat cau hoi AI cho specialist`.

### Task 17: Seed demo + tài liệu

**Files:**
- Modify: `api/prisma/seed_demo.js` (truyện AI demo của bé Bin theo khung mới: checkpoint có `subSkillId`/`templateVersionId`/`scored`; lịch sử trả lời lượt đầu đủ để ≥ 2 năng lực có mức, ≥ 1 năng lực "chưa có dữ liệu"; 1 truyện tự viết không câu hỏi), `api/tests/lib/seedDemo.test.js`, `ai/docs/01-decisions.md`, `ai/docs/02-glossary.md` (kỹ năng con, mẫu câu hỏi, Specialist), `docs/db/schema-guide.md`, `docs/roadmap-tich-hop.md`, `api/src/docs/swagger.js` (rà lần cuối)

- [ ] **Step 1:** Test `seedDemo.test.js` cập nhật theo dữ liệu mới; PASS.
- [ ] **Step 2:** `npm run db:seed:demo` trên DB local `storyweaver`; mở Web xác nhận báo cáo Bin như mô tả.
- [ ] **Step 3:** Chạy toàn bộ: test API (mốc chỉ 2 fail có sẵn), pytest `ai`, `npm run build` Web.
- [ ] **Step 4:** Commit `seed demo va tai lieu theo luong su pham CASEL`.

---

## Thứ tự & phụ thuộc

A (1→2) → B (3→4→5→6→7→8) → C (9→10→11→12) → D (13→15→14→16→17). Task 11 (service `ai`) chỉ cần hợp đồng ở Task 10, làm song song được với Task 12. Task 14 Step 2 dùng API của Task 15 nên chạy Task 15 trước.
