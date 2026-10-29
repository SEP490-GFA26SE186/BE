# Deploy StoryWeaver lên Google Cloud + Cloudflare Pages

Bố trí:

| Địa chỉ | Chạy ở đâu | HTTPS |
|---|---|---|
| `https://storyweaver.id.vn` | **Cloudflare Pages** (Web, repo `Web`) | Cloudflare |
| `https://api.storyweaver.id.vn` | **Máy Google Cloud** `e2-standard-2` (2 vCPU, 8 GB): **Cloudflare Tunnel** (`cloudflared`) → api, worker, ai (Claude CLI + VieNeu), Postgres, Redis | Cloudflare |

Máy chủ **không mở cổng 80/443**: `cloudflared` chủ động kết nối ra Cloudflare, request vào `api.storyweaver.id.vn`
đi theo đường đó. IP máy được ẩn, có lớp chống DDoS của Cloudflare. Mọi tác vụ AI dài chạy qua hàng đợi, request
đồng bộ dài nhất (phân tích lời kể) có timeout 90 giây — dưới giới hạn 100 giây của proxy Cloudflare.
Caddy (`deploy/Caddyfile`) chỉ còn là phương án dự phòng, xem mục 2b.

Dịch vụ ngoài giữ nguyên: Cloudinary (ảnh, audio), Cloudflare Workers AI (tranh), payOS, Brevo (email),
gói Claude Pro/Max (`CLAUDE_CODE_OAUTH_TOKEN`).

File liên quan trong repo: `docker-compose.prod.yml` (Postgres, `cloudflared`, `NODE_ENV=production`, api không mở
cổng ra ngoài; Caddy dự phòng trong profile `caddy`) và `deploy/Caddyfile`.

> Thứ tự nên làm: 1 → 2 → 3 (máy + DNS) → 4 → 5 (BE chạy) → 6 (Web) → 7 (payOS).
> **Không dán key / mật khẩu vào chat, không commit `.env`.**

---

## 1. Google Cloud: tạo máy

Trong console (tài khoản trial $300 / 90 ngày):

1. **Đặt ngân sách cảnh báo trước:** Billing → Budgets & alerts → Create budget, ví dụ $100, cảnh báo ở 50% / 90% / 100%.
2. **Compute Engine → VM instances → Create instance** (lần đầu phải bấm Enable API, đợi 1–2 phút):
   - Name: `storyweaver`
   - Region: **`asia-southeast1` (Singapore)**, zone bất kỳ
   - Machine type: **`e2-standard-2`** (2 vCPU, 8 GB)
   - **OS and storage → Change** (giao diện cũ: Boot disk): **Ubuntu 24.04 LTS** (x86/64), **Balanced persistent disk, 40 GB**
     (lỡ tạo 10 GB: Compute Engine → Storage → Disks → ổ của máy → Edit → Size 40 → Save, rồi trên máy chạy
     `sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1`)
   - **Networking → Firewall**: **không** tích Allow HTTP / HTTPS traffic — Cloudflare Tunnel không cần cổng vào.
     Chỉ giữ SSH (22, mặc định có sẵn).
   - Create.
3. **IP tĩnh** (mặc định IP đổi mỗi lần tắt/bật máy): VPC network → IP addresses → hàng IP ngoài của máy
   `storyweaver` → **⋮ → Promote to static IP address** (đặt tên `storyweaver-ip`). Ghi lại IP này (gọi là `<IP>`).
   Menu trái không có VPC network: mở thẳng `https://console.cloud.google.com/networking/addresses/list`, hoặc
   trong Cloud Shell (`>_` góc trên phải):
   ```bash
   gcloud compute instances list   # lay EXTERNAL_IP
   gcloud compute addresses create storyweaver-ip --addresses=<IP> --region=asia-southeast1
   ```

Chi phí ước tính `e2-standard-2` ở Singapore ~$60–70/tháng → $300 đủ 90 ngày. Tắt máy (Stop) khi không dùng để tiết kiệm; IP tĩnh và ổ đĩa vẫn giữ (tốn vài đô mỗi tháng).

## 2. Cloudflare: chuyển DNS của `storyweaver.id.vn`

