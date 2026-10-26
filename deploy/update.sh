#!/usr/bin/env bash
# Update the VPS to the latest main and publish the build (see DEPLOY.md).
# Run from anywhere: bash /opt/po-bunker/deploy/update.sh
#
# Builds in the repo folder, then copies dist/ into the folder Nginx serves,
# so visitors never hit a half-built site. Nothing needs restarting.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
npm ci
npm run build
mkdir -p /var/www/po-bunker
rsync -a --delete dist/ /var/www/po-bunker/

echo "Deployed $(git log -1 --format='%h %s')"
