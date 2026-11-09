# PO Bunker

Purchase order management for PT Barokah Gemilang Perkasa: a React 19 + TypeScript + Vite frontend and a Go (Gin) API with
PostgreSQL in [backend/](backend/). See [DOCUMENTATION.md](DOCUMENTATION.md) for how the app is used and
[backend/README.md](backend/README.md) for the API.

## Run locally

You need Node, Go (1.26+) and a PostgreSQL database.

```bash
# 1. the API (applies its migrations at start); see backend/README.md for the settings
cd backend
cp .env.example .env              # point DATABASE_URL at a scratch database
set -a; source .env; set +a
go run ./cmd/api                  # listens on :8080
echo 'a-strong-password' | go run ./cmd/admin create-user -email you@example.com -name "You" -role admin -password-stdin

# 2. the frontend (in another terminal, from the repo root)
npm install
npm run dev                       # http://localhost:5173, forwards /api to http://127.0.0.1:8080
```

Sign in with the user you created. To point the dev server at an API elsewhere, set `VITE_PROXY_TARGET`
(see `.env.example`).

## Build

```bash
npm run build
```

The output in `dist/` is a static site. In production Nginx serves it and proxies `/api/` to the API container
(see [DEPLOY.md](DEPLOY.md)); the browser only ever talks to its own origin.

## Backend

[backend/](backend/) is the Go API: login (JWT + rotating refresh cookie), master data, purchase orders with numbering and
totals, Delivery Order files on disk, the SMS vessel sync and user management. Run its tests with
`TEST_DATABASE_URL=... go test ./...`.

[supabase/](supabase/) holds the previous backend (migrations, import templates, the Edge Function). It is kept for reference
and for the one-off data import; the app no longer uses it.
