# CLAUDE.md — StoryWeaver AI · Backend

Nền tảng truyện tương tác dạy EQ (khung CASEL) cho trẻ 5–8 tuổi, mô hình C2C: phụ huynh tạo
truyện cho con, có thể đăng bán bản đã gỡ thông tin cá nhân trên chợ truyện.

Repo gồm hai service độc lập:

| Thư mục | Stack | Trách nhiệm |
|---|---|---|
| `api/` | Node 22, Express 5, Prisma 6, Zod 4, BullMQ | Nghiệp vụ, auth, thương mại, worker gọi AI + cron |
| `ai/` | Python 3.12, FastAPI | Sinh chữ (Claude/Gemini), giọng đọc VieNeu-TTS, tranh (Cloudflare Workers AI, FLUX.2 klein). Stateless, **không đọc DB**. Có `ai/CLAUDE.md` riêng |

Sinh nội dung (chữ, tranh, giọng đọc) luôn qua queue. Ngoại lệ duy nhất: phân tích lời kể
(`POST /stories/analyze`) — API gọi `ai/` **đồng bộ** (không trừ credit), nên service `api` cần
`AI_SERVICE_URL` + `INTERNAL_TOKEN` (compose bắt buộc `INTERNAL_TOKEN` trong `.env` root).

DB là **PostgreSQL 16** trong container `postgres` của compose (đã bỏ Supabase 2026-10-30, mỗi máy
một DB riêng; volume `pg-data`). Prod: một máy Google Cloud, API vào qua Cloudflare Tunnel, xem
`DEPLOY.md`. Queue: Redis + BullMQ, chỉ ở phía Node. Media lưu
Cloudinary (`type=authenticated`), BE trả link có chữ ký qua `src/clients/assetUrl.js`.

## Phân công — đọc trước khi sửa

**AI core do teammate phụ trách. Không sửa** nếu chưa được yêu cầu rõ:
`ai/**`, `api/src/queues/`, `api/src/workers/`, `api/src/clients/aiClient.js`, `api/src/worker.js`,
`api/src/healthcheck.worker.js`, `docs/contracts/ai-service.md`, `api/tests/aiClient.test.js`,
`api/tests/aiProcessor.test.js`, `api/tests/narrationProcessor.test.js`.
Nếu nghiệp vụ cần thứ gì từ AI core (tạo `ai_requests`, đẩy job, thêm việc vào cron), hãy nêu ra
thay vì tự sửa.

Teammate cũng đã viết phần lớn module nghiệp vụ (PR #7, 2026-10-18 — thay toàn bộ module cũ
`orders`, `payments`, `reading-sessions`, `reports`, `marketplace`, `moderation`, `platform`) và
PR #8 (2026-10-21 — luồng sư phạm CASEL, đổi role Moderator → Specialist, tranh AI), PR #10
(2026-10-22 — kỹ năng con gộp với mục CASEL, lối vào "Kể chuyện nhà mình").
Trước khi sửa lớn một module: `git pull`, xem `git log -- <thư mục>` và `docs/roadmap-tich-hop.md`
để tránh đè việc của nhau.

## Nguồn sự thật

1. `docs/db/schema_rev8.dbml` — thiết kế gốc (dán vào dbdiagram.io để xem ERD).
2. `docs/db/schema-guide.md` — hành trình người dùng, máy trạng thái, ràng buộc, cron.
3. `api/prisma/schema.prisma` + `api/prisma/migrations/` — bản dẫn xuất từ DBML.
4. `docs/roadmap-tich-hop.md` — phase, việc đã xong, quyết định đã chốt. Quyết định về AI (vd tranh
   làm lại trên Cloudflare 2026-10-19, thay quyết định "bỏ ảnh" 2026-10-17) ở `ai/docs/01-decisions.md`.
5. `docs/superpowers/specs/2026-10-20-casel-pedagogy-design.md` (+ plan cùng ngày) — luồng sư phạm:
   kỹ năng con, mẫu câu hỏi, chấm điểm, báo cáo EQ (code trích "spec casel-pedagogy §x").
   `docs/superpowers/specs/2026-10-22-family-story-design.md` — 3 lối vào tạo truyện, phân tích lời
   kể (thay phần "topic + chuyện thật" của spec casel-pedagogy; code trích "spec family-story §x").
