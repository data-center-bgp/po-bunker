-- PO Bunker 0005: data needed to print the real PO form.
-- Vendor quotation/invoice ref + date, remarks, discount, VAT %, per-line status,
-- three-level approval with signatures, company logo, and the private storage
-- bucket for signature/logo images. Run after 0004.
--
-- Behaviour changes versus 0002:
--   * Confirming an order no longer counts as approver 1. Approvals are a
--     separate step (approve_purchase_order) done by people who are allowed to
--     approve that level.
--   * Cancelled lines (status_list = 'cancel') no longer count towards totals.
--   * Totals: untaxed = lines - discount; tax = untaxed * VAT% / 100;
--     total = untaxed + tax.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table po_bunker.purchase_orders
  add column option_order text not null default 'quotation'
    check (option_order in ('quotation', 'invoice')),
  add column partner_ref  text,
  add column date_vendor  timestamptz,
  add column date_bunker  timestamptz,
  add column tax_percent  numeric(5, 2) not null default 0
    check (tax_percent between 0 and 100),
  add constraint purchase_orders_discount_nonneg check (amount_discount >= 0);

alter table po_bunker.purchase_order_lines
  add column status_list text not null default 'onprogress'
    check (status_list in ('onprogress', 'hold', 'cancel', 'close'));

alter table po_bunker.profiles
  add column signature_path  text,
  add column approval_levels text[] not null default '{}'
    check (approval_levels <@ array['first', 'second', 'third']::text[]);

alter table po_bunker.companies add column logo_path text;

-- ---------------------------------------------------------------------------
-- 2. Remarks (red / blue notes printed under the order lines)
-- ---------------------------------------------------------------------------

