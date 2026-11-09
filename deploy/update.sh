#!/usr/bin/env bash
# Update the VPS to the latest main: the API (Docker) first, then the frontend (see DEPLOY.md).
# Run as root from anywhere: bash /opt/po-bunker/deploy/update.sh
#
# Order matters. The API goes first, so a frontend that needs a new endpoint is never
# published before the endpoint exists; the frontend is copied last, in one rsync, so
# visitors never hit a half-built site. Database migrations run when the API container starts.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f deploy/docker-compose.yml"

if [ ! -f deploy/.env ]; then
  echo "deploy/.env is missing: create it from deploy/.env.example first (DEPLOY.md, step 3)." >&2
  exit 1
fi

git pull --ff-only

echo "==> API"
$COMPOSE up -d --build

# Wait until the API answers; it applies its migrations before it starts listening.
ok=""
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "The API did not become healthy. Last log lines:" >&2
  $COMPOSE logs --tail 40 api >&2
  exit 1
fi

# Publishing a frontend that nobody can sign in to would lock everyone out.
admins=$(echo "select count(*) from users where role = 'admin' and active" | $COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA' | tr -d '[:space:]')
if [ "${admins:-0}" -lt 1 ]; then
  echo "There is no active admin yet. Create one first (DEPLOY.md, step 6), then run this again." >&2
  exit 1
fi

echo "==> Nginx"
install -d /etc/nginx/snippets
install -m 0644 deploy/nginx/po-bunker-api.conf /etc/nginx/snippets/po-bunker-api.conf
nginx -t
systemctl reload nginx

echo "==> Frontend"
npm ci
npm run build
mkdir -p /var/www/po-bunker
rsync -a --delete dist/ /var/www/po-bunker/

docker image prune -f >/dev/null

echo "Deployed $(git log -1 --format='%h %s')"
