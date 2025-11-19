#!/usr/bin/env bash
set -euo pipefail

# Quick deploy script for IP-only setup (no domain).
# Usage on the server (Ubuntu): bash deploy/deploy_ip.sh

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run as a normal user (e.g., 'app'), not root."
fi

APP_DIR="${APP_DIR:-$HOME/apps/boardchat}"
WEB_ROOT="/var/www/boardchat"

echo "[1/5] Installing system packages..."
sudo apt update
sudo apt install -y git python3-venv python3-pip nginx ffmpeg

echo "[2/5] Python venv + requirements..."
cd "$APP_DIR"
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

echo "[3/5] Frontend build..."
pushd frontend
export VITE_API_BASE=/api
npm ci
npm run build
popd

echo "[4/5] Publish static site..."
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a frontend/dist/ "$WEB_ROOT"/

echo "[5/5] Nginx config..."
sudo cp deploy/nginx-ip.conf /etc/nginx/sites-available/boardchat
sudo ln -sf /etc/nginx/sites-available/boardchat /etc/nginx/sites-enabled/boardchat
sudo nginx -t
sudo systemctl reload nginx

echo "Done. Visit: http://YOUR_SERVER_IP"


