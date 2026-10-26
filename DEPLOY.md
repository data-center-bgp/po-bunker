# Deploying PO Bunker to the VPS

PO Bunker is a static Vite build. Nginx serves it at
**https://shipping-bunker.barokahperkasagroup.tech** with a Let's Encrypt
certificate. There is no Node process to run or restart: Node is only needed to
build. The browser talks to Supabase (CGA) directly.

```
browser ──HTTPS──▶ Nginx (443) ──▶ /var/www/po-bunker (static files)
   │
   └──HTTPS──▶ Supabase CGA (login, data, storage, the vessel-sync function)
```

Same VPS and same pattern as the shipyard report and issue tracker apps
(`201.18.210.118`). Commands below are run on the VPS as `root`.

```bash
ssh -i ~/.ssh/id_ed25519_bgp_vps root@201.18.210.118
```

## 0. DNS (done once)

The A record `shipping-bunker` → `201.18.210.118` must exist. Check it from any
machine before step 6, because Let's Encrypt needs it:

```bash
nslookup shipping-bunker.barokahperkasagroup.tech
```

## 1. Check the VPS

```bash
node -v    # needs v20.19+ or v22.12+ (Vite 7), only used for the build
nginx -v
free -h    # the build needs roughly 1.5 GB of free RAM (swap counts)
```

- **Node too old:** install Node 22 LTS, or use [nvm](https://github.com/nvm-sh/nvm)
  (`nvm install 22`) if other apps on the VPS depend on the system Node.
- **Build killed with no clear error:** it ran out of memory. Add swap and retry
  (skip if `swapon --show` already lists one):
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```

## 2. Get the code

The GitHub repo is public, so no key is needed:

```bash
git clone https://github.com/data-center-bgp/po-bunker.git /opt/po-bunker
cd /opt/po-bunker
```

## 3. Environment

Create `/opt/po-bunker/.env` with the two values from the `.env` on your PC
(`nano .env`, paste, save):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

```bash
chmod 600 .env
```

Do **not** copy a service-role key or the SMS vessel API token. The app doesn't
use them (the token lives in a Supabase secret) and the service-role key
bypasses all access rules.

`VITE_*` values are built into the JavaScript, so after changing `.env` you must
rebuild (`bash deploy/update.sh`).

## 4. Build and publish

```bash
npm ci
npm run build
mkdir -p /var/www/po-bunker
rsync -a --delete dist/ /var/www/po-bunker/
```

## 5. Nginx

```bash
cp deploy/nginx/shipping-bunker.conf /etc/nginx/sites-available/po-bunker
ln -s /etc/nginx/sites-available/po-bunker /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

If this Nginx uses `/etc/nginx/conf.d/` instead of `sites-available`, copy the
file to `/etc/nginx/conf.d/po-bunker.conf` and skip the `ln` line.
`http://shipping-bunker.barokahperkasagroup.tech` should now show the login
page. (The VPS has a catch-all that drops requests for unknown names, so before
this step the address simply doesn't answer.)

## 6. HTTPS

```bash
certbot --nginx -d shipping-bunker.barokahperkasagroup.tech
```

When asked, choose to **redirect** HTTP to HTTPS. Certbot renews the
certificate automatically. If certbot isn't installed:
`apt-get install -y certbot python3-certbot-nginx`.

## 7. Check it

- Open https://shipping-bunker.barokahperkasagroup.tech and sign in.
- Orders, Vessels and Companies should load. As admin, open Vessels: the
  **Sync from SMS** button should be there.
- Refresh the page: it should reload, not 404.
- Order PDF preview and Excel download should work (they run in the browser).

Supabase needs no changes: the app uses email/password login only, so the site
address doesn't have to be registered anywhere. Do not change the CGA project's
Site URL (it is shared with other apps). The `po-bunker-sync-vessels` function
allows any origin, so it works from this domain too.

## Updating

After new commits are pushed to `main`:

```bash
bash /opt/po-bunker/deploy/update.sh
```

It pulls, rebuilds and publishes; nothing needs restarting. Database changes are
separate: new files in `supabase/migrations/` are applied by hand (see
`supabase/README.md`) before or together with the deploy that needs them.

**Migration 0007 (Submitted / Completed / Cancelled lifecycle) is not backwards compatible.** It changes the order states and
drops the old confirm/approve functions, so the previous frontend stops working on orders. Apply it and run
`bash deploy/update.sh` back to back.

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| Site doesn't answer at all | Step 5 not done yet (the VPS catch-all drops unknown names), or DNS not pointing at the VPS |
| Default Nginx page or 404 on `/` | `root` in the Nginx file doesn't match `/var/www/po-bunker`, or step 4 wasn't run |
| 403 Forbidden | `namei -l /var/www/po-bunker/index.html` shows the folder Nginx can't read |
| Blank page, console says "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY" | `.env` was missing or incomplete when the build ran; fix it and run `bash deploy/update.sh` |
| Login works but pages show errors | The Supabase URL/key in `.env` don't match the CGA project; rebuild after changing them |
| "This account does not have access to PO Bunker" | The user has no active row in `po_bunker.profiles` (see `supabase/README.md`) |
| Some office PCs block the site | The `.tech` domain is new; antivirus (for example RAV Endpoint Protection) may block it, and users allow it locally |
| Anything else from Nginx | `tail -n 50 /var/log/nginx/error.log` |