1. Đăng ký / đăng nhập **dash.cloudflare.com** → **Add a domain** → nhập `storyweaver.id.vn` → chọn gói **Free**.
   Cloudflare quét bản ghi cũ rồi đưa **2 nameserver** (dạng `xxx.ns.cloudflare.com`).
2. Đăng nhập **Mắt Bão** (trang quản lý khách hàng) → Quản lý tên miền → `storyweaver.id.vn` →
   **Đổi DNS / Nameserver** → chọn dùng nameserver riêng, điền 2 nameserver của Cloudflare → lưu.
3. Đợi Cloudflare báo **Active** (vài phút tới vài giờ; Cloudflare gửi email khi xong).
4. **Không** tự tạo bản ghi `api` — tunnel ở mục 2a tự tạo.

## 2a. Cloudflare Tunnel cho `api.storyweaver.id.vn`

1. dash.cloudflare.com → **Zero Trust** (lần đầu chọn tên team, gói **Free**, có thể phải thêm thẻ nhưng không
   bị trừ tiền) → **Networks → Tunnels → Create a tunnel** → chọn **Cloudflared** → đặt tên `storyweaver-api` → Save.
2. Màn hình *Install and run a connector*: chọn Docker, **copy riêng phần token** (chuỗi dài sau `--token`).
   Đây là `TUNNEL_TOKEN` cho `.env` ở mục 4 — **không dán vào chat, không commit**. Không chạy lệnh `docker run`
   Cloudflare gợi ý: `docker-compose.prod.yml` đã có service `cloudflared`.
3. Next → tab **Public Hostname** → Add:
   - Subdomain `api`, Domain `storyweaver.id.vn`, Path để trống
   - Service: Type **HTTP**, URL **`api:3000`** (tên service trong compose, không phải localhost)
   - Save. Cloudflare tự tạo bản ghi CNAME `api` → `<id>.cfargotunnel.com` (đám mây cam). Nếu báo trùng: vào
     DNS → Records xoá bản ghi `api` cũ trước.
4. **Webhook payOS không được bị chặn**: Security → Bots → **Bot Fight Mode: Off**. Nếu bật WAF / Bot rule nào khác,
   thêm rule *Skip* cho đường dẫn `/api/v1/payments/payos/webhook`.

Kiểm tra sau khi chạy BE (mục 5): tunnel hiện **HEALTHY** trong Zero Trust → Networks → Tunnels.

## 2b. Dự phòng: quay lại Caddy

Chỉ dùng khi tunnel hỏng mà cần API chạy gấp:

1. Cloudflare → DNS: xoá CNAME `api` của tunnel, thêm A `api` → `<IP>`, **DNS only (đám mây xám)** — Caddy cần
   nhận thẳng kết nối để xin chứng chỉ Let's Encrypt.
2. GCP: VPC network → Firewall → Create firewall rule: All instances, nguồn `0.0.0.0/0`, TCP `80,443`.
3. Trên máy: `docker compose stop cloudflared && docker compose --profile caddy up -d caddy`.

## 3. Máy chủ: cài Docker, swap

Vào Compute Engine → VM instances → bấm **SSH** cạnh máy `storyweaver` (mở terminal trên trình duyệt).

```bash
# Docker + compose plugin (script chính thức)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Thoát cửa sổ SSH rồi mở lại để nhận quyền docker, sau đó kiểm tra:
docker compose version

# Swap 4 GB: dự phòng lúc VieNeu đọc + build image
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

## 4. Lấy code + tạo `.env`

Repo BE public nên clone thẳng, không cần token. Vì public: **không bao giờ commit `.env`** (đã có trong `.gitignore`).

```bash
git clone -b main https://github.com/SEP490-GFA26SE186/BE.git storyweaver
cd storyweaver
```

Tạo chuỗi bí mật (chạy 4 lần, mỗi lần lấy một chuỗi cho POSTGRES_PASSWORD, JWT_SECRET, INTERNAL_TOKEN,
BANK_DATA_KEY):

```bash
openssl rand -hex 32
```

Token Claude: trên **laptop** (có trình duyệt, đã `claude login` bằng tài khoản Pro/Max) chạy
`claude setup-token`, copy token nó in ra.

`nano .env` rồi điền (thay mọi `...`):

```ini
# ---- Compose: ban production (Linux ngan cach bang dau :) ----
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
NODE_ENV=production