6. `ai/docs/superpowers/specs/*` và `api/docs/superpowers/specs/*` — spec sinh truyện, TTS
   (code hay trích "spec §x").

Code phải theo schema, không ngược lại. Trước khi dùng một field/relation, kiểm tra trong
`schema.prisma`. **Đã bỏ khỏi schema — đừng đưa lại:** `role` của nhân vật, `coverImageKey` của
story, bedtime, credit pack, notification, mô hình rẽ nhánh `storyChoice`, `vouchers` /
`voucher_usages`, `cart_items` (mua từng truyện một), `prompt_templates` (prompt nằm trong `ai/`),
`child_usage_sessions` và `daily_screen_time_minutes` (thời gian đọc tính từ `play_sessions`, không
giới hạn phút), `eq_competency_stats` (báo cáo EQ tính thẳng từ `checkpoint_answers`), role
`moderator` (đã đổi tên thành `specialist`), khoá `ai_cost.story_text` (tách theo độ dài),
bảng `casel_references` + API `/casel-references` (kỹ năng con **chính là** mục CASEL: `source`
`casel|specialist`, `casel_text_en`).

## Lệnh

```bash
# Toàn bộ hệ (từ thư mục BE/): cần .env ở root, xem README.md
docker compose up --build
docker compose exec api npm run db:setup       # migrate deploy + seed + demo bé Bin; lần đầu và khi có migration mới
docker compose exec api npx prisma migrate deploy   # chỉ migration
docker compose exec api npx prisma db seed          # chỉ seed
docker compose exec api npm run db:seed:demo        # chỉ demo bé Bin (truyện + lượt đọc + báo cáo)
# Dev: thêm -f docker-compose.dev.yml (hoặc đặt COMPOSE_FILE trong .env; Windows ngăn bằng ;);
# ai/ chạy trên máy host (claude CLI, TTS nhanh hơn): -f docker-compose.hostai.yml

# Trong api/
npm install && npm run db:generate   # db:generate BẮT BUỘC sau npm install / đổi schema.prisma
npm run dev                          # HTTP server
npm run worker                       # BullMQ worker + cron
npm test                             # node:test, mọi file tests/**/*.test.js
```

Kiểm tra nhanh app còn load được (không cần DB):
`NODE_ENV=test node -e "import('./src/app.js').then(()=>process.exit(0))"` trong `api/`.

Test:
- `tests/lib/*`, `tests/stories/*`: hàm thuần, chạy không cần DB.
- `tests/integration/*`: **bị skip** nếu không có `TEST_DATABASE_URL`. Phải
  là một database **riêng** (vd `storyweaver_test`); `tests/integration/_db.js` chặn không cho rơi vào DB dev
  (ledger không xoá được). Cách chuẩn bị DB test ghi ở đầu file `_db.js`.
- File integration mới phải `import './_db.js'` **đầu tiên** và truyền `{ skip: !hasTestDb }`.

ESLint hiện **không chạy được** (ESLint 10 nhưng repo còn `.eslintrc.js` kiểu cũ). Prettier:
single quote, trailing comma, printWidth 100.

## Cấu trúc code (`api/src/`)

Route gắn ở `routes/v1/index.js`, base path `/api/v1`. Một prefix có thể gom nhiều router
(vd `/moderation` = publishing + keywords + monitoring + reviews).

