#!/usr/bin/env bash
# آپدیت یک‌دستوری سازینو روی saztik.com
#   ./deploy.sh              → بیلد + آپلود بازی
#   ./deploy.sh --server     → بیلد + آپلود بازی + آپلود سرور و ری‌استارت pm2
# پیش‌نیاز: دسترسی SSH با کلید (ssh user@saztik.com بدون رمز کار کند)
set -e
HOST="${DEPLOY_HOST:-user@saztik.com}"
WEB_DIR="${DEPLOY_WEB_DIR:-/var/www/sazino}"
API_DIR="${DEPLOY_API_DIR:-/var/www/sazino-api}"

echo "▶ build…"
npm run build

echo "▶ upload game → $HOST:$WEB_DIR"
ssh "$HOST" "mkdir -p $WEB_DIR"
scp dist/index.html dist/tonconnect-manifest.json "$HOST:$WEB_DIR/"

if [[ "$1" == "--server" ]]; then
  echo "▶ upload server → $HOST:$API_DIR"
  ssh "$HOST" "mkdir -p $API_DIR"
  scp server/index.js server/ton.js server/bot.js "$HOST:$API_DIR/"
  ssh "$HOST" "cd $API_DIR && npm i --silent express @ton/ton @ton/core @ton/crypto && pm2 restart sazino-api sazino-bot --update-env || true"
fi

echo "✅ done → https://saztik.com/sazino/   (اگر تلگرام نسخهٔ قدیمی نشان داد: Settings → Data → Clear cache)"
