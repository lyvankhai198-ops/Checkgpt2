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

echo "🔄 Restarting PM2..."
pm2 reload api-server --update-env   # graceful reload cho api-server
pm2 restart telegram-bot --update-env # restart ngay để tránh 409 Conflict (2 bot chạy song song)
pm2 status

echo "✅ Deploy hoàn tất!"
REMOTE
