-- 0008: user management (admin screen "Pengguna").
--
-- auth.users is shared with ~140 other CGA apps, so this app never creates
-- logins or touches passwords. An admin gives an EXISTING login access to PO
-- Bunker by adding a profile row (looked up by email), and can then change the
-- name / role / active flag. All writes go through the functions below; clients
-- can no longer write po_bunker.profiles directly.

create or replace function po_bunker.admin_list_users()
returns table (
  id               uuid,
  name             text,
  email            text,
  role             text,
  active           boolean,
  created_at       timestamptz,
  last_sign_in_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not po_bunker.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.email, p.role, p.active, p.created_at, u.last_sign_in_at
    from po_bunker.profiles p
    left join auth.users u on u.id = p.id
    order by p.active desc, lower(p.name), p.id;
end;
$$;

create or replace function po_bunker.add_user_by_email(
  p_email text,
  p_name  text,
  p_role  text
)
returns po_bunker.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_user    record;
  v_name    text;
  v_profile po_bunker.profiles;
begin
  if not po_bunker.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'An email is required' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('admin', 'staff', 'viewer') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;

  select u.id, u.raw_user_meta_data into v_user
  from auth.users u
  where lower(u.email) = v_email
  limit 1;
  if not found then
    raise exception 'No CGA login exists for this email' using errcode = 'P0002';
  end if;
  if exists (select 1 from po_bunker.profiles where id = v_user.id) then
    raise exception 'This user already has access to PO Bunker' using errcode = '55000';
  end if;

  v_name := coalesce(
    nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(v_user.raw_user_meta_data ->> 'full_name',
                          v_user.raw_user_meta_data ->> 'name', '')), ''),
    split_part(v_email, '@', 1)
  );

  insert into po_bunker.profiles (id, name, email, role)
  values (v_user.id, v_name, v_email, p_role)
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function po_bunker.update_user(
  p_id     uuid,
  p_name   text,
  p_role   text,
  p_active boolean
)
returns po_bunker.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     po_bunker.profiles;
  v_profile po_bunker.profiles;
begin
  if not po_bunker.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'staff', 'viewer') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'A name is required' using errcode = '22023';
  end if;
  if p_active is null then
    raise exception 'The active flag is required' using errcode = '22023';
  end if;

  select * into v_old from po_bunker.profiles where id = p_id for update;
  if not found then
    raise exception 'User % not found', p_id using errcode = 'P0002';
  end if;
  if p_id = auth.uid() and (p_role <> v_old.role or not p_active) then
    raise exception 'You cannot change your own role or deactivate yourself'
      using errcode = '55000';
  end if;

  update po_bunker.profiles
  set name = btrim(p_name), role = p_role, active = p_active, updated_at = now()
  where id = p_id
  returning * into v_profile;
  return v_profile;
end;
$$;

revoke all on function
  po_bunker.admin_list_users(),
  po_bunker.add_user_by_email(text, text, text),
  po_bunker.update_user(uuid, text, text, boolean)
  from public, anon;
grant execute on function
  po_bunker.admin_list_users(),
  po_bunker.add_user_by_email(text, text, text),
  po_bunker.update_user(uuid, text, text, boolean)
  to authenticated, service_role;

-- Profiles are written only through the functions above.
drop policy if exists profiles_admin_write on po_bunker.profiles;
revoke insert, update, delete on po_bunker.profiles from authenticated;
