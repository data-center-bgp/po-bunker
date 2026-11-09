# PO Bunker API (Go + Gin)

The backend that replaces the Supabase project: REST API under `/api/v1`, PostgreSQL, files on disk. It is built in phases.
Done so far: the scaffold (phase 0) and the schema + login (phase 1). Master data, orders, files and the vessel sync come next.

## Stack

Go 1.26+, [Gin](https://github.com/gin-gonic/gin) on standard `net/http`, `pgx/v5`, `goose` migrations, JWT, bcrypt.

## Run locally

```bash
cd backend
cp .env.example .env      # point DATABASE_URL at a scratch Postgres database
set -a; source .env; set +a
go run ./cmd/api          # applies the migrations at start
curl http://127.0.0.1:8080/healthz     # {"status":"ok"}

# first admin (password read from stdin, or generated and printed once)
echo 'a-strong-password' | go run ./cmd/admin create-user -email you@example.com -name "You" -role admin -password-stdin
```

On the VPS the same tool runs inside the container:
`docker compose exec api /app/admin create-user -email ... -name ... -role admin`.

## Check

```bash
go vet ./...
TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' go test ./...
```

The database tests create a throwaway database per test on the server in `TEST_DATABASE_URL` (a user that may
`CREATE DATABASE`) and drop it afterwards; without that variable they are skipped.

## Layout

| Path | What |
| --- | --- |
| `cmd/api` | the server (`api healthcheck` is the container health probe) |
| `cmd/admin` | operator CLI: `create-user`, `set-password` |
| `internal/config` | environment settings, validated at start |
| `internal/httpapi` | Gin router, middleware, auth handlers, the JSON error format |
| `internal/auth` | passwords (bcrypt), access JWTs, rotating refresh tokens, login rate limit |
| `internal/users` | user model and queries |
| `internal/db`, `internal/testdb` | migration runner (goose, embedded) and the test database helper |
| `migrations/` | SQL schema (`00001` is the port of the ten Supabase migrations) |

## Conventions

- Every error answers `{"error":{"code","message"}}`; codes are stable and are what the frontend translates.
- Handlers parse, validate and authorize; rules live in services; SQL lives next to the service that uses it.
- Use `c.Copy()` before touching the Gin context from a goroutine.
- SQL is written by hand with `pgx` (no ORM, no code generation); the database tests are what check it.

## Auth

`POST /api/v1/auth/login` returns a 15-minute access token (send it as `Authorization: Bearer ...`) and sets a rotating
refresh token in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth`. `POST /auth/refresh` swaps it for a new
pair, `POST /auth/logout` ends the session, `GET /auth/me` returns the user, `POST /auth/change-password` changes the
password and ends the other sessions. The middleware reads the user from the database on every request, so deactivating a
user or changing a role takes effect immediately. Login attempts are rate limited per IP and per IP + email.

## Deploy

`deploy/docker-compose.yml` runs Postgres and this API; Nginx proxies `/api/` to `127.0.0.1:8080`
(see `DEPLOY.md`, updated in the deployment phase).
