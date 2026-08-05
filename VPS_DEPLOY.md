# 🚀 Hướng dẫn Deploy lên VPS

## Yêu cầu VPS
- Ubuntu 20.04+ / Debian 11+
- RAM: tối thiểu 1GB
- Node.js 20+, pnpm, PostgreSQL, PM2

---

## 1. Cài đặt môi trường

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Cài pnpm
npm install -g pnpm

# Cài PM2 (process manager)
npm install -g pm2

# Cài PostgreSQL
sudo apt install -y postgresql postgresql-contrib
```

---

## 2. Tạo database PostgreSQL

```bash
sudo -u postgres psql

-- Trong psql:
CREATE USER checkgpt WITH PASSWORD 'matkhaumanh';
CREATE DATABASE checkgptdb OWNER checkgpt;
\q
```

---

## 3. Clone code từ GitHub

```bash
cd /opt
git clone https://github.com/lyvankhai198-ops/Checkgpt2.git checkgpt
cd checkgpt
```

---

## 4. Cấu hình biến môi trường

Tạo file `.env` ở thư mục gốc:

```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql://checkgpt:matkhaumanh@localhost:5432/checkgptdb
TELEGRAM_BOT_TOKEN=token_bot_telegram_cua_ban
JWT_SECRET=chuoi_bi_mat_jwt_rat_dai_va_ngau_nhien
SESSION_SECRET=chuoi_bi_mat_session_rat_dai
ADMIN_PASSWORD=matkhau_admin_dashboard
PORT=3001
EOF
```

> ⚠️ Đổi tất cả giá trị placeholder thành giá trị thật của bạn.

---

## 5. Cài dependencies & build

```bash
pnpm install

# Tạo bảng database
pnpm --filter @workspace/db run push

# Build tất cả packages
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/admin-dashboard run build
pnpm --filter @workspace/checker-app run build
pnpm --filter @workspace/telegram-bot run build
```

---

## 6. Khởi chạy bằng PM2

```bash
# File ecosystem.config.cjs đã có sẵn trong repo, chỉ cần chạy:
pm2 start ecosystem.config.cjs

# Tự khởi động khi reboot VPS
pm2 save
pm2 startup
# Chạy lệnh mà pm2 in ra màn hình
```

---

## 7. Cấu hình Nginx (reverse proxy)

```bash
sudo apt install -y nginx

sudo cat > /etc/nginx/sites-available/checkgpt << 'EOF'
server {
    listen 80;
    server_name yourdomain.com;   # đổi thành domain hoặc IP VPS

    # API Server
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Admin Dashboard
    location /admin/ {
        proxy_pass http://localhost:3002/;
        proxy_set_header Host $host;
    }

    # SSE (bulk check stream) — cần disable buffering
    location /api/keys/check-bulk {
        proxy_pass http://localhost:3001;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_set_header Host $host;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/checkgpt /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 8. Cập nhật code sau này

```bash
cd /opt/checkgpt
git pull origin main
pnpm install
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/telegram-bot run build
pnpm --filter @workspace/admin-dashboard run build
pm2 restart all
```

---

## 9. Cài đặt GitHub Actions Auto-Deploy

Để mỗi lần push code lên GitHub, VPS tự động pull và deploy:

### Thêm secrets vào GitHub repo

Vào **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Giá trị |
|--------|---------|
| `VPS_HOST` | IP address của VPS (vd: `123.45.67.89`) |
| `VPS_USER` | User SSH (vd: `root` hoặc `ubuntu`) |
| `VPS_SSH_KEY` | Nội dung file `~/.ssh/id_rsa` (private key) |
| `VPS_PORT` | Cổng SSH (mặc định `22`, bỏ qua nếu dùng 22) |

### Tạo SSH key trên VPS (nếu chưa có)

```bash
ssh-keygen -t ed25519 -C "github-actions"
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/id_ed25519   # Copy nội dung này vào VPS_SSH_KEY trên GitHub
```

### Thêm ADMIN_CHAT_ID vào .env trên VPS (để nhận alert Telegram)

```bash
echo "ADMIN_CHAT_ID=123456789" >> /opt/checkgpt/.env
```

(Lấy chat ID bằng cách nhắn tin `/start` cho bot rồi xem logs)

---

## 10. Cấu hình SePay Webhook trên VPS

Trong Admin Dashboard → Cài đặt → Thanh toán, đặt Webhook URL:
```
http://yourdomain.com/api/payment/webhook
```

---

## 10. Kiểm tra logs

```bash
pm2 logs api-server      # log API
pm2 logs telegram-bot    # log bot
pm2 monit                # dashboard realtime
```

---

## Cấu trúc cổng

| Service | Cổng | Truy cập |
|---------|------|---------|
| API Server | 3001 | Internal (qua Nginx) |
| Admin Dashboard | 3002 | `http://domain/admin/` |
| Telegram Bot | — | Chỉ kết nối ra ngoài |
| PostgreSQL | 5432 | Localhost only |
