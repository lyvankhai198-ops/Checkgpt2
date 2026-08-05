#!/bin/bash
# Push lên GitHub rồi auto-deploy VPS
# Dùng: bash scripts/push.sh "commit message"
set -e

MSG="${1:-Update code}"

if [ -z "$GITHUB_PAT" ]; then
  echo "❌ Thiếu GITHUB_PAT secret"
  exit 1
fi

# Cập nhật remote URL với PAT mới nhất
git remote set-url origin "https://${GITHUB_PAT}@github.com/lyvankhai198-ops/Checkgpt2.git"

git add -A

if git diff --cached --quiet; then
  echo "ℹ️  Không có thay đổi để commit"
else
  git commit -m "$MSG"
  git push origin main
  echo "✅ Đã push lên GitHub!"
fi

# Deploy lên VPS
if [ -f "scripts/deploy-vps.sh" ]; then
  echo "🚀 Deploying to VPS..."
  bash scripts/deploy-vps.sh
fi
