# Cập nhật bản deploy (Web / BE / AI)

Tài liệu cho cả nhóm khi **đã deploy rồi** và cần đưa thay đổi mới lên. Dựng từ đầu: xem [DEPLOY.md](DEPLOY.md).

## 1. Hệ thống đang chạy ở đâu

| Phần | Ở đâu | Cập nhật bằng |
|---|---|---|
| **Web** `https://storyweaver.id.vn` | Cloudflare Pages, project `storyweaver` | Build trên laptop + `wrangler pages deploy` (Pages **chưa** nối GitHub) |
| **api, worker, ai, Postgres, Redis, cloudflared** `https://api.storyweaver.id.vn` | Google Cloud VM `storyweaver` (Singapore `asia-southeast1`, `e2-standard-2`, IP tĩnh `34.143.184.248`), thư mục `~/storyweaver` | SSH vào máy → `git pull` → `docker compose up -d --build` |
| **DNS** `storyweaver.id.vn` | Cloudflare (nameserver `ara` / `jihoon.ns.cloudflare.com`, đổi ở Mắt Bão) | Cloudflare → DNS. Bản ghi `api` = CNAME do **Cloudflare Tunnel** `storyweaver-api` tự tạo (Zero Trust → Networks → Tunnels); máy không mở cổng 80/443. Đang chuyển từ Caddy: mục 12 |
| Ảnh / audio | Cloudinary, folder `storyweaver-prod` | — |
| Thanh toán | payOS, webhook `https://api.storyweaver.id.vn/api/v1/payments/payos/webhook` | my.payos.vn |
| Swagger | `https://api.storyweaver.id.vn/api-docs` | — |

Máy chủ deploy nhánh **`main`** của cả hai repo.

## 2. Quy tắc chung

1. **Code phải lên `main` trước** (qua PR như thường lệ). Máy chủ và bản build Web chỉ lấy code từ `main`.
2. **Không sửa code trực tiếp trên máy chủ.** Sửa trên máy mình → PR → merge → `git pull` trên máy chủ.
   Lỡ sửa trên máy chủ thì `git pull` sẽ báo xung đột: `git stash` rồi pull lại.
3. **Có migration mới → backup DB trước** (mục 6).
4. `.env` trên máy chủ **không nằm trong git**: không commit, không dán vào chat / Zalo. Đổi biến xem mục 5.
5. Sau mỗi lần cập nhật, chạy **kiểm tra** ở mục 7.

## 3. Vào máy chủ

