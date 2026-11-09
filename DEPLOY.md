# Deploying PO Bunker to the VPS

PO Bunker is two parts on the same VPS (`201.18.210.118`), behind one Nginx at
**https://shipping-bunker.barokahperkasagroup.tech**:

```
browser ──HTTPS──▶ Nginx (443) ─┬─▶ /var/www/po-bunker        static frontend (Vite build)
                                └─▶ /api/ ──▶ 127.0.0.1:8080  Go API (Docker)
                                                   │
                                                   └──▶ Postgres (Docker, no public port)
                                                        + uploaded files (Docker volume)
```

- The **frontend** is a static build. Node is only needed to build it.
- The **API** (`backend/`) and its **Postgres** run with Docker Compose (`deploy/docker-compose.yml`).
  Postgres is reachable only from the API container; the API is published on `127.0.0.1:8080` only, so the
  outside world reaches it through Nginx and nothing else.
- The browser only talks to its own origin, so there is no CORS and the refresh cookie stays `SameSite=Strict`.

Commands below are run on the VPS as `root`:

```bash
ssh -i ~/.ssh/id_ed25519_bgp_vps root@201.18.210.118
```

## One-time setup

### 0. Prerequisites (done)

- DNS: the A record `shipping-bunker` → `201.18.210.118` exists, and certbot has issued the certificate.
- Docker Engine and the compose plugin are installed (`sudo bash deploy/vps-prepare.sh`, safe to run again).
- Node 20.19+ or 22.12+ for the build; about 1.5 GB of free memory (swap counts).
- Port 8080 is free on the host: `ss -ltn | grep ':8080 '` prints nothing.

### 1. Get the code

```bash
cd /opt/po-bunker && git pull --ff-only
```

The old `/opt/po-bunker/.env` (the two `VITE_SUPABASE_*` values) is no longer read by anything; delete it.

### 2. Secrets

```bash
cd /opt/po-bunker/deploy
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in `POSTGRES_PASSWORD`, `JWT_SECRET` and `FILE_SIGNING_SECRET` with three different values from
`openssl rand -hex 32`, and `VESSEL_API_TOKEN` with the token for the SMS vessel API (it can stay empty at first: the
*Sync from SMS* button then says the sync is not configured on the server). `.env` is outside git (`.gitignore`) and is never
copied into an image.

Keep a copy of `JWT_SECRET` and `FILE_SIGNING_SECRET` somewhere safe. Changing the first signs everyone out; changing
the second invalidates download links that are already open.

### 3. Start the API and the database

```bash
cd /opt/po-bunker/deploy
docker compose up -d --build        # first build takes a few minutes
docker compose ps                   # db and api should both be "healthy" / "running"
curl -s http://127.0.0.1:8080/healthz    # {"status":"ok"}
```

The API creates the whole schema when it starts (embedded migrations, guarded by a database lock), so there is no
separate migration step. The old site keeps working on Supabase during all of this: nothing public has changed yet.

### 4. Nginx

Install the proxy snippet and include it in the site (once). In the server block that listens on 443 of
`/etc/nginx/sites-available/po-bunker` (certbot already wrote it), add this line above `location /assets/`:

```
    include /etc/nginx/snippets/po-bunker-api.conf;
```

```bash
install -d /etc/nginx/snippets
install -m 0644 /opt/po-bunker/deploy/nginx/po-bunker-api.conf /etc/nginx/snippets/po-bunker-api.conf
nano /etc/nginx/sites-available/po-bunker      # add the include line; also in the port 80 block if it still serves the site
nginx -t && systemctl reload nginx
curl -si https://shipping-bunker.barokahperkasagroup.tech/api/v1/auth/me | head -1    # HTTP/2 401 (JSON), not 404
```

After this, `update.sh` keeps the snippet current; the include line is the only manual edit.
(`deploy/nginx/shipping-bunker.conf` already has it, for a fresh install.)

### 5. Move the data (once)

Only master data moves: categories, units, vessel types, the three real companies and the 101 vessels. There are no real
orders in Supabase yet (only labelled test ones), users are created below, and the company letterheads are uploaded
again in step 8. Partners, products and code budgets in Supabase are all test data, so they are not copied: add the real
ones from the app after the cutover.

On your PC, from the repo folder (it only **reads** Supabase):

```bash
python deploy/import/export_supabase.py --workdir <a folder linked with `supabase link`> --out import.sql
scp -i ~/.ssh/id_ed25519_bgp_vps import.sql root@201.18.210.118:/root/import.sql
```

On the VPS:

```bash
cd /opt/po-bunker/deploy
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < /root/import.sql
echo "select 'companies', count(*) from companies union all select 'vessels', count(*) from vessels" | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
rm /root/import.sql
```

Expect 3 companies and 101 vessels. It is one transaction and refuses to run on a database that already has data, so a
mistake changes nothing and it cannot be applied twice. Id sequences continue after the imported rows.

### 6. First admin

```bash
cd /opt/po-bunker/deploy
docker compose exec -T api /app/admin create-user -email you@example.com -name "Your Name" -role admin
```

It prints a random password once. Sign in with it and change it from the account menu (*Ubah kata sandi*). Everyone else
is created from the **Pengguna** page by an admin. A forgotten password is reset by an admin there, or from the server:
`docker compose exec api /app/admin set-password -email you@example.com`.

### 7. Backups

```bash
bash /opt/po-bunker/deploy/backup.sh            # try it once
ls -lh /var/backups/po-bunker
```

Then schedule it (`/etc/cron.d/po-bunker-backup`, nightly at 01:30, 14 days kept):

```
30 1 * * * root bash /opt/po-bunker/deploy/backup.sh >> /var/log/po-bunker-backup.log 2>&1
```

Backups stay on this VPS, which protects against mistakes but not against losing the VPS: copy
`/var/backups/po-bunker` somewhere else now and then (for example `scp` or `rsync` to an office PC).

**Restore** (new empty database, for example after a rebuild): start the stack, stop the API, then load the dump and the files.

```bash
cd /opt/po-bunker/deploy
docker compose stop api
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c /var/backups/po-bunker/db-<stamp>.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
docker run --rm -v po-bunker_files:/data -v /var/backups/po-bunker:/backup --entrypoint sh postgres:17-alpine \
  -c 'rm -rf /data/* && tar xzf /backup/files-<stamp>.tar.gz -C /data && chown -R 65532:65532 /data'