| Module | Việc |
|---|---|
| `auth` | Đăng ký (kèm gói Miễn phí), đăng nhập, email, mật khẩu, kid PIN, vào/thoát Kid Mode |
| `children`, `characters` | Hồ sơ bé, báo cáo EQ (`/children/:id/eq-journey`; `lib/eqLevels.js` mức độ, `lib/recommend.js` topic gợi ý), nhân vật gia đình + chân dung AI |
| `stories` | Tạo truyện 3 lối vào (`stories.entry`: `topic` chuyện mẫu / `family` kể chuyện nhà mình / `handwritten` tự viết), phân tích lời kể (`stories.analysis.service.js`, `stories.family.store.js`, `lib/analysisToken.js`, `lib/familySkills.js`), editor, sinh AI (`stories.generation.*`), giọng đọc (`stories.narration.*`), tranh AI (`stories.images.*`: `POST /stories/:id/images`, `/scenes/:sceneId/image`), `lib/` luật cấu trúc / token tên / khung trang / `slotPlan` xếp mẫu vào ô chấm |
| `topics`, `content-library`, `keywords`, `eq-skills` | Thư viện của Specialist: chuyện mẫu (bảng `topics`, giao diện gọi "Chuyện mẫu"; gắn 1–3 kỹ năng con, `guidance` là cốt truyện gợi ý), nền, âm thanh UI, checklist, từ khoá chặn |
| `sub-skills`, `question-templates` | Kỹ năng con là danh mục chuẩn CASEL: Specialist chỉ **điều chỉnh** (`PUT`: tên, mô tả, độ tuổi, bật/tắt; không thêm / xoá). Mẫu câu hỏi viết theo kỹ năng, có phiên bản nháp / ban hành + nhân bản (`POST /question-templates/:id/duplicate`; `lib/templateRules.js`: luật ban hành, `scoreFor`) |
| `checkpoint-review`, `pedagogy-settings` | Specialist soát mẫu điểm dừng (`/checkpoint-review`: ok / gắn cờ loại khỏi điểm); tham số báo cáo (`/pedagogy/report-settings`) |
| `bookshelf`, `kid` | Giá sách; Kid Mode (`/kid/*`, token `kid_session` qua `kidAuth`, chỉ dùng `req.kid`) |
| `plans`, `billing` | Gói, subscription, checkout payOS (`/payments/plans/checkout`), webhook `/payments/payos/webhook`, chu kỳ gói |
| `market` | Chợ truyện (`/market`), mua truyện, rút tiền người bán (`withdrawals.*`; Admin chuyển khoản tay rồi `mark-paid`) |
| `publishing` | Đơn người bán + duyệt, đăng bán, hàng chờ kiểm duyệt (`/moderation/submissions`) |
| `monitoring` | Báo cáo vi phạm, tự tạm gỡ, cảnh cáo / kháng nghị, kiểm tra ngẫu nhiên, cảnh báo dùng AI |
| `reviews` | Đánh giá truyện, người bán trả lời, Specialist ẩn |
| `refunds`, `admin` | Hoàn tiền; Admin: tài khoản, gói + bậc giá, cài đặt, tài chính + đối soát, nhật ký |
| `wallets` | Chỉ còn helper sổ cái: `creditLedger.js`, `earningLedger.js` (không có route) |

Quy ước:
- Hàm **thuần** (không DB) đặt ở `modules/<name>/lib/*.js` và có test ở `tests/lib/`. Truy vấn DB ở
  `*.service.js` / `*.store.js`; hàm nhận `tx`/`db` (prisma hoặc transaction client) khi cần chạy
  trong transaction của nơi gọi.
- Validation Zod qua `validate(schema)`; trả `ApiResponse.success/created`; lỗi
  `ApiError.badRequest/notFound/forbidden/conflict`, message tiếng Việt. Module mới hay viết handler
  ngay trong routes bằng helper `ok(fn)` thay vì controller riêng — theo kiểu của module đang sửa.
- Truyện người khác: trả **404** (không lộ tồn tại) — dùng `stories.access.js`.
- Cài đặt nền tảng đọc từ `platform_settings`; khoá Admin sửa được khai báo ở
  `admin/lib/settingsRegistry.js` (vd `market.seller_share_rate` 0.8, `market.earning_hold_days`,
  `market.refund_window_days`, `moderation.report_threshold`, `ai_cost.story_text.short|medium|long`,
  `ai_cost.character_portrait`, `ai_cost.scene_image`, `ai_cost.story_analysis` 0,
  `limits.story_analysis_per_day` 30). Giá trị mặc
  định seed ở `prisma/seed_platform_settings.js`.
- **Đổi API thì cập nhật swagger trong cùng lần sửa**: `src/docs/swagger.js` và các file
  `src/docs/paths/*.paths.js`. Chuỗi trong swagger dùng escape `\n`, không xuống dòng thật.

## Quy tắc nghiệp vụ không được phá

