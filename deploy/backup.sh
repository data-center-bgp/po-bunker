#!/usr/bin/env bash
# Nightly backup of the PO Bunker database and uploaded files (see DEPLOY.md, "Backups").
#
#   bash /opt/po-bunker/deploy/backup.sh
#
# Writes db-<stamp>.sql.gz and files-<stamp>.tar.gz to /var/backups/po-bunker and deletes
# backups older than KEEP_DAYS (default 14). A failed run leaves no half-written file behind.
set -euo pipefail
cd "$(dirname "$0")"

DEST="${BACKUP_DIR:-/var/backups/po-bunker}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
COMPOSE="docker compose -f docker-compose.yml"

umask 077
mkdir -p "$DEST"

# Database: plain SQL, restorable with psql. The credentials come from the db container.
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$DEST/db-$STAMP.sql.gz.part"
gzip -t "$DEST/db-$STAMP.sql.gz.part"
mv "$DEST/db-$STAMP.sql.gz.part" "$DEST/db-$STAMP.sql.gz"

# Files: logos and Delivery Orders live in the "files" volume. Reuse the postgres image for tar.
docker run --rm -v po-bunker_files:/data:ro --entrypoint tar postgres:17-alpine czf - -C /data . > "$DEST/files-$STAMP.tar.gz.part"
gzip -t "$DEST/files-$STAMP.tar.gz.part"
mv "$DEST/files-$STAMP.tar.gz.part" "$DEST/files-$STAMP.tar.gz"

find "$DEST" -maxdepth 1 \( -name 'db-*.sql.gz' -o -name 'files-*.tar.gz' -o -name '*.part' \) -mtime +"$KEEP_DAYS" -delete

echo "backup ok: $DEST/db-$STAMP.sql.gz ($(du -h "$DEST/db-$STAMP.sql.gz" | cut -f1)), files-$STAMP.tar.gz ($(du -h "$DEST/files-$STAMP.tar.gz" | cut -f1))"