# ---- Domain + Cloudflare Tunnel (muc 2a) ----
TUNNEL_TOKEN=...
# SITE_DOMAIN chi dung cho Caddy du phong (muc 2b) nhung compose van doi phai co.
SITE_DOMAIN=api.storyweaver.id.vn
APP_URL=https://api.storyweaver.id.vn
CORS_ORIGIN=https://storyweaver.id.vn
WEB_URL=https://storyweaver.id.vn

# ---- Bi mat (openssl rand -hex 32) ----
POSTGRES_PASSWORD=...
JWT_SECRET=...
INTERNAL_TOKEN=...
BANK_DATA_KEY=...
# Bat buoc co trong docker-compose.yml nhung bi docker-compose.prod.yml ghi de (Postgres tren may nay).
DATABASE_URL=postgresql://bi-ghi-de

# ---- AI: chu bang Claude (goi Pro/Max), giong doc VieNeu ----
AI_EXTRAS=tts claude-code
LLM_PROVIDER=claude_code
CLAUDE_CODE_OAUTH_TOKEN=...
LLM_CLAUDE_MODEL=claude-sonnet-5-5
LLM_CLAUDE_EFFORT=low
LLM_THINKING_BUDGET=12000
TTS_PROVIDER=vieneu

# ---- Anh: Cloudflare Workers AI ----
IMAGE_PROFILE_PORTRAIT=cf-flux-2-klein-4b
IMAGE_PROFILE_SCENE=cf-flux-2-klein-4b
IMAGE_SAFETY=human_review
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...

# ---- Luu file: Cloudinary (folder rieng de khong tron voi du lieu dev) ----
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=storyweaver-prod

# ---- payOS ----
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...