- **Credit chỉ đến từ gói.** Kỳ gói mới luôn qua `startPeriod` trong `billing/billing.store.js`
  (đóng kỳ active cũ, tạo subscription có `nextCreditGrantAt`, ghi `credit_grant`). Đăng ký tài
  khoản dùng `ensureFreeSubscription`. Luật chu kỳ (hàm thuần) ở `billing/lib/billing.js`: trả
  trước, mỗi tháng cấp `credits_per_month`, credit dư hết hạn khi sang tháng, mua/nâng gói giữa kỳ
  thì kỳ mới bắt đầu ngay và giữ credit còn lại một lần.
- **`wallet_ledger` chỉ ghi thêm**, `idempotencyKey` duy nhất và tất định, `entryType` thuộc enum
  `LedgerEntryType`. Đổi số dư và ghi ledger trong cùng transaction, khoá ví bằng `FOR UPDATE`
  (`creditLedger.js`, `earningLedger.js`). Credit AI: hold → consume / release. Doanh thu
  người bán không bao giờ đổi thành credit.
- **Thanh toán**: chỉ `fulfillOrder(tx, orderId)` (billing.store) chuyển `pending|expired → paid`
  bằng `updateMany` có điều kiện rồi giao hàng (kỳ gói hoặc entitlement + doanh thu treo). Mua trùng
  truyện đã có quyền → tự mở `refund_requests`. Client payOS ở `src/clients/payos.js`.
- **Cron** chạy trong `src/worker.js` mỗi `BILLING_CYCLE_MINUTES` (mặc định 15): `runBillingCycle`,
  `releaseDueEarnings`, `scheduleRandomAudits`. Mọi việc cron phải
  idempotent (hai worker cùng chạy không cấp trùng).
- **Snapshot**: `order_items` (giá, tỉ lệ chia), `checkpoint_answers.skill_id/score` chép lúc phát
  sinh, không tính lại.
- **Chữ truyện lưu kèm token `{NVx}`** (`stories/lib/names.js`); tên thật của nhân vật và **mọi**
  bé không được gửi cho AI hay nằm trong bản published. `story_characters`: `characterId` cho truyện
  private, `aliasName` cho bản published — đúng một trong hai.
- **Bản published** (`createListing` trong `publishing.service.js`, luật ở `publishing/lib/publish.js`):
  bản sao gỡ cá nhân hoá — bỏ `situation`, `moment_summary`, `seed_event` (giữ `entry`, `scored`); giọng đọc theo lựa chọn tác giả nhưng **sinh lại** bằng tên
  chung (audio cũ chứa tên thật); tranh cảnh đã `ready` được chép theo (dùng chung `imageKey`); giữ truy
  vết chấm (`subSkillId`, `templateVersionId`, `scored`, `excluded*`). Specialist chỉ `approved` khi đã
  xem 100% trang (`review_page_views`; checklist sư phạm chỉ kiểm trên Web, không gửi lên API), và chỉ nhận duyệt khi giọng đọc xong.
- **"Sẵn sàng cho trẻ"** (`loadReadiness` trong `stories.narration.store.js`) là cổng chung cho thêm
  vào giá sách và bắt đầu lượt đọc. Giọng đọc không tính credit.
- **Tranh AI** tính credit như chữ (hold → consume / release trong worker): chân dung 1 ảnh/nhân vật,
  tối đa 4 cảnh/truyện, cảnh chờ chân dung. Prompt tranh chỉ dùng mô tả ngoại hình, không tên thật.
  Không có bộ phân loại an toàn ảnh — dựa vào người duyệt.
- **Chấm EQ** (`kid/lib/play.js`): điểm + kỹ năng con lấy từ **phiên bản mẫu** gắn vào điểm dừng
  (snapshot `skillId`, `subSkillId`, `templateVersionId`, `score` vào `checkpoint_answers`). Không chấm
  (`score` null): reflection, `scored = false`, bị cờ `excluded`, truyện tự viết / truyện không có
  phiên bản. Chỉ lần chọn đầu được chấm; báo cáo chỉ tính lượt `isFirstPlay`. Gắn sai phiên bản / vai
  thì không chấm và cảnh báo, không trả 500 cho bé. Đáp án không bao giờ gửi xuống máy bé.
- **Checkpoint truyện AI bị khoá theo mẫu**: sửa checkpoint khi `length !== 'custom'` → 422. Truyện
  tự viết (`custom`) không bắt buộc topic (`stories.topic_id` có thể null — luôn dùng `topic?.`).
