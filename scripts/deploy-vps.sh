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

echo "🗄️ DB migrations..."
export $(grep -v '^#' .env | xargs)
pnpm --filter @workspace/db run push 2>&1 | tail -3

echo "🔄 Restarting PM2..."
pm2 restart all --update-env
pm2 status

echo "✅ Deploy hoàn tất!"
REMOTE
