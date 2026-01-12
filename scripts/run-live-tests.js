const { spawnSync } = require('child_process');

const env = {
  ...process.env,
  AI_MODE: 'live',
  LIVE_AI_TESTS: process.env.LIVE_AI_TESTS || 'true',
};

const result = spawnSync('npm', ['--prefix', 'service', 'run', 'test:live'], {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(result.status || 0);