create table po_bunker.purchase_order_remarks (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references po_bunker.purchase_orders (id) on delete cascade,
  remark_date date not null default current_date,
  color       text not null default 'merah' check (color in ('merah', 'biru')),
  remark      text not null check (btrim(remark) <> ''),
  created_by  uuid references po_bunker.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index purchase_order_remarks_order_idx on po_bunker.purchase_order_remarks (order_id);

create trigger purchase_order_remarks_set_updated_at
  before update on po_bunker.purchase_order_remarks
  for each row execute function po_bunker.set_updated_at();

alter table po_bunker.purchase_order_remarks enable row level security;

create policy purchase_order_remarks_select on po_bunker.purchase_order_remarks
  for select to authenticated using (po_bunker.caller_role() is not null);
create policy purchase_order_remarks_insert on po_bunker.purchase_order_remarks
  for insert to authenticated with check (po_bunker.can_write());
create policy purchase_order_remarks_update on po_bunker.purchase_order_remarks
  for update to authenticated using (po_bunker.can_write()) with check (po_bunker.can_write());
create policy purchase_order_remarks_delete on po_bunker.purchase_order_remarks
  for delete to authenticated using (po_bunker.can_write());

grant select, insert, update, delete on po_bunker.purchase_order_remarks to authenticated;
grant all on po_bunker.purchase_order_remarks to service_role;

-- ---------------------------------------------------------------------------
-- 3. Totals
-- ---------------------------------------------------------------------------

create or replace function po_bunker.recompute_order_amounts(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric;
  v_discount numeric;
  v_percent  numeric;
  v_untaxed  numeric;
  v_tax      numeric;
begin
  select o.amount_discount, o.tax_percent into v_discount, v_percent
  from po_bunker.purchase_orders o
  where o.id = p_order_id;
  if not found then
    return;
  end if;

  select coalesce(sum(l.price_subtotal) filter (where l.status_list <> 'cancel'), 0)
  into v_subtotal
  from po_bunker.purchase_order_lines l
  where l.order_id = p_order_id;

  v_untaxed := greatest(v_subtotal - v_discount, 0);
  v_tax     := round(v_untaxed * v_percent / 100, 2);

  update po_bunker.purchase_orders o
  set amount_untaxed = v_untaxed,
      amount_tax     = v_tax,
      amount_total   = v_untaxed + v_tax
  where o.id = p_order_id;
end;
$$;

create or replace function po_bunker.recalc_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id bigint;
begin
  for v_order_id in
    select distinct x
    from unnest(array[
      case when tg_op <> 'INSERT' then old.order_id end,
      case when tg_op <> 'DELETE' then new.order_id end
    ]) as x
    where x is not null
  loop
    perform po_bunker.recompute_order_amounts(v_order_id);
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. save_purchase_order: new header keys and line status_list
--
--   header keys (create requires company_id, partner_id, order_type, date_order):
--     company_id, partner_id, order_type, date_order, notes,
--     option_order, partner_ref, date_vendor, date_bunker, amount_discount, tax_percent
--     (on edit only the keys present change; partner_ref/date_vendor/date_bunker
--      may be set to null to clear them)
--   line keys: as before plus status_list.
-- ---------------------------------------------------------------------------

create or replace function po_bunker.save_purchase_order(
  p_id     bigint,
  p_header jsonb,
  p_lines  jsonb default null
)
returns po_bunker.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    po_bunker.purchase_orders;
  v_line     jsonb;
  v_line_id  bigint;
  v_keep     bigint[] := '{}';
  v_subtotal numeric;
begin
  if not po_bunker.can_write() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception 'Order header is required' using errcode = '22023';
  end if;

  if p_lines is not null and jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Order lines must be an array' using errcode = '22023';
  end if;

  if p_id is null then
    if p_lines is null or jsonb_array_length(p_lines) = 0 then
      raise exception 'An order needs at least one line' using errcode = '22023';
    end if;

    insert into po_bunker.purchase_orders
      (company_id, partner_id, order_type, date_order, notes, created_by,
       option_order, partner_ref, date_vendor, date_bunker, amount_discount, tax_percent)
    values (
      (p_header ->> 'company_id')::bigint,
      (p_header ->> 'partner_id')::bigint,
      p_header ->> 'order_type',
      (p_header ->> 'date_order')::timestamptz,
      coalesce(p_header ->> 'notes', ''),
      auth.uid(),
      coalesce(p_header ->> 'option_order', 'quotation'),
      nullif(btrim(p_header ->> 'partner_ref'), ''),
      (p_header ->> 'date_vendor')::timestamptz,
      (p_header ->> 'date_bunker')::timestamptz,
      coalesce((p_header ->> 'amount_discount')::numeric, 0),
      coalesce((p_header ->> 'tax_percent')::numeric, 0)
    )
    returning * into v_order;
  else
    select * into v_order
    from po_bunker.purchase_orders
    where id = p_id
    for update;

    if not found then
      raise exception 'Order % not found', p_id using errcode = 'P0002';
    end if;
    if v_order.state <> 'draft' then
      raise exception 'Only draft orders can be edited' using errcode = '55000';
    end if;
    if p_lines is not null and jsonb_array_length(p_lines) = 0 then
      raise exception 'An order needs at least one line' using errcode = '22023';
    end if;

    update po_bunker.purchase_orders o
    set company_id      = coalesce((p_header ->> 'company_id')::bigint, o.company_id),
        partner_id      = coalesce((p_header ->> 'partner_id')::bigint, o.partner_id),
        order_type      = coalesce(p_header ->> 'order_type', o.order_type),
        date_order      = coalesce((p_header ->> 'date_order')::timestamptz, o.date_order),
        notes           = coalesce(p_header ->> 'notes', o.notes),
        option_order    = coalesce(p_header ->> 'option_order', o.option_order),
        partner_ref     = case when p_header ? 'partner_ref'
                               then nullif(btrim(p_header ->> 'partner_ref'), '') else o.partner_ref end,
        date_vendor     = case when p_header ? 'date_vendor'
                               then (p_header ->> 'date_vendor')::timestamptz else o.date_vendor end,
        date_bunker     = case when p_header ? 'date_bunker'
                               then (p_header ->> 'date_bunker')::timestamptz else o.date_bunker end,
        amount_discount = coalesce((p_header ->> 'amount_discount')::numeric, o.amount_discount),
        tax_percent     = coalesce((p_header ->> 'tax_percent')::numeric, o.tax_percent)
    where o.id = v_order.id
    returning * into v_order;
  end if;

  if p_lines is not null then
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if nullif(v_line ->> 'id', '') is not null then
        update po_bunker.purchase_order_lines l
        set product_id     = coalesce((v_line ->> 'product_id')::bigint, l.product_id),
            vessel_id      = coalesce((v_line ->> 'vessel_id')::bigint, l.vessel_id),
            uom_id         = coalesce((v_line ->> 'uom_id')::bigint, l.uom_id),
            product_qty    = coalesce((v_line ->> 'product_qty')::numeric, l.product_qty),
            price_unit     = coalesce((v_line ->> 'price_unit')::numeric, l.price_unit),
            status_list    = coalesce(v_line ->> 'status_list', l.status_list),
            region_id      = case when v_line ? 'region_id'
                                  then (v_line ->> 'region_id')::bigint else l.region_id end,
            code_budget_id = case when v_line ? 'code_budget_id'
                                  then (v_line ->> 'code_budget_id')::bigint else l.code_budget_id end,
            category_id    = case when v_line ? 'category_id'
                                  then (v_line ->> 'category_id')::bigint else l.category_id end,
            project        = case when v_line ? 'project'
                                  then coalesce(v_line ->> 'project', '') else l.project end,
            requested_by   = case when v_line ? 'requested_by'
                                  then (v_line ->> 'requested_by')::uuid else l.requested_by end,
            priority       = case when v_line ? 'priority'
                                  then v_line ->> 'priority' else l.priority end
        where l.id = (v_line ->> 'id')::bigint
          and l.order_id = v_order.id
        returning l.id into v_line_id;

        if v_line_id is null then
          raise exception 'Line % does not belong to order %', v_line ->> 'id', v_order.id
            using errcode = '22023';
        end if;
      else
        insert into po_bunker.purchase_order_lines
          (order_id, product_id, vessel_id, uom_id, product_qty, price_unit, status_list,
           region_id, code_budget_id, category_id, project, requested_by, priority)
        values (
          v_order.id,
          (v_line ->> 'product_id')::bigint,
          (v_line ->> 'vessel_id')::bigint,
          (v_line ->> 'uom_id')::bigint,
          (v_line ->> 'product_qty')::numeric,
          (v_line ->> 'price_unit')::numeric,
          coalesce(v_line ->> 'status_list', 'onprogress'),
          (v_line ->> 'region_id')::bigint,
          (v_line ->> 'code_budget_id')::bigint,
          (v_line ->> 'category_id')::bigint,
          coalesce(v_line ->> 'project', ''),
          (v_line ->> 'requested_by')::uuid,
          v_line ->> 'priority'
        )
        returning id into v_line_id;
      end if;

      v_keep := v_keep || v_line_id;
    end loop;

    delete from po_bunker.purchase_order_lines l
    where l.order_id = v_order.id
      and l.id <> all (v_keep);
  end if;

  -- Header-only edits (discount, VAT) must recalc too; line changes already did.
  perform po_bunker.recompute_order_amounts(v_order.id);

  select coalesce(sum(l.price_subtotal) filter (where l.status_list <> 'cancel'), 0)
  into v_subtotal
  from po_bunker.purchase_order_lines l
  where l.order_id = v_order.id;

  select * into v_order from po_bunker.purchase_orders where id = v_order.id;
  if v_order.amount_discount > v_subtotal then
    raise exception 'The discount (%) is larger than the order total (%)',
      v_order.amount_discount, v_subtotal using errcode = '22023';
  end if;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. State machine: confirm no longer stamps approver 1; set-to-draft clears
--    every approval including the signature snapshots.
-- ---------------------------------------------------------------------------

create or replace function po_bunker.change_purchase_order_state(
  p_id bigint,
  p_to text
)
returns po_bunker.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   po_bunker.purchase_orders;
  v_allowed text[];
begin
  if not po_bunker.can_write() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  v_allowed := case p_to
    when 'purchase' then array['draft']
    when 'cancel'   then array['draft', 'to approve', 'purchase']
    when 'draft'    then array['to approve', 'purchase', 'cancel']
  end;
  if v_allowed is null then
    raise exception 'Unsupported target state %', p_to using errcode = '22023';
  end if;

  select * into v_order
  from po_bunker.purchase_orders
  where id = p_id
  for update;

  if not found then
    raise exception 'Order % not found', p_id using errcode = 'P0002';
  end if;
  if not (v_order.state = any (v_allowed)) then
    raise exception 'Cannot change order % from "%" to "%"', v_order.name, v_order.state, p_to
      using errcode = '55000';
  end if;
  if p_to = 'purchase' and not exists (
    select 1 from po_bunker.purchase_order_lines l where l.order_id = v_order.id
  ) then
    raise exception 'Cannot confirm an order without lines' using errcode = '55000';
  end if;

  update po_bunker.purchase_orders o
  set state        = p_to,
      date_approve = case p_to when 'purchase' then now()
                               when 'draft' then null
                               else o.date_approve end,
      first_approved_by              = case when p_to = 'draft' then null else o.first_approved_by end,
      first_approved_at              = case when p_to = 'draft' then null else o.first_approved_at end,
      first_approved_signature_path  = case when p_to = 'draft' then null else o.first_approved_signature_path end,
      second_approved_by             = case when p_to = 'draft' then null else o.second_approved_by end,
      second_approved_at             = case when p_to = 'draft' then null else o.second_approved_at end,
      second_approved_signature_path = case when p_to = 'draft' then null else o.second_approved_signature_path end,
      third_approved_by              = case when p_to = 'draft' then null else o.third_approved_by end,
      third_approved_at              = case when p_to = 'draft' then null else o.third_approved_at end,
      third_approved_signature_path  = case when p_to = 'draft' then null else o.third_approved_signature_path end
  where o.id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Approvals (Corporate Logistic Admin = first, Corporate Logistic = second,
--    Business Unit PIC = third). The approver's current signature is copied
--    onto the order, so later changes to their signature never alter it.
-- ---------------------------------------------------------------------------

create or replace function po_bunker.approve_purchase_order(p_id bigint, p_level text)
returns po_bunker.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile po_bunker.profiles;
  v_order   po_bunker.purchase_orders;
begin
  if not po_bunker.can_write() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_level is null or p_level not in ('first', 'second', 'third') then
    raise exception 'Unknown approval level %', p_level using errcode = '22023';
  end if;

  select * into v_profile from po_bunker.profiles where id = auth.uid() and active;
  if v_profile.role <> 'admin' and not (p_level = any (v_profile.approval_levels)) then
    raise exception 'You are not allowed to approve this level' using errcode = '42501';
  end if;
  if v_profile.signature_path is null then
    raise exception 'Upload your signature before approving' using errcode = '55000';
  end if;

  select * into v_order from po_bunker.purchase_orders where id = p_id for update;
  if not found then
    raise exception 'Order % not found', p_id using errcode = 'P0002';
  end if;
  if v_order.state <> 'purchase' then
    raise exception 'Only confirmed orders can be approved' using errcode = '55000';
  end if;
  if (p_level = 'first'  and v_order.first_approved_by  is not null)
     or (p_level = 'second' and v_order.second_approved_by is not null)
     or (p_level = 'third'  and v_order.third_approved_by  is not null) then
    raise exception 'This level is already approved' using errcode = '55000';
  end if;

  update po_bunker.purchase_orders o
  set first_approved_by  = case when p_level = 'first'  then v_profile.id else o.first_approved_by end,
      first_approved_at  = case when p_level = 'first'  then now() else o.first_approved_at end,
      first_approved_signature_path
                         = case when p_level = 'first'  then v_profile.signature_path else o.first_approved_signature_path end,
      second_approved_by = case when p_level = 'second' then v_profile.id else o.second_approved_by end,
      second_approved_at = case when p_level = 'second' then now() else o.second_approved_at end,
      second_approved_signature_path
                         = case when p_level = 'second' then v_profile.signature_path else o.second_approved_signature_path end,
      third_approved_by  = case when p_level = 'third'  then v_profile.id else o.third_approved_by end,
      third_approved_at  = case when p_level = 'third'  then now() else o.third_approved_at end,
      third_approved_signature_path
                         = case when p_level = 'third'  then v_profile.signature_path else o.third_approved_signature_path end
  where o.id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- Per-line status stays changeable on confirmed orders (progress tracking).
create or replace function po_bunker.set_line_status(p_line_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  if not po_bunker.can_write() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('onprogress', 'hold', 'cancel', 'close') then
    raise exception 'Unknown line status %', p_status using errcode = '22023';
  end if;

  select o.state into v_state
  from po_bunker.purchase_order_lines l
  join po_bunker.purchase_orders o on o.id = l.order_id
  where l.id = p_line_id
  for update of l;
  if not found then
    raise exception 'Line % not found', p_line_id using errcode = 'P0002';
  end if;
  if v_state not in ('draft', 'purchase') then
    raise exception 'Line status can only change on draft or confirmed orders' using errcode = '55000';
  end if;

  update po_bunker.purchase_order_lines l set status_list = p_status where l.id = p_line_id;
end;
$$;

-- profiles are admin-write only; users set just their own signature through this.
create or replace function po_bunker.set_my_signature(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not po_bunker.can_write() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_path is not null and p_path not like 'signatures/' || auth.uid()::text || '/%' then
    raise exception 'Invalid signature path' using errcode = '22023';
  end if;
  update po_bunker.profiles set signature_path = p_path where id = auth.uid();
end;
$$;

revoke all on function
  po_bunker.recompute_order_amounts(bigint),
  po_bunker.approve_purchase_order(bigint, text),
  po_bunker.set_line_status(bigint, text),
  po_bunker.set_my_signature(text)
  from public, anon;

grant execute on function
  po_bunker.approve_purchase_order(bigint, text),
  po_bunker.set_line_status(bigint, text),
  po_bunker.set_my_signature(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Private storage bucket for signatures and company logos.
--    Policies are scoped to this bucket and to users with an active PO Bunker
--    profile, so the other apps on the shared project are unaffected.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('po_bunker_assets', 'po_bunker_assets', false)
on conflict (id) do nothing;

create policy "PO Bunker users can read assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'po_bunker_assets' and po_bunker.caller_role() is not null);

create policy "PO Bunker users add own signature" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'po_bunker_assets' and po_bunker.can_write()
    and (storage.foldername(name))[1] = 'signatures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "PO Bunker users change own signature" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'po_bunker_assets' and po_bunker.can_write()
    and (storage.foldername(name))[1] = 'signatures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "PO Bunker users delete own signature" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'po_bunker_assets' and po_bunker.can_write()
    and (storage.foldername(name))[1] = 'signatures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "PO Bunker staff manage company logos" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'po_bunker_assets' and po_bunker.can_write()
    and (storage.foldername(name))[1] = 'logos'
  )
  with check (
    bucket_id = 'po_bunker_assets' and po_bunker.can_write()
    and (storage.foldername(name))[1] = 'logos'
  );
