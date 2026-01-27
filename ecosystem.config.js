module.exports = {
  apps: [
    {
      name: 'manga-drama-backend',
      cwd: './service',
      script: 'npm',
      args: 'run start:prod',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        HOST: '0.0.0.0',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4025,
        HOST: '0.0.0.0',
      },
      out_file: './logs/backend-out.log',
      error_file: './logs/backend-error.log',
      merge_logs: true,
      max_restarts: 5,
      restart_delay: 5000,
    },
    {
      name: 'manga-drama-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run start:prod',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4026,
      },
      out_file: './logs/frontend-out.log',
      error_file: './logs/frontend-error.log',
      merge_logs: true,
      max_restarts: 5,
      restart_delay: 5000,
    },
  ],
};