# ---- Email (Brevo) ----
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=...
```

```bash
chmod 600 .env
```

- **Không đặt `ANTHROPIC_API_KEY`**: có key thì CLI tính tiền vào key thay vì vào gói.
- `BANK_DATA_KEY` mã hoá số tài khoản người bán: **mất key = không đọc lại được** số tài khoản đã lưu. Cất một
  bản ở chỗ an toàn (trình quản lý mật khẩu).

## 5. Chạy BE

```bash
docker compose up -d --build        # lan dau 10-20 phut: build image ai co VieNeu + Claude CLI
docker compose ps                   # doi tat ca "healthy" / "running"
docker compose exec api npx prisma migrate deploy   # tao bang
docker compose exec api npx prisma db seed          # CASEL, mau cau hoi, chuyen mau, cau hinh, goi
# Tai khoan demo (admin, specialist, phu huynh) + truyen mau. seed_demo tu choi chay khi
# NODE_ENV=production, nen ghi de rieng cho lenh nay — day la ban demo cho review / bao ve.
docker compose exec -e NODE_ENV=development api node prisma/seed_demo.js
```

- Lần đầu container `ai` **tải model VieNeu ~580 MB** (giữ trong volume, không tải lại). Theo dõi:
  `docker compose logs -f ai` tới khi thấy `vieneu loaded`.
- `docker compose logs cloudflared` phải có `Registered tunnel connection` (thường 4 dòng). Kiểm tra (trên máy bạn):
  ```bash
  curl https://api.storyweaver.id.vn/api/v1/health
  ```
- Kiểm tra AI: `docker compose exec ai curl -s localhost:8000/health` phải có `"llm_provider":"claude_code"`,
  `"tts_provider":"vieneu"`.
- **Đổi mật khẩu các tài khoản demo** (`me_lanhuong`, `kdv_demo`, `admin_demo` đang là `123456`) ngay sau khi
  đăng nhập được: máy này mở ra Internet.

## 6. Web lên Cloudflare Pages

Đang dùng **Wrangler** (tải bản build từ laptop): repo Web nằm trong organization GitHub, nối Pages với GitHub cần
owner của org duyệt GitHub App Cloudflare.

Trên laptop (Git Bash):

```bash
cd <thu-muc>/Web
git checkout main && git pull
npm ci
VITE_API_URL="https://api.storyweaver.id.vn/api/v1" npm run build
ls dist/_redirects                 # phai co
npx wrangler login                 # mo trinh duyet, bam Allow
npx wrangler pages deploy dist --project-name storyweaver --branch main
```

Lần đầu Wrangler hỏi tạo project `storyweaver` → Yes, production branch `main`. Xong được địa chỉ
`xxx.storyweaver.pages.dev`.

Gắn domain: Workers & Pages → `storyweaver` → **Custom domains → Set up a custom domain** → `storyweaver.id.vn` →
Activate (Cloudflare tự tạo bản ghi DNS + chứng chỉ). Thêm `www.storyweaver.id.vn` nếu muốn. Không tự tạo bản ghi
cho tên miền chính trong DNS.

Repo Web có `public/_redirects` (`/* /index.html 200`) để mở thẳng link như `/parent/billing/result` không bị
404. `VITE_API_URL` được gắn lúc build: quên đặt → Web gọi nhầm `storyweaver.id.vn/api/v1`.

**Muốn Pages tự build khi push** (thay Wrangler): owner org `SEP490-GFA26SE186` cài GitHub App "Cloudflare Workers
and Pages" cho repo Web, rồi Cloudflare → Workers & Pages → Create → Pages → Connect to Git; build `npm run build`,
output `dist`, biến `VITE_API_URL` = `https://api.storyweaver.id.vn/api/v1`, `NODE_VERSION` = `22`.

Cập nhật về sau: [DEPLOY-UPDATE.md](DEPLOY-UPDATE.md) mục 4.1.

## 7. payOS

Trên **my.payos.vn** → kênh thanh toán → Webhook URL:

```
https://api.storyweaver.id.vn/api/v1/payments/payos/webhook
```

Lưu, rồi thử mua một gói rẻ nhất để kiểm tra luồng trả về `https://storyweaver.id.vn/parent/billing/result`.

---

## Việc thường ngày

Đầy đủ hơn (cập nhật từng phần, đổi `.env`, rollback, sự cố): [DEPLOY-UPDATE.md](DEPLOY-UPDATE.md).

```bash
cd ~/storyweaver

# Cap nhat code
git pull
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # khi co migration moi

# Xem log
docker compose logs -f --tail 100 api worker ai cloudflared

# Backup DB (nen chay truoc moi lan cap nhat)
docker compose exec -T postgres pg_dump -U storyweaver storyweaver | gzip > ~/backup-$(date +%F).sql.gz
# Tai backup ve may: tren cua so SSH bam bieu tuong banh rang -> Download file

# Khoi phuc (XOA du lieu hien tai cua cac bang)
gunzip -c ~/backup-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U storyweaver storyweaver
```

Đổi `.env` xong: `docker compose up -d` (compose tự tạo lại container có biến đổi).
Đổi `AI_EXTRAS`: `docker compose up -d --build ai`.

## Gặp lỗi

| Hiện tượng | Xử lý |
|---|---|
| `curl https://api...` lỗi 1033 / 502 / không kết nối | `docker compose logs cloudflared`. 1033: tunnel chưa chạy hoặc `TUNNEL_TOKEN` sai. 502: Public hostname phải trỏ `http://api:3000` (không phải `localhost`) và `api` đang healthy. Trùng bản ghi: xoá A `api` cũ trong DNS |
| Thanh toán xong mà đơn không chuyển "đã trả" | Webhook payOS bị Cloudflare chặn: tắt Bot Fight Mode / thêm rule Skip cho `/api/v1/payments/payos/webhook` (mục 2a.4); `docker compose logs api` xem có request webhook không |
| Web báo lỗi mạng / CORS | `CORS_ORIGIN` trong `.env` phải đúng `https://storyweaver.id.vn` (không có `/` cuối); sửa xong `docker compose up -d api`. Kiểm `VITE_API_URL` trên Pages |
| Tạo truyện lỗi `PROVIDER_ERROR` từ Claude | `CLAUDE_CODE_OAUTH_TOKEN` sai / hết hạn: chạy lại `claude setup-token` trên laptop, sửa `.env`, `docker compose up -d ai` |
| Không ra tranh | Kiểm `CLOUDFLARE_*`, `IMAGE_*` trong `.env`; `docker compose logs ai` |
| Máy chậm / treo khi đọc giọng | `free -h` xem swap; VieNeu đọc từng trang một (~30–60 s/trang) là bình thường |
| Hết 90 ngày trial | Máy bị dừng, còn 30 ngày để nâng cấp tài khoản lấy lại. **Backup DB trước hạn** |
