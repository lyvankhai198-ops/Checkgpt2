#!/bin/bash
# Auto-push lên GitHub — chạy: bash scripts/push.sh "commit message"
set -e

MSG="${1:-Update code}"

if [ -z "$GITHUB_PAT" ]; then
  echo "❌ Thiếu GITHUB_PAT secret"
  exit 1
fi

# Đảm bảo remote dùng token mới nhất
git remote set-url origin "https://${GITHUB_PAT}@github.com/lyvankhai198-ops/Checkgpt2.git"

git add -A

if git diff --cached --quiet; then
  echo "ℹ️  Không có thay đổi để commit"
  exit 0
fi

git commit -m "$MSG"
git push origin main
echo "✅ Đã push lên GitHub thành công!"
