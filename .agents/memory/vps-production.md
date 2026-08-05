---
name: VPS Production Setup
description: VPS configuration, deploy flow, and known issues for the CheckGPT production server
---

# VPS Production Setup

**VPS:** 103.180.138.203, user=root, password auth (sshpass)
**Stack on VPS:** Node 22, pnpm, PM2, PostgreSQL 16, Ubuntu 24.04
**Repo location:** /opt/checkgpt
**DB:** checkgptdb, user=checkgpt, pass=Checkgpt2025!@

## Key paths
- PM2 ecosystem: /opt/checkgpt/ecosystem.config.cjs
- .env: /opt/checkgpt/.env
- SSH key for GitHub Actions: /root/.ssh/github_actions (private), pub added to authorized_keys

## Admin Dashboard
- URL: http://103.180.138.203/checkgpt-admin/
- Static files: /var/www/checkgpt-admin/
- API accessed via Nginx proxy: /checkgpt-api/ → localhost:3001 (same-origin for cookies)
- Build env: PORT=3002 BASE_PATH=/checkgpt-admin/ VITE_API_BASE_URL=http://103.180.138.203/checkgpt-api
- Cookie: secure=false (no HTTPS), sameSite=lax — controlled by COOKIE_SECURE=true in .env

## Nginx
- Config: /etc/nginx/sites-available/botadmin (active)
- Port 80 serves multiple projects: Bot Quà Tặng (/admin-panel/), CheckGPT (/checkgpt-admin/, /checkgpt-api/)
- Do NOT edit default or create conflicting server_name _ blocks

## Deploy flow
- Push to GitHub main → GitHub Actions `deploy.yml` auto SSHs into VPS, pulls, builds, pm2 restarts
- Health check every 15min via `health-check.yml`, auto-restarts services if down
- Manual deploy from Replit: `bash scripts/deploy-vps.sh`
- Manual push+deploy: `bash scripts/push.sh "msg"`

## Health endpoint
- Correct path: `/api/healthz` (NOT `/health` or `/healthz`) — routes mounted at /api prefix

## Build outputs
- Both api-server and telegram-bot build to `dist/index.mjs` (not .js) — ecosystem.config.cjs uses .mjs

**Why:** vite/esbuild config outputs ESM .mjs; ecosystem config must match

## Known issues
- Telegram Bot 409 conflict if both Replit workflow AND VPS PM2 run the same token simultaneously
- Node must be v22+ because undici@8 (used in checker.ts) requires v22
- VPS RAM is ~961MB; swap 1GB added at /swapfile to handle pnpm install/builds
