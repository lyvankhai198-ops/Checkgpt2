/**
 * PM2 ecosystem config — dùng trên VPS production.
 * Khởi động: pm2 start ecosystem.config.cjs
 * Sau khi reboot: pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "api-server",
      cwd: "./artifacts/api-server",
      script: "dist/index.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      // Tự restart khi crash
      autorestart: true,
      // Restart nếu dùng quá 500MB RAM
      max_memory_restart: "500M",
      // Giữ logs trong 7 ngày
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "telegram-bot",
      cwd: "./artifacts/telegram-bot",
      script: "dist/index.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_memory_restart: "200M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "admin-dashboard",
      cwd: "./artifacts/admin-dashboard",
      script: "npx",
      args: "serve dist -p 3002",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
    },
  ],
};