docker compose start api
```

### 8. Publish the frontend (the cutover)

Only now does the public site switch from Supabase to the new API. Keep a copy of the site as it is now (the rollback
below uses it), then publish:

```bash
cp -a /var/www/po-bunker /var/www/po-bunker.supabase
bash /opt/po-bunker/deploy/update.sh
```

It refuses to publish if the API is unhealthy or there is no active admin. Then:

- Open https://shipping-bunker.barokahperkasagroup.tech, sign in, check Dashboard, Vessels and Companies.
- Open each company (*Perusahaan*), and upload its letterhead again (the logo files were not moved).
- Add the real partners (vendors), products, units and code budgets from *Data Master* (admin or staff).
- As admin, press *Sync from SMS* on Vessels (needs `VESSEL_API_TOKEN`).
- Create a test PO, upload a DO, complete it, and open the PDF and Excel to check the letterhead.

**Rollback:** Supabase has not been touched and the old frontend is a plain static build that talks to it directly. To go
back, `rsync -a --delete /var/www/po-bunker.supabase/ /var/www/po-bunker/` (the API containers can stay up). Anything
created in the new system after the cutover is not in Supabase, so roll back early or not at all. Keep Supabase untouched
until the team has used the new system for a while; decommissioning it is a separate step.

## Updating

After new commits are pushed to `main`:

```bash
bash /opt/po-bunker/deploy/update.sh
```

It pulls, rebuilds and restarts the API (new migrations apply on start), reloads Nginx with the current snippet and
publishes the frontend. Restarting the API takes a few seconds; the page stays up and requests in that moment get a 502
that the app reports as a connection error.

## Operating

| Task | Command (from `/opt/po-bunker/deploy`) |
| --- | --- |
| Status | `docker compose ps` |
| API logs | `docker compose logs -f --tail 100 api` |
| Restart the API | `docker compose restart api` |
| Change a setting in `.env` | edit it, then `docker compose up -d` |
| SQL shell | `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` |
| Disk used by Docker | `docker system df` |

Container logs are capped at 3 x 10 MB each (set by `vps-prepare.sh`).

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| Site doesn't answer at all | Nginx site not enabled, or DNS not pointing at the VPS |
| Default Nginx page or 404 on `/` | `root` in the Nginx file doesn't match `/var/www/po-bunker`, or the frontend was never published |
| 403 Forbidden | `namei -l /var/www/po-bunker/index.html` shows the folder Nginx can't read |
| Login page loads but sign-in says the server can't be reached; `/api/...` returns 404 or the SPA page | The include line is missing from the 443 server block (step 4), or Nginx wasn't reloaded |
| `/api/...` returns 502 | The API isn't running: `docker compose ps`, then `docker compose logs --tail 50 api` |
| API restarts in a loop | `docker compose logs api`: usually a missing or too-short secret in `.env`, or the database not reachable |
| "Terlalu banyak percobaan" at sign-in | The login rate limit; wait a little and try again |
| Uploads fail with a permission error | The `files` volume isn't writable by user 65532: `docker compose exec api ls -ld /data/files` should be owned by `nonroot` |
| Uploads fail with 413 | Nginx limit: the snippet sets `client_max_body_size 6m` |
| Sync from SMS says it is not configured on the server | `VESSEL_API_TOKEN` in `.env` is empty; fill it and `docker compose up -d` |
| Build killed with no clear error | Out of memory; add swap (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`) |
| Some office PCs block the site | The `.tech` domain is new; antivirus (for example RAV Endpoint Protection) may block it, and users allow it locally |
| Anything else from Nginx | `tail -n 50 /var/log/nginx/error.log` |
