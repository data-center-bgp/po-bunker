-- PO Bunker 0006: keep vessels in sync with the company SMS vessel API.
-- Run after 0005. The Edge Function `po-bunker-sync-vessels` fetches the API
-- (token stays in a Supabase secret) and hands the ships to sync_vessels().
--
-- API shape: {data: [{id, name, fleet:{id,name}, operation_head:{id,name},
--                     ship_type:{code,name}, headcount:{code,name}}]}

alter table po_bunker.vessel_types add column code text;
create unique index vessel_types_code_key
  on po_bunker.vessel_types (code) where code is not null;

alter table po_bunker.vessels
  add column external_id         bigint unique,
  add column fleet_name          text,
  add column operation_head_name text,
  add column headcount_code      text,
  add column headcount_name      text,
  add column synced_at           timestamptz;

-- ---------------------------------------------------------------------------
-- sync_vessels(p_ships): upsert the ships, deactivate the ones that vanished.
--   * key: vessels.external_id (the API's id)
--   * a hand-made vessel with the same name and no external_id is adopted
--   * ship_type is matched by code, then by name, else created
--   * vessels with an external_id that are not in the list become inactive
--     (never deleted: orders keep their vessel)
--   * an empty or fully invalid list is refused, so a bad API answer can
--     never deactivate every vessel
-- Not touched: code, tonnage, IMO, call sign, operator, owner, docking dates.
-- Only service_role may call it (the Edge Function does, after checking that
-- the caller is a PO Bunker admin).
-- ---------------------------------------------------------------------------

create or replace function po_bunker.sync_vessels(p_ships jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ship          jsonb;
  v_id            bigint;
  v_name          text;
  v_type_code     text;
  v_type_name     text;
  v_type_id       bigint;
  v_vessel_id     bigint;
  v_seen          bigint[] := '{}';
  v_created       integer := 0;
  v_updated       integer := 0;
  v_adopted       integer := 0;
  v_skipped       integer := 0;
  v_types_created integer := 0;
  v_deactivated   integer := 0;
  v_fleet         text;
  v_head          text;
  v_hc_code       text;
  v_hc_name       text;
begin
  if p_ships is null or jsonb_typeof(p_ships) <> 'array' then
    raise exception 'Expected a JSON array of ships' using errcode = '22023';
  end if;
  if jsonb_array_length(p_ships) = 0 then
    raise exception 'Refusing to sync an empty ship list' using errcode = '22023';
  end if;

  for v_ship in select * from jsonb_array_elements(p_ships) loop
    begin
      v_id := (v_ship ->> 'id')::bigint;
    exception when others then
      v_id := null;
    end;
    v_name := btrim(coalesce(v_ship ->> 'name', ''));

    if jsonb_typeof(v_ship) <> 'object' or v_id is null or v_name = '' or v_id = any (v_seen) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_seen := v_seen || v_id;

    v_type_code := nullif(btrim(v_ship #>> '{ship_type,code}'), '');
    v_type_name := nullif(btrim(v_ship #>> '{ship_type,name}'), '');
    v_fleet     := nullif(btrim(v_ship #>> '{fleet,name}'), '');
    v_head      := nullif(btrim(v_ship #>> '{operation_head,name}'), '');
    v_hc_code   := nullif(btrim(v_ship #>> '{headcount,code}'), '');
    v_hc_name   := nullif(btrim(v_ship #>> '{headcount,name}'), '');

    v_type_id := null;
    if v_type_code is not null then
      select t.id into v_type_id from po_bunker.vessel_types t where t.code = v_type_code;
    end if;
    if v_type_id is null and v_type_name is not null then
      select t.id into v_type_id from po_bunker.vessel_types t
      where lower(t.name) = lower(v_type_name) order by t.id limit 1;
      if v_type_id is not null and v_type_code is not null then
        update po_bunker.vessel_types t set code = v_type_code
        where t.id = v_type_id and t.code is null;
      end if;
    end if;
    if v_type_id is null and coalesce(v_type_name, v_type_code) is not null then
      insert into po_bunker.vessel_types (name, code)
      values (coalesce(v_type_name, v_type_code), v_type_code)
      on conflict (name) do update set code = coalesce(po_bunker.vessel_types.code, excluded.code)
      returning id into v_type_id;
      v_types_created := v_types_created + 1;
    end if;

    select v.id into v_vessel_id from po_bunker.vessels v where v.external_id = v_id;
    if found then
      update po_bunker.vessels v
      set name = v_name, type_id = coalesce(v_type_id, v.type_id),
          fleet_name = v_fleet, operation_head_name = v_head,
          headcount_code = v_hc_code, headcount_name = v_hc_name,
          active = true, synced_at = now()
      where v.id = v_vessel_id;
      v_updated := v_updated + 1;
    else
      select v.id into v_vessel_id from po_bunker.vessels v
      where v.external_id is null and lower(v.name) = lower(v_name)
      order by v.id limit 1;
      if found then
        update po_bunker.vessels v
        set external_id = v_id, type_id = coalesce(v_type_id, v.type_id),
            fleet_name = v_fleet, operation_head_name = v_head,
            headcount_code = v_hc_code, headcount_name = v_hc_name,
            active = true, synced_at = now()
        where v.id = v_vessel_id;
        v_adopted := v_adopted + 1;
      else
        insert into po_bunker.vessels
          (external_id, name, type_id, fleet_name, operation_head_name,
           headcount_code, headcount_name, active, synced_at)
        values (v_id, v_name, v_type_id, v_fleet, v_head, v_hc_code, v_hc_name, true, now());
        v_created := v_created + 1;
      end if;
    end if;
  end loop;

  if cardinality(v_seen) = 0 then
    raise exception 'The ship list has no valid entries (need a numeric id and a name)'
      using errcode = '22023';
  end if;

  update po_bunker.vessels v
  set active = false
  where v.external_id is not null and v.active and not (v.external_id = any (v_seen));
  get diagnostics v_deactivated = row_count;

  return jsonb_build_object(
    'total', cardinality(v_seen),
    'created', v_created,
    'updated', v_updated,
    'adopted', v_adopted,
    'deactivated', v_deactivated,
    'skipped', v_skipped,
    'types_created', v_types_created
  );
end;
$$;

revoke all on function po_bunker.sync_vessels(jsonb) from public, anon, authenticated;
grant execute on function po_bunker.sync_vessels(jsonb) to service_role;
