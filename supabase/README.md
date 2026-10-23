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
| `save_purchase_order(p_id, p_header, p_lines)` | create (`p_id` null) or edit a draft; lines saved atomically |
| `confirm_purchase_order(p_id)`              | draft -> purchase, stamps approval                      |
| `cancel_purchase_order(p_id)`               | draft / to approve / purchase -> cancel                 |
| `set_purchase_order_draft(p_id)`            | to approve / purchase / cancel -> draft, clears approval |

Deleting an order is a plain `DELETE`, allowed only for draft or cancelled
orders. Bunker order numbers follow the old system: `NNN AC/<company general code>-OPS/BBM|AIR/<roman month>-<year>`,
e.g. `015 AC/IGE-OPS/BBM/III-2025`. The sequence restarts every month and is separate for fuel (`BBM`) and
fresh water (`AIR`). The company must have a General Code or the order cannot be created. Logistic orders
keep `PO/YYYY/NNNN` until their real format is known (migration 0004).
Totals are recomputed from the lines; tax is 0 for now.

## Importing master data

Fill the CSVs in `import-templates/` and import them with Studio's table
editor (Insert > Import data from CSV). Import in this order so foreign keys
resolve, using the ids Postgres assigns (look them up after each import):

1. `business_units`, `vessel_types`, `code_budgets`
2. `regions` (parents before children)
3. `companies` (fill `code_company_general`, needed for PO numbers), `partners`
4. `products` (needs category / uom / code budget ids)
5. `vessels` (needs vessel type / business unit ids; `operator_id` and `owner_id` are company ids; `code` is printed on the PO)
