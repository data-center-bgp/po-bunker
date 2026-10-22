-- PO Bunker: schema, tables, RLS and grants.
--
-- Runs on the shared CGA Supabase project, so everything lives in its own
-- `po_bunker` schema and every policy is scoped to this app's users through
-- po_bunker.caller_role() (users of the other apps get nothing).
--
-- Run in the Studio SQL Editor. Do NOT use `supabase db push` on CGA.
-- Run order: 0001 -> 0002 -> 0003, then expose the schema (see README.md).

create schema if not exists po_bunker;

-- ---------------------------------------------------------------------------
-- Shared trigger helper
-- ---------------------------------------------------------------------------

create or replace function po_bunker.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: who may use the app (auth.users is shared with other apps, so
-- there is deliberately NO trigger on auth.users; rows are added by an admin)
-- ---------------------------------------------------------------------------

create table po_bunker.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null unique,
  role       text not null default 'staff' check (role in ('admin', 'staff', 'viewer')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Role helpers. SECURITY DEFINER so RLS policies (and the RPCs) can look at
-- profiles without recursing into profiles' own policies.
create or replace function po_bunker.caller_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from po_bunker.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function po_bunker.can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(po_bunker.caller_role() in ('admin', 'staff'), false)
$$;

create or replace function po_bunker.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(po_bunker.caller_role() = 'admin', false)
$$;

-- Never leave the app without an active admin.
create or replace function po_bunker.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active
     and (tg_op = 'DELETE' or not (new.role = 'admin' and new.active)) then
    if not exists (
      select 1 from po_bunker.profiles
      where role = 'admin' and active and id <> old.id
    ) then
      raise exception 'Cannot remove or demote the last active admin';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger profiles_guard_last_admin
  before update or delete on po_bunker.profiles
  for each row execute function po_bunker.guard_last_admin();

-- ---------------------------------------------------------------------------
-- Reference / master data
-- ---------------------------------------------------------------------------

create table po_bunker.business_units (
  id         bigint generated always as identity primary key,
  name       text not null,
  code       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table po_bunker.regions (
  id           bigint generated always as identity primary key,
  name         text not null,
  code         text,
  description  text,
  level_region text,
  bps_code     integer,
  parent_id    bigint references po_bunker.regions (id),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index regions_parent_idx on po_bunker.regions (parent_id);

create table po_bunker.companies (
  id                   bigint generated always as identity primary key,
  name                 text not null,
  code_company         text,
  code_company_general text,
  active               boolean not null default true,
  email                text,
  phone                text,
  website              text,
  vat                  text,
  street               text,
  street2              text,
  city                 text,
  zip                  text,
  region_id            bigint references po_bunker.regions (id),
  currency             text not null default 'IDR',
  business_unit_id     bigint references po_bunker.business_units (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index companies_code_company_key
  on po_bunker.companies (code_company) where code_company is not null;
create index companies_region_idx on po_bunker.companies (region_id);

-- vessel_id is added after `vessels` exists (vessels reference partners).
create table po_bunker.partners (
  id          bigint generated always as identity primary key,
  name        text not null,
  type        text not null default 'contact',
  is_company  boolean not null default false,
  is_supplier boolean not null default false,
  is_customer boolean not null default false,
  active      boolean not null default true,
  email       text,
  phone       text,
  mobile      text,
  website     text,
  vat         text,
  street      text,
  street2     text,
  city        text,
  zip         text,
  state       text,
  country     text,
  vessel_id   bigint,
  parent_id   bigint references po_bunker.partners (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index partners_parent_idx on po_bunker.partners (parent_id);

create table po_bunker.vessel_types (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table po_bunker.vessels (
  id                   bigint generated always as identity primary key,
  name                 text not null,
  type_id              bigint references po_bunker.vessel_types (id),
  gross_tonage         numeric(18, 2),
  call_sign            text,
  imo_no               text,
  mmsi_no              text,
  registered_year      text,
  registered_place     text,
  operator_id          bigint references po_bunker.partners (id),
  owner_id             bigint references po_bunker.partners (id),
  business_unit_id     bigint references po_bunker.business_units (id),
  flag                 text,
  last_docking         date,
  intermediate_docking date,
  annual_docking       date,
  status_doc_office    text,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index vessels_type_idx on po_bunker.vessels (type_id);

alter table po_bunker.partners
  add constraint partners_vessel_id_fkey
  foreign key (vessel_id) references po_bunker.vessels (id);

create table po_bunker.uoms (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "category" in the UI, "divisi" in the old API.
create table po_bunker.product_categories (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table po_bunker.code_budgets (
  id         bigint generated always as identity primary key,
  name       text not null,
  code       text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table po_bunker.products (
  id               bigint generated always as identity primary key,
  name             text not null,
  default_code     text,
  category_id      bigint not null references po_bunker.product_categories (id),
  uom_id           bigint not null references po_bunker.uoms (id),
  code_budget_id   bigint references po_bunker.code_budgets (id),
  standard_price   numeric(18, 4) not null default 0,
  list_price       numeric(18, 4) not null default 0,
  merk             text,
  model            text,
  serial_number    text,
  specs            text,
  description      text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index products_category_idx on po_bunker.products (category_id);

-- ---------------------------------------------------------------------------
-- Purchase orders. Clients never INSERT/UPDATE these tables directly; writes
-- go through the RPCs in 0002 (header + lines are saved atomically and the
-- state machine is enforced). Clients may only SELECT and DELETE (draft or
-- cancelled orders).
-- ---------------------------------------------------------------------------

create table po_bunker.po_counters (
  year     integer primary key,
  last_seq integer not null default 0
);

create table po_bunker.purchase_orders (
  id                            bigint generated always as identity primary key,
  name                          text not null unique,
  company_id                    bigint not null references po_bunker.companies (id),
  partner_id                    bigint not null references po_bunker.partners (id),
  order_type                    text not null
                                check (order_type in ('bunker_fuel', 'bunker_water', 'logistic')),
  state                         text not null default 'draft'
                                check (state in ('draft', 'to approve', 'purchase', 'done', 'cancel')),
  date_order                    timestamptz not null,
  date_approve                  timestamptz,
  notes                         text not null default '',
  is_ppn                        boolean not null default false,
  amount_untaxed                numeric(18, 2) not null default 0,
  amount_tax                    numeric(18, 2) not null default 0,
  amount_discount               numeric(18, 2) not null default 0,
  amount_total                  numeric(18, 2) not null default 0,
  created_by                    uuid references po_bunker.profiles (id) on delete set null,
  first_approved_by             uuid references po_bunker.profiles (id) on delete set null,
  first_approved_at             timestamptz,
  first_approved_signature_path text,
  second_approved_by            uuid references po_bunker.profiles (id) on delete set null,
  second_approved_at            timestamptz,
  second_approved_signature_path text,
  third_approved_by             uuid references po_bunker.profiles (id) on delete set null,
  third_approved_at             timestamptz,
  third_approved_signature_path text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
create index purchase_orders_company_idx on po_bunker.purchase_orders (company_id);
create index purchase_orders_partner_idx on po_bunker.purchase_orders (partner_id);
create index purchase_orders_state_idx   on po_bunker.purchase_orders (state);
create index purchase_orders_date_idx    on po_bunker.purchase_orders (date_order desc, id desc);

create table po_bunker.purchase_order_lines (
  id             bigint generated always as identity primary key,
  order_id       bigint not null references po_bunker.purchase_orders (id) on delete cascade,
  product_id     bigint not null references po_bunker.products (id),
  vessel_id      bigint not null references po_bunker.vessels (id),
  region_id      bigint references po_bunker.regions (id),
  code_budget_id bigint references po_bunker.code_budgets (id),
  category_id    bigint references po_bunker.product_categories (id),
  uom_id         bigint not null references po_bunker.uoms (id),
  product_qty    numeric(18, 4) not null check (product_qty > 0),
  price_unit     numeric(18, 4) not null check (price_unit >= 0),
  price_subtotal numeric(18, 2) generated always as (round(product_qty * price_unit, 2)) stored,
  project        text not null default '',
  requested_by   uuid references po_bunker.profiles (id) on delete set null,
  priority       text check (priority in ('low', 'medium', 'high')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index pol_order_idx   on po_bunker.purchase_order_lines (order_id);
create index pol_product_idx on po_bunker.purchase_order_lines (product_id);
create index pol_vessel_idx  on po_bunker.purchase_order_lines (vessel_id);

-- ---------------------------------------------------------------------------
-- Region list with the derived counts the UI shows
-- ---------------------------------------------------------------------------

create view po_bunker.regions_view
with (security_invoker = true) as
select
  r.*,
  p.name as parent_name,
  p.code as parent_code,
  (select count(*) from po_bunker.regions c where c.parent_id = r.id)::int as child_count,
  (select count(*) from po_bunker.companies c where c.region_id = r.id)::int as companies_count
from po_bunker.regions r
left join po_bunker.regions p on p.id = r.parent_id;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'business_units', 'regions', 'companies', 'partners',
    'vessel_types', 'vessels', 'uoms', 'product_categories', 'code_budgets',
    'products', 'purchase_orders', 'purchase_order_lines'
  ] loop
    execute format(
      'create trigger %I before update on po_bunker.%I
         for each row execute function po_bunker.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Nothing is granted to anon / PUBLIC. service_role gets full access
-- explicitly (RLS bypass is not the same as having the GRANT).
-- ---------------------------------------------------------------------------

revoke all on schema po_bunker from public, anon;
grant usage on schema po_bunker to authenticated, service_role;

revoke all on all functions in schema po_bunker from public, anon;
grant execute on function
  po_bunker.caller_role(), po_bunker.can_write(), po_bunker.is_admin()
  to authenticated, service_role;

grant select on
  po_bunker.profiles, po_bunker.business_units, po_bunker.regions,
  po_bunker.regions_view, po_bunker.companies, po_bunker.partners,
  po_bunker.vessel_types, po_bunker.vessels, po_bunker.uoms,
  po_bunker.product_categories, po_bunker.code_budgets, po_bunker.products,
  po_bunker.purchase_orders, po_bunker.purchase_order_lines
  to authenticated;

-- Staff + admin can add/edit these (matches the existing UI).
grant insert, update on
  po_bunker.regions, po_bunker.companies, po_bunker.partners
  to authenticated;

-- Admin only (no UI for these yet; managed from Studio / CSV import).
grant insert, update, delete on
  po_bunker.profiles, po_bunker.business_units, po_bunker.vessel_types,
  po_bunker.vessels, po_bunker.uoms, po_bunker.product_categories,
  po_bunker.code_budgets, po_bunker.products
  to authenticated;

-- Orders: read + delete only; writes go through the RPCs.
grant delete on po_bunker.purchase_orders to authenticated;

grant all on all tables in schema po_bunker to service_role;
grant all on all sequences in schema po_bunker to service_role;
grant usage on all sequences in schema po_bunker to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  -- Everyone with an active profile can read everything in the app.
  foreach t in array array[
    'profiles', 'business_units', 'regions', 'companies', 'partners',
    'vessel_types', 'vessels', 'uoms', 'product_categories', 'code_budgets',
    'products', 'purchase_orders', 'purchase_order_lines'
  ] loop
    execute format('alter table po_bunker.%I enable row level security', t);
    execute format(
      'create policy %I on po_bunker.%I for select to authenticated
         using (po_bunker.caller_role() is not null)',
      t || '_select', t);
  end loop;

  -- Staff + admin: create/edit regions, companies, partners.
  foreach t in array array['regions', 'companies', 'partners'] loop
    execute format(
      'create policy %I on po_bunker.%I for insert to authenticated
         with check (po_bunker.can_write())',
      t || '_insert', t);
    execute format(
      'create policy %I on po_bunker.%I for update to authenticated
         using (po_bunker.can_write()) with check (po_bunker.can_write())',
      t || '_update', t);
  end loop;

  -- Admin only. profiles included: nobody can promote themselves.
  foreach t in array array[
    'profiles', 'business_units', 'vessel_types', 'vessels', 'uoms',
    'product_categories', 'code_budgets', 'products'
  ] loop
    execute format(
      'create policy %I on po_bunker.%I for all to authenticated
         using (po_bunker.is_admin()) with check (po_bunker.is_admin())',
      t || '_admin_write', t);
  end loop;
end;
$$;

-- Orders may be deleted only while draft or cancelled (the UI cancels first).
create policy purchase_orders_delete on po_bunker.purchase_orders
  for delete to authenticated
  using (po_bunker.can_write() and state in ('draft', 'cancel'));

-- po_counters: RLS on with no policies and no grants; only the SECURITY
-- DEFINER numbering function touches it.
alter table po_bunker.po_counters enable row level security;
