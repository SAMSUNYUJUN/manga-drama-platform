/**
 * PM2进程管理配置
 */

module.exports = {
  apps: [
    {
      name: 'manga-drama-backend',
      cwd: './service',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
    },
    {
      name: 'manga-drama-frontend',
      cwd: './frontend',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 3003 --host',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true,
      max_memory_restart: '300M',
      autorestart: true,
      watch: false,
    },
  ],
};
