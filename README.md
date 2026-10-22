# PO Bunker

Purchase order management for PT Barokah Gemilang Perkasa: React 19 + TypeScript + Vite on top of Supabase (Auth + Postgres).

See [DOCUMENTATION.md](DOCUMENTATION.md) for how the app is used and [supabase/README.md](supabase/README.md) for the database.

## Run locally

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

The app opens at http://localhost:5173. Sign in with a Supabase Auth account that also has an active row in `po_bunker.profiles`.

## Build

```bash
npm run build
```

The output in `dist/` is a static site; there is no backend or `/api` proxy to configure. The Supabase URL and anon key are baked in at build time from `.env`.

## Backend

The database lives in the `po_bunker` schema of the shared CGA Supabase project. Migrations are in [supabase/migrations](supabase/migrations) and are applied by hand in the Studio SQL Editor (see [supabase/README.md](supabase/README.md)).
