#!/usr/bin/env bash
set -euo pipefail

# Determine project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$PROJECT_ROOT"

# Detect package manager
if [ -f "$PROJECT_ROOT/pnpm-lock.yaml" ]; then
  PM=pnpm
  INSTALL_CMD="pnpm install --frozen-lockfile"
  RUN_CMD="pnpm run"
else
  PM=npm
  INSTALL_CMD="npm ci"
  RUN_CMD="npm run"
fi

echo "Using package manager: $PM"

echo "==> Install backend deps (ci)"
cd "$PROJECT_ROOT/service"
eval "$INSTALL_CMD"

echo "==> Build backend"
$RUN_CMD build

echo "==> Install frontend deps (npm install to refresh lock)"
cd "$PROJECT_ROOT/frontend"
npm install

echo "==> Build frontend"
$RUN_CMD build

echo "==> Start with PM2 (production env)"
cd "$PROJECT_ROOT"
pm2 start ecosystem.config.js --env production
pm2 save

echo
echo "If first time on this host, run: pm2 startup"
echo "Deployment done. Check logs with: pm2 logs"
