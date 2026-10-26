# PO Bunker database (Supabase)

Backend for the PO Bunker frontend: a `po_bunker` schema on the shared **CGA**
Supabase project (ref `mgxdvnnvruoyhnzgrtur`). Other apps share this project
and its `auth.users`, so everything here is namespaced and RLS-scoped to this
app's users.

## Rules for this shared project

- Apply migrations by pasting them into **Studio > SQL Editor**, in order.
  Never `supabase db push` or `migration repair` against CGA: its migration
  history belongs to ~140 other apps.
- No triggers on `auth.users`. Profiles are added by hand (see 0003).
- Passwords are shared across every CGA app; there is no reset-password flow
  in this app on purpose.
- The database is live and shared. Label any test rows you create and delete
  them afterwards.
- Never commit `.env` files or keys. The anon key is public by design but
  still stays out of git; the service role key must never reach the frontend.

## Setup

1. Run `migrations/0001_schema.sql`, `0002_order_logic.sql`, `0003_seed.sql`.
2. Expose the schema to the API. CGA's exposed schemas are set on the
   `authenticator` role and override the Studio "Exposed schemas" field, so
   **append** to the current value, don't retype it:

   ```sql
   select rolconfig from pg_roles where rolname = 'authenticator';
   -- copy the existing pgrst.db_schemas value, then:
   alter role authenticator set pgrst.db_schemas = '<existing list>, po_bunker';
   notify pgrst, 'reload config';
   notify pgrst, 'reload schema';
   ```
3. Create the first admin: create (or reuse) a user in Authentication > Users,
   then run the commented `insert into po_bunker.profiles ...` in 0003.
4. Import master data (below).

## Roles

| Role   | Orders          | Companies / partners / regions | Vessels, products, code budgets, profiles |
| ------ | --------------- | ------------------------------ | ----------------------------------------- |
| admin  | create/edit/... | create/edit                    | full                                      |
| staff  | create/edit/... | create/edit                    | read                                      |
| viewer | read            | read                           | read                                      |

Users without an active row in `po_bunker.profiles` get nothing, even though
they can sign in to Supabase Auth.

## How writes work

Clients cannot INSERT/UPDATE orders or order lines directly. They call:

| RPC                                         | Does                                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| `save_purchase_order(null, p_header, p_lines)` | submit a new order (status `submitted`, locked afterwards) |
| `complete_purchase_order(p_id, p_lines)`    | submitted -> completed; needs >= 1 DO file and `[{line_id, actual_qty}]` for every line |
| `cancel_purchase_order(p_id, p_reason)`     | submitted -> cancelled; a reason is required            |
| `set_my_signature(p_path)`                  | legacy (signature path of the caller)                   |

Lifecycle (migration 0007): `submitted` -> `completed` (Delivery Order uploaded in `purchase_order_documents`, actual
quantity per line) or `cancelled` (reason). Old states were mapped: draft / to approve / purchase -> submitted, done ->
completed, cancel -> cancelled. The three-level approval RPCs, confirm, set-to-draft and line-status functions were dropped;
the old approval columns stay for history. Orders cannot be deleted by clients. DO files: PDF, JPG or PNG, max 5 MB, under
`documents/<order id>/` in the `po_bunker_assets` bucket, added or removed only while the order is submitted.

Totals are recomputed in the database (migration 0005): `untaxed = active lines - discount`,
`tax = untaxed * VAT% / 100`, `total = untaxed + tax`. Lines with status `cancel` are excluded.

## Logos and remarks (migration 0005; approvals replaced by the lifecycle in 0007)

- Private storage bucket `po_bunker_assets`: `logos/<company id>/<timestamp>.png` (admin/staff) and, since migration 0007,
  `documents/<order id>/<timestamp>-<name>` for Delivery Order files (admin/staff, only while the order is submitted).
  Any active PO Bunker user can read. Policies are named `PO Bunker ...` and scoped to this bucket, so other apps on the
  shared project are unaffected.
- Company logos are uploaded on the Companies page. Remarks live in `purchase_order_remarks` and can change in any order state.
- The three-level digital approval (and "My signature") from migration 0005 was removed from the app by 0007. Old approval
  columns and signature files stay for history and still print on old orders; `profiles.approval_levels` and
  `signature_path` are unused.

## Vessels: sync from the company SMS API (migration 0006)

Vessels come from `https://sms.barokahmarineconsulting.com/api/csbd/ships`. An admin presses **Sync from SMS** on the
Vessels page; that calls the Edge Function `po-bunker-sync-vessels`, which

1. checks the caller is an active PO Bunker admin,
2. reads the API token from the project secret `VESSEL_API_TOKEN` (fallback `API_VESSEL_PMS_BAROKAH`) and fetches the ships,
3. hands them to `po_bunker.sync_vessels()` (service_role only), which upserts by the API id (`vessels.external_id`),
   creates/matches vessel types by code, and deactivates (never deletes) vessels that disappeared from the API.

Not touched by the sync, so they can be filled by hand: `code` (printed in the PO's Vessel column; the PDF/Excel show the
name while it is empty), tonnage, IMO, call sign, operator, owner. A vessel added by hand with the same name is adopted
instead of duplicated. The API's `headcount` (company code/name), fleet and operation head are stored as text.

The token never reaches the browser or the repo. Set or rotate it with
`supabase secrets set VESSEL_API_TOKEN=... --project-ref mgxdvnnvruoyhnzgrtur`. Deploy the function (CGA also has other
apps' functions, including one called `sync-vessels`; do not reuse that name):

```bash
supabase functions deploy po-bunker-sync-vessels --no-verify-jwt --use-api --project-ref mgxdvnnvruoyhnzgrtur
```

JWT verification is done inside the function (CGA uses the new publishable keys), so keep `--no-verify-jwt`.

## Importing master data

Fill the CSVs in `import-templates/` and import them with Studio's table
editor (Insert > Import data from CSV). Import in this order so foreign keys
resolve, using the ids Postgres assigns (look them up after each import):

1. `business_units`, `vessel_types`, `code_budgets`
2. `regions` (parents before children)
3. `companies` (fill `code_company_general`, needed for PO numbers), `partners`
4. `products` (needs category / uom / code budget ids)
5. `vessels` normally come from the SMS sync (above). Manual import is still possible (needs vessel type / business unit ids; `operator_id` and `owner_id` are company ids; `code` is printed on the PO)