- **Ba lối vào tạo truyện** (CHECK `entry <> 'topic' OR topic_id IS NOT NULL`):
  - `topic` (chuyện mẫu): bắt buộc topic, **không nhận `situation`** (422).
  - `family`: không topic; bắt buộc lời kể + `analysisToken` (HMAC, hạn 2 giờ, gắn chủ truyện +
    hash lời kể đã token hoá + nhân vật) lấy từ `POST /stories/analyze`. Lưu `moment_summary` /
    `seed_event` (dạng token) và `story_sub_skills` (1–2 kỹ năng, position 1 = chính, nguồn
    `moment|need|parent`); ô chấm chia theo kỹ năng này. `scored = false` = "chỉ kể truyện" (chỉ
    còn reflection). Sửa lời kể / nhân vật truyện family → 409.
  - `handwritten` = `length = 'custom'`.
  Phân tích lời kể không trừ credit, ghi `ai_requests` loại `story_analysis`, AI chỉ chọn kỹ năng
  trong danh mục dùng được (có phiên bản ban hành), không đặt điểm / đáp án.
- **Ảnh bìa** truyện = ảnh một cảnh (`stories.cover_scene_id`, NULL = cảnh 1; chọn qua
  `PUT /stories/:id/cover`, cảnh phải đã có ảnh). Mọi đối tượng truyện trả `cover: { imageUrl,
  competency }` (`stories/lib/cover.js`; chưa có ảnh → Web vẽ bìa theo màu năng lực). Đăng bán chép
  key ảnh bìa sang `listings.coverImageKey`. **Mỗi bé tối đa 1 nhân vật đại diện**
  (`characters.child_id` unique, trùng → 409).

## Bẫy đã gặp

- `npm install` xoá client Prisma đã sinh → chạy lại `npm run db:generate`. Package mới (vd
  `@payos/node`) thiếu thì app không load.
- `prisma migrate diff` có thể báo drift giả ở cột GENERATED / index viết tay; migration mới sinh ra
  thì đọc kỹ và xoá dòng thừa trước khi apply.
- Ngày theo **giờ Việt Nam** (UTC+7), không dùng `toISOString()` trần để lấy "hôm nay".
- Partial unique viết tay trong migration (`play_sessions` WHERE `is_first_play`, `subscriptions`
  WHERE `active`, `entitlements` WHERE `revoked_at IS NULL`, `moderation_reviews` WHERE
  `decided_at IS NULL`, `withdrawal_requests` WHERE `status IN (requested, processing)`) — bắt
  `P2002` khi có thể chạy song song.
- `docker compose down -v` xoá sạch DB local (volume `pg-data`). `prisma migrate reset` chỉ dùng ở máy
  dev, **không** chạy trên prod. `DATABASE_URL` trong `.env` chỉ cho lệnh ngoài Docker (`localhost:5432`);
  api + worker trong Docker dựng URL từ `POSTGRES_PASSWORD`.
- Git `core.autocrlf=true`: file làm việc là CRLF, repo lưu LF.
- `BigInt` được serialize thành string (patch trong `app.js`).

## Còn mở (so với phiếu đăng ký capstone)

Chưa chốt / chưa làm: giới hạn nhập sai PIN thoát Kid Mode (`auth.exitKidMode` chưa có), hạ gói /
gia hạn cùng gói chưa rà, phiếu ghi giữ doanh thu 7 ngày nhưng seed để 3. Voucher, giỏ hàng, giới
hạn thời gian màn hình, cấu hình prompt đã bị bỏ khỏi schema — nhóm cần chốt với GVHD.
Bản đăng bán chép tranh cảnh vẽ từ ngoại hình bé (PR #8): cần chốt có còn đúng "gỡ cá nhân hoá" không;
bản sao dùng chung `imageKey` với truyện gốc nên nếu sau này xoá asset Cloudinary phải tính cả bản sao.

## Cách làm việc

- Comment viết ngắn, tiếng Việt không dấu hoặc tiếng Anh như code xung quanh; message lỗi trả
  cho người dùng tiếng Việt.
- Sau khi sửa query, ít nhất chạy `node --check`, load app và `npm test`; chưa có DB test thì nói
  rõ phần nào chưa được chạy với DB thật (integration test bị skip).
- Đổi hợp đồng API thì liệt kê thay đổi cho FE khi báo cáo.
