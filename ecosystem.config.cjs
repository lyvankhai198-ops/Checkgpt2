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
      },
    },
  ],
};
