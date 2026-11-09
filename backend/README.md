# PO Bunker API (Go + Gin)

The backend that replaces the Supabase project: REST API under `/api/v1`, PostgreSQL, files on disk. It is built in phases
(see the plan in the repo history); the current state is phase 0, the scaffold: configuration, a health check and the
container setup. Business endpoints arrive in the next phases.

## Stack

Go 1.26+, [Gin](https://github.com/gin-gonic/gin) on standard `net/http`, `pgx/v5`, later `sqlc` + `goose`, JWT, bcrypt.

## Run locally

```bash
cd backend
cp .env.example .env      # point DATABASE_URL at a scratch Postgres database
set -a; source .env; set +a
go run ./cmd/api
curl http://127.0.0.1:8080/healthz     # {"status":"ok"}
```

## Check

```bash
go vet ./...
go test ./...
```

## Layout

| Path | What |
| --- | --- |
| `cmd/api` | the server (`api healthcheck` is the container health probe) |
| `internal/config` | environment settings, validated at start |
| `internal/httpapi` | Gin router, middleware, the JSON error format |
| `migrations/`, `queries/` | schema and SQL (phase 1) |

## Conventions

- Every error answers `{"error":{"code","message"}}`; codes are stable and are what the frontend translates.
- Handlers parse, validate and authorize; rules live in services; SQL lives in `queries/`.
- Use `c.Copy()` before touching the Gin context from a goroutine.

## Deploy

`deploy/docker-compose.yml` runs Postgres and this API; Nginx proxies `/api/` to `127.0.0.1:8080`
(see `DEPLOY.md`, updated in the deployment phase).