- **Cách 1 (trình duyệt):** console.cloud.google.com → Compute Engine → VM instances → nút **SSH** cạnh `storyweaver`.
- **Cách 2 (terminal):** cài [gcloud CLI](https://cloud.google.com/sdk/docs/install), rồi
  `gcloud compute ssh storyweaver --zone <zone-cua-may>`.
- Thành viên khác cần quyền: chủ project vào **IAM & Admin → IAM → Grant access**, thêm email Google của bạn đó,
  vai trò **Compute Instance Admin (v1)** (đủ để SSH, khởi động lại máy). Không cấp Owner.

Mọi lệnh ở dưới chạy trong `~/storyweaver`:

```bash
cd ~/storyweaver
```

## 4. Cập nhật theo phần thay đổi

### 4.1 Chỉ đổi Web (repo `Web`)

Trên **laptop** (Git Bash):

```bash
cd <thu-muc>/Web
git checkout main && git pull
npm ci
VITE_API_URL="https://api.storyweaver.id.vn/api/v1" npm run build
npx wrangler login            # lan dau tren may nay; mo trinh duyet, bam Allow
npx wrangler pages deploy dist --project-name storyweaver --branch main
```

PowerShell thay dòng build bằng:
`$env:VITE_API_URL="https://api.storyweaver.id.vn/api/v1"; npm run build`

- **Bắt buộc** đặt `VITE_API_URL` lúc build (giá trị gắn cứng vào file JS). Quên → Web gọi `/api/v1` trên chính
  `storyweaver.id.vn` → lỗi 404 / 405 mọi chỗ.
- Tài khoản Cloudflare phải có quyền với project `storyweaver` (chủ tài khoản mời qua **Manage account → Members**).
- Pages giữ các bản deploy cũ: lỗi thì vào project → **Deployments** → bản trước → **Rollback**.

### 4.2 Đổi BE: api / worker (thư mục `api/` của repo `BE`)

```bash
git pull
docker compose up -d --build api worker
docker compose ps                          # api, worker "healthy"
```

**Có migration mới** (thư mục `api/prisma/migrations/` có thư mục mới sau khi pull):

```bash
# 1. backup truoc (muc 6)
docker compose exec -T postgres pg_dump -U storyweaver storyweaver | gzip > ~/backup-$(date +%F-%H%M).sql.gz
# 2. ap migration
docker compose exec api npx prisma migrate deploy
```

- **Chỉ dùng `migrate deploy`**, không bao giờ `migrate dev` / `db push` trên máy chủ (migration của nhóm viết tay
  theo DBML, xem README).
- Thêm dữ liệu gốc mới vào seed (`api/prisma/seed_*.js`) và muốn áp lên máy chủ:
  `docker compose exec api npx prisma db seed`. Chạy lại an toàn nhưng **chỉ thêm cái còn thiếu**: chuyện mẫu, kỹ năng
  con, mẫu câu hỏi đã có thì bỏ qua (để giữ chỉnh sửa của Specialist). Muốn sửa dòng đã có → sửa trên Web bằng tài
  khoản Specialist / Admin. **Không** chạy lại `seed_demo.js` trên dữ liệu thật.

### 4.3 Đổi AI (thư mục `ai/` của repo `BE`)

```bash
git pull
docker compose up -d --build ai
docker compose logs -f ai                  # doi "vieneu loaded" roi Ctrl+C
docker compose exec ai curl -s localhost:8000/health
```

- `/health` phải có `"llm_provider":"claude_code"`, `"tts_provider":"vieneu"`.
- Đổi `ai/pyproject.toml` (thêm thư viện) → build lại lâu hơn (~5–15 phút). Model VieNeu nằm trong volume
  `hf-cache`, không tải lại.
- Đổi prompt (`ai/app/prompts/*.md`) cũng phải `up -d --build ai` (prompt nằm trong image).

### 4.4 Đổi cả BE lẫn AI, hoặc không chắc đổi gì

```bash
git pull
docker compose up -d --build               # Docker chi build lai phan co thay doi
docker compose exec api npx prisma migrate deploy   # vo hai neu khong co migration moi
```

Rồi cập nhật Web (4.1) nếu repo Web cũng đổi.

## 5. Đổi biến môi trường (`.env` trên máy chủ)

```bash
nano .env                     # sua, Ctrl+O Enter de luu, Ctrl+X de thoat
docker compose up -d          # tu tao lai container co bien thay doi
grep -o '^[A-Z_]*=' .env      # xem ten bien (khong in gia tri)
```

| Muốn đổi | Biến | Ghi chú |
|---|---|---|
| Token Claude hết hạn / đổi tài khoản | `CLAUDE_CODE_OAUTH_TOKEN` | Lấy mới: `claude setup-token` trên laptop đã `claude login` (Pro/Max) |
| Model / mức suy nghĩ của Claude | `LLM_CLAUDE_MODEL`, `LLM_CLAUDE_EFFORT`, `LLM_THINKING_BUDGET` | |
| Key ảnh | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | |
| Lưu file | `CLOUDINARY_*` | Đổi folder = ảnh cũ không còn link |
| payOS thu tiền | `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | Đổi kênh → khai lại webhook trên my.payos.vn |
| Email | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Sender phải được xác thực trong Brevo |
| Domain Web / API | `CORS_ORIGIN`, `WEB_URL`, `APP_URL`, `SITE_DOMAIN` | Kèm build lại Web với `VITE_API_URL` mới |
| Thêm extra Python cho AI | `AI_EXTRAS` | Phải `docker compose up -d --build ai` |

**Không bao giờ đổi:** `POSTGRES_PASSWORD` (Postgres đã khởi tạo với mật khẩu cũ → api mất kết nối DB),
`BANK_DATA_KEY` (mất khả năng đọc số tài khoản người bán đã lưu), `JWT_SECRET` (đổi = mọi người bị đăng xuất —
chỉ đổi khi lộ). Ba giá trị này + `INTERNAL_TOKEN` nên được chủ project cất trong trình quản lý mật khẩu.

## 6. Backup / khôi phục DB

```bash
# Backup (nen lam truoc moi migration va dinh ky moi tuan)
docker compose exec -T postgres pg_dump -U storyweaver storyweaver | gzip > ~/backup-$(date +%F-%H%M).sql.gz
ls -lh ~/backup-*

# Tai ve may: cua so SSH tren trinh duyet -> banh rang -> Download file -> nhap duong dan /home/<user>/backup-....sql.gz

# Khoi phuc (GHI DE du lieu hien tai) — dung api/worker truoc de khong ai ghi vao giua chung
docker compose stop api worker
gunzip -c ~/backup-YYYY-MM-DD-HHMM.sql.gz | docker compose exec -T postgres psql -U storyweaver -d storyweaver
docker compose start api worker
```

Khôi phục vào DB đang có bảng có thể báo lỗi "already exists". Khôi phục sạch: xoá schema trước
(`docker compose exec postgres psql -U storyweaver -d storyweaver -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'`)
rồi chạy lệnh gunzip ở trên. **Chỉ làm khi chắc chắn có bản backup đúng.**

### Xem DB bằng DBeaver (qua SSH tunnel)

Postgres chỉ mở `127.0.0.1:5432` trên máy chủ, không ra Internet. DBeaver nối qua SSH:

1. **Tạo SSH key trên laptop** (một lần): `ssh-keygen -t ed25519 -f ~/.ssh/storyweaver -C <user>`
   (`<user>` = tên đăng nhập trên máy chủ, xem bằng `whoami` trong cửa sổ SSH).
2. **Thêm public key vào máy:** Compute Engine → VM instances → `storyweaver` → **Edit** → **SSH Keys** →
   **Add item** → dán nội dung file `~/.ssh/storyweaver.pub` → **Save**.
3. **Lấy mật khẩu DB** trên máy chủ: `grep POSTGRES_PASSWORD ~/storyweaver/.env` (tự xem, không gửi ai).
4. **DBeaver → New Database Connection → PostgreSQL:**
   - Tab **Main**: Host `localhost`, Port `5432`, Database `storyweaver`, Username `storyweaver`, Password = bước 3.
   - Tab **SSH**: tick **Use SSH Tunnel**; Host `34.143.184.248`, Port `22`, User `<user>`,
     Authentication **Public Key**, Private key = file `~/.ssh/storyweaver` (không có `.pub`).
   - **Test Connection**.

Đây là **dữ liệu thật**: chỉ đọc là chính. Sửa tay (nhất là `wallets`, `wallet_ledger`, `orders`, `withdrawal_requests`)
dễ làm lệch số dư — sửa qua Web/API, hoặc backup trước (mục 6).

## 7. Kiểm tra sau mỗi lần cập nhật

```bash
docker compose ps                                            # khong co container restarting / unhealthy
curl -s https://api.storyweaver.id.vn/api/v1/health          # {"status":"ok",...}
docker compose exec ai curl -s localhost:8000/health
docker compose logs --since 10m api worker ai | grep -i -E "error|loi|fail" | tail -20
```

Trên trình duyệt: mở `https://storyweaver.id.vn`, đăng nhập, mở một truyện. Đổi phần tạo truyện / AI thì tạo thử
một truyện ngắn và xem log (mục 8).

## 8. Xem log

```bash
docker compose logs -f --tail 50 api worker ai              # theo doi truc tiep, Ctrl+C de thoat
docker compose logs --since 30m worker                      # mot dich vu, 30 phut gan nhat
docker compose logs --since 15m api worker ai | grep -i -E "error|loi|fail|timeout"
docker stats --no-stream                                    # CPU / RAM tung container
free -h && df -h /                                          # RAM, swap, o dia
```

Log không chứa nội dung truyện, tên thật hay key (cố ý). Gửi log cho nhau thoải mái, **không gửi `.env`**.

## 9. Quay lại bản trước (rollback)

```bash
git log --oneline -5                       # tim commit on dinh truoc do
git checkout <commit>                      # may chu ve dung commit nay ("detached HEAD" la binh thuong)
docker compose up -d --build
# xong su co, quay lai main:
git checkout main && git pull && docker compose up -d --build
```

Bản lỗi có **migration đã chạy** → code cũ có thể không khớp DB mới: khôi phục backup chụp trước migration (mục 6).
Web: rollback trên Cloudflare Pages (mục 4.1).

## 10. Bảo trì định kỳ

| Việc | Khi nào | Làm gì |
|---|---|---|
| Backup DB, tải về máy | Hằng tuần + trước migration | Mục 6 |
| Dọn image Docker cũ | Ổ > 80% (`df -h /`) | `docker image prune -f` (chỉ xoá image không dùng; **không** dùng `docker volume prune` — mất DB) |
| Token Claude | Khi tạo truyện lỗi xác thực Claude | Mục 5 |
| Credit Google Cloud | Mỗi 2–3 tuần | Billing → Credits. Trial $300 / 90 ngày tính từ ~24/10/2026 (hết khoảng **22/01/2027**): trước hạn nâng cấp tài khoản hoặc backup + dọn máy |
| Chứng chỉ HTTPS | Không cần | Cloudflare tự gia hạn (cả api qua tunnel lẫn Web) |
| Tắt máy khi không dùng | Tuỳ | VM instances → Stop. IP tĩnh giữ nguyên; bật lại thì Docker tự chạy lại mọi container |

## 11. Sự cố thường gặp

| Hiện tượng | Nguyên nhân hay gặp | Xử lý |
|---|---|---|
| Web báo lỗi mạng mọi chỗ | api sập, hoặc build Web thiếu `VITE_API_URL` | `curl .../health`; build lại Web đúng mục 4.1 |
| Lỗi CORS trong Console trình duyệt | `CORS_ORIGIN` sai | `.env`: `CORS_ORIGIN=https://storyweaver.id.vn` (không `/` cuối) → `docker compose up -d` |
| `The table ... does not exist` | Có migration chưa chạy | `docker compose exec api npx prisma migrate deploy` |
| Tạo truyện kẹt "đang tạo" | worker / ai lỗi giữa chừng | Xem log worker + ai. Job treo quá 10 phút tự hoàn credit, truyện về nháp |
| Không ra tranh | Key Cloudflare sai / hết quota ngày | `docker compose logs ai \| grep -i cloudflare` |
| Giọng đọc rất chậm | VieNeu chạy CPU, từng trang một (~30–60 s/trang) | Bình thường. Máy treo: `free -h` xem swap |
| `api.storyweaver.id.vn` lỗi 1033 / 502 | Tunnel không chạy / Public hostname sai | `docker compose logs cloudflared`. 1033: container `cloudflared` dừng hoặc `TUNNEL_TOKEN` sai. 502: hostname phải trỏ `http://api:3000`, `api` phải healthy. Gấp: quay lại Caddy theo DEPLOY.md mục 2b |
| Thanh toán xong gói không cập nhật | Webhook chưa tới (hoặc bị Cloudflare chặn) | `docker compose logs api \| grep webhook`; kiểm tra webhook trên my.payos.vn; Cloudflare → Security → Bots: Bot Fight Mode **Off** |
| Hết ổ đĩa | Image cũ, backup dồn | `docker image prune -f`, xoá backup cũ đã tải về |
| `git pull` báo xung đột | Có người sửa file trên máy chủ | `git stash && git pull` |

## 12. Chuyển từ Caddy sang Cloudflare Tunnel (làm một lần)

Có vài phút API không vào được (lúc đổi bản ghi DNS) — **không làm sát giờ demo**. Code đã lên `main` trước.

1. **Backup DB** (mục 6).
2. **Tạo tunnel** theo DEPLOY.md mục 2a, bước 1–2: lấy `TUNNEL_TOKEN`, **chưa** thêm Public hostname.
3. **Trên máy chủ:**
   ```bash
   cd ~/storyweaver && git pull
   nano .env          # them dong TUNNEL_TOKEN=<token>; giu nguyen SITE_DOMAIN
   docker compose rm -sf caddy                 # dung + xoa container caddy (gio chi chay khi bat profile caddy)
   docker compose up -d                        # tao cloudflared
   docker compose logs --tail 20 cloudflared   # phai co "Registered tunnel connection"
   ```
   Từ lúc này API tạm không vào được (Caddy đã dừng, DNS vẫn trỏ IP máy).
4. **Cloudflare → DNS → Records:** xoá bản ghi **A `api` → `34.143.184.248`**.
5. **Zero Trust → Networks → Tunnels → `storyweaver-api` → Public Hostname → Add:** `api` . `storyweaver.id.vn`,
   Service **HTTP** `api:3000` → Save (tự tạo CNAME `api`).
6. **Security → Bots:** Bot Fight Mode **Off** (để webhook payOS không bị chặn).
7. **Kiểm tra** (trên laptop):
   ```bash
   curl https://api.storyweaver.id.vn/api/v1/health
   ```
   Rồi mở Web, đăng nhập, và **mua thử một gói rẻ nhất** để chắc webhook payOS vẫn về (đơn chuyển "đã trả").
8. **Đóng cổng:** GCP → VPC network → Firewall → xoá (hoặc Disable) rule `default-allow-http` và
   `default-allow-https` (hoặc rule TCP `80,443` đã tạo). Chỉ giữ SSH. Kiểm lại bước 7 sau khi đóng.

Không cần đổi: webhook URL trên my.payos.vn, `CORS_ORIGIN`, `VITE_API_URL` của Web, app mobile (cùng domain).

Tunnel lỗi mà cần API gấp: quay lại Caddy theo DEPLOY.md mục 2b.
