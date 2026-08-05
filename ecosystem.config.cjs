const path = require("path");
const fs = require("fs");

// Đọc .env từ project root — không cần thư viện ngoài
function loadEnv() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return {};
  const result = {};
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = val;
  }
  return result;
}

const env = loadEnv();

module.exports = {
  apps: [
    {
      name: "api-server",
      cwd: "/opt/checkgpt/artifacts/api-server",
      script: "dist/index.mjs",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        ...env,
      },
    },
    {
      name: "telegram-bot",
      cwd: "/opt/checkgpt/artifacts/telegram-bot",
      script: "dist/index.mjs",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        ...env,
      },
    },
  ],
};
