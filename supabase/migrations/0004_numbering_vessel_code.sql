-- PO Bunker 0004: real PO numbering, vessel code, vessel operator/owner -> companies.
-- Based on the old Odoo database notes (D:\DATABASE_PO_BUNKER.md, sections 5 and 12).
-- Run after 0003.

-- ---------------------------------------------------------------------------
-- 1. PO numbering
--
--   bunker_fuel   NNN AC/<code_company_general>-OPS/BBM/<ROMAN MONTH>-<YEAR>
--   bunker_water  NNN AC/<code_company_general>-OPS/AIR/<ROMAN MONTH>-<YEAR>
--   e.g. 015 AC/IGE-OPS/BBM/III-2025
--
-- The sequence is per order type per month of creation (WITA), across all
-- companies, like the old system. Unlike the old count+1 approach, a counter
-- row is used, so deleting an order or creating two at once never duplicates
-- a number. The logistic format is not documented, so logistic orders keep
-- the previous PO/YYYY/NNNN numbering (per year of the order date) until the
-- real format is known.
-- ---------------------------------------------------------------------------

create table po_bunker.po_number_counters (
  scope    text primary key,   -- 'bunker_fuel:2025-03', 'bunker_water:2025-03', 'logistic:2025'
  last_seq integer not null default 0
);
alter table po_bunker.po_number_counters enable row level security;
grant all on po_bunker.po_number_counters to service_role;

-- Carry over the old per-year counters (they were only used by logistic format).
insert into po_bunker.po_number_counters (scope, last_seq)
select 'logistic:' || year, last_seq from po_bunker.po_counters;

create or replace function po_bunker.roman_month(p_month integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[p_month]
$$;

create or replace function po_bunker.next_po_name(
  p_order_type text,
  p_company_id bigint,
  p_date_order timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local   timestamp := now() at time zone 'Asia/Makassar';
  v_code    text;
  v_scope   text;
  v_seq     integer;
  v_kind    text;
begin
  if p_order_type = 'logistic' then
    v_scope := 'logistic:' || extract(year from (p_date_order at time zone 'Asia/Makassar'))::integer;
  else
    v_kind := case p_order_type when 'bunker_fuel' then 'BBM' when 'bunker_water' then 'AIR' end;
    if v_kind is null then
      raise exception 'Unknown order type %', p_order_type using errcode = '22023';
    end if;

    select nullif(btrim(c.code_company_general), '') into v_code
    from po_bunker.companies c
    where c.id = p_company_id;
    if v_code is null then
      raise exception 'The company has no General Code, which is required to number a bunker PO. Set it on the Companies page first.'
        using errcode = '23514';
    end if;

    v_scope := p_order_type || ':' || to_char(v_local, 'YYYY-MM');
  end if;

  insert into po_bunker.po_number_counters as c (scope, last_seq)
  values (v_scope, 1)
  on conflict (scope) do update set last_seq = c.last_seq + 1
  returning c.last_seq into v_seq;

  if p_order_type = 'logistic' then
    return 'PO/' || extract(year from (p_date_order at time zone 'Asia/Makassar'))::integer
           || '/' || lpad(v_seq::text, 4, '0');
  end if;

  return lpad(v_seq::text, 3, '0') || ' AC/' || v_code || '-OPS/' || v_kind || '/'
         || po_bunker.roman_month(extract(month from v_local)::integer)
         || '-' || extract(year from v_local)::integer;
end;
$$;

create or replace function po_bunker.assign_po_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is null or new.name = '' then
    new.name := po_bunker.next_po_name(new.order_type, new.company_id, new.date_order);
  end if;
  return new;
end;
$$;

drop function po_bunker.next_po_name(timestamptz);
drop table po_bunker.po_counters;

revoke all on function
  po_bunker.next_po_name(text, bigint, timestamptz),
  po_bunker.roman_month(integer)
  from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Vessel code (printed in the Vessel column of the PO PDF / Excel)
-- ---------------------------------------------------------------------------

alter table po_bunker.vessels add column code text;

-- ---------------------------------------------------------------------------
-- 3. Vessel operator / owner are companies, not partners
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from po_bunker.vessels
    where operator_id is not null or owner_id is not null
  ) then
    raise exception 'vessels already have operator/owner values pointing at partners; migrate them by hand before running 0004';
  end if;
end;
$$;

alter table po_bunker.vessels drop constraint vessels_operator_id_fkey;
alter table po_bunker.vessels drop constraint vessels_owner_id_fkey;
alter table po_bunker.vessels
  add constraint vessels_operator_id_fkey foreign key (operator_id) references po_bunker.companies (id),
  add constraint vessels_owner_id_fkey    foreign key (owner_id)    references po_bunker.companies (id);
