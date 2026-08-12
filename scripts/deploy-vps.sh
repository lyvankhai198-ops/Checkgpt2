#!/bin/bash
# Deploy lên VPS qua SSH — chạy sau mỗi lần push
set -e

VPS_IP="${VPS_HOST:-103.180.138.203}"
VPS_USER="root"
VPS_PASS="${VPS_PASSWORD:-Khai123khai@}"

echo "🚀 Deploying to VPS $VPS_IP..."

sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} bash << 'REMOTE'
set -e
cd /opt/checkgpt

echo "📥 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -3

echo "🔨 Building..."
pnpm --filter @workspace/api-server run build 2>&1 | tail -3
pnpm --filter @workspace/telegram-bot run build 2>&1 | tail -3
PORT=3002 BASE_PATH=/checkgpt-admin/ \
  VITE_API_BASE_URL=http://103.180.138.203/checkgpt-api \
  NODE_ENV=production \
  pnpm --filter @workspace/admin-dashboard run build 2>&1 | tail -3
cp -r artifacts/admin-dashboard/dist/public/* /var/www/checkgpt-admin/

echo "🗄️ DB migrations..."
export $(grep -v '^#' .env | xargs)
pnpm --filter @workspace/db run push 2>&1 | tail -3

echo "🔧 Updating Nginx proxy headers..."
NGINX_CONF="/etc/nginx/sites-available/checkgpt"
if [ -f "$NGINX_CONF" ]; then
  if ! grep -q "X-Forwarded-For" "$NGINX_CONF"; then
    sed -i '/proxy_pass.*3001/a\                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n                proxy_set_header X-Real-IP $remote_addr;\n                proxy_set_header X-Forwarded-Proto $scheme;' "$NGINX_CONF"
    nginx -t && systemctl reload nginx && echo "Nginx reloaded with proxy headers"
  else
    echo "Nginx proxy headers already configured"
  fi
else
  echo "⚠️  Nginx config not found at $NGINX_CONF — skipping"
fi

echo "🔄 Restarting PM2..."
pm2 reload api-server --update-env   # graceful reload cho api-server
pm2 restart telegram-bot --update-env # restart ngay để tránh 409 Conflict (2 bot chạy song song)
pm2 status

echo "✅ Deploy hoàn tất!"
REMOTE
