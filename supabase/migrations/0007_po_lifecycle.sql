-- PO Bunker 0007: Submitted / Completed / Cancelled lifecycle.
-- Replaces draft + confirm + three-level approvals. Run after 0006, and
-- right before deploying the matching frontend (the old frontend does not
-- understand the new states).
--
--   submitted  the PO was created (locked: cancel it and make a new one to fix it)
--   completed  Delivery Order (DO) uploaded and the actual quantity recorded per line
--   cancelled  wrongly made or really cancelled, with a reason
--
-- The old approval columns/functions for signatures stay in the database
-- (history, and they still print on old POs); the approval RPCs are dropped.

-- ---------------------------------------------------------------------------
-- 1. States
-- ---------------------------------------------------------------------------

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'po_bunker.purchase_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%draft%'
  loop
    execute format('alter table po_bunker.purchase_orders drop constraint %I', c.conname);
  end loop;
end;
$$;

update po_bunker.purchase_orders
set state = case state
  when 'draft'      then 'submitted'
  when 'to approve' then 'submitted'
  when 'purchase'   then 'submitted'
  when 'done'       then 'completed'
  when 'cancel'     then 'cancelled'
  else state
end;

alter table po_bunker.purchase_orders
  add constraint purchase_orders_state_check
    check (state in ('submitted', 'completed', 'cancelled')),
  alter column state set default 'submitted';

-- ---------------------------------------------------------------------------
-- 2. Completion, cancellation and actual quantities
-- ---------------------------------------------------------------------------

alter table po_bunker.purchase_orders
  add column completed_at  timestamptz,
  add column completed_by  uuid references po_bunker.profiles (id) on delete set null,
  add column cancel_reason text,
  add column cancelled_at  timestamptz,
  add column cancelled_by  uuid references po_bunker.profiles (id) on delete set null,
  add column actual_amount numeric(18, 2);

alter table po_bunker.purchase_order_lines
  add column actual_qty numeric(18, 4) check (actual_qty >= 0),
  add column actual_subtotal numeric(18, 2)
    generated always as (round(actual_qty * price_unit, 2)) stored;

-- ---------------------------------------------------------------------------
-- 3. Documents (Delivery Order files)
-- ---------------------------------------------------------------------------

create table po_bunker.purchase_order_documents (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references po_bunker.purchase_orders (id) on delete cascade,
  doc_type    text not null default 'delivery_order' check (doc_type in ('delivery_order')),
  file_path   text not null unique,
  file_name   text not null,
  mime_type   text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes  bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid references po_bunker.profiles (id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now()
);
create index purchase_order_documents_order_idx
  on po_bunker.purchase_order_documents (order_id);

alter table po_bunker.purchase_order_documents enable row level security;

create policy purchase_order_documents_select on po_bunker.purchase_order_documents
  for select to authenticated using (po_bunker.caller_role() is not null);

-- Files can only be added or removed while the PO is still submitted.
create policy purchase_order_documents_insert on po_bunker.purchase_order_documents
  for insert to authenticated
  with check (
    po_bunker.can_write()
    and file_path like 'documents/' || order_id::text || '/%'
    and exists (
      select 1 from po_bunker.purchase_orders o
      where o.id = order_id and o.state = 'submitted'
    )
  );

create policy purchase_order_documents_delete on po_bunker.purchase_order_documents
  for delete to authenticated
  using (
    po_bunker.can_write()
    and exists (
      select 1 from po_bunker.purchase_orders o
      where o.id = order_id and o.state = 'submitted'
    )
  );

grant select, insert, delete on po_bunker.purchase_order_documents to authenticated;
grant all on po_bunker.purchase_order_documents to service_role;

-- Storage: documents/<order id>/<file>, same bucket and scoping as 0005.
-- (`objects.name` is qualified on purpose: purchase_orders has a `name` column too.)
create policy "PO Bunker staff add order documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'po_bunker_assets' and po_bunker.can_write()
    and (storage.foldername(name))[1] = 'documents'
    and exists (
      select 1 from po_bunker.purchase_orders o
      where o.id::text = (storage.foldername(objects.name))[2] and o.state = 'submitted'
    )
  );

create policy "PO Bunker staff delete order documents" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'po_bunker_assets' and po_bunker.can_write()
    and (storage.foldername(name))[1] = 'documents'
    and exists (
      select 1 from po_bunker.purchase_orders o
      where o.id::text = (storage.foldername(objects.name))[2] and o.state = 'submitted'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Functions: create-only save, complete, cancel. Old state/approval
--    functions are dropped so nothing can bypass the new rules.
-- ---------------------------------------------------------------------------

drop function if exists po_bunker.confirm_purchase_order(bigint);
drop function if exists po_bunker.set_purchase_order_draft(bigint);
drop function if exists po_bunker.cancel_purchase_order(bigint);
drop function if exists po_bunker.change_purchase_order_state(bigint, text);
drop function if exists po_bunker.approve_purchase_order(bigint, text);
drop function if exists po_bunker.set_line_status(bigint, text);

drop policy if exists purchase_orders_delete on po_bunker.purchase_orders;
revoke delete on po_bunker.purchase_orders from authenticated;

-- A PO is created already submitted and is locked afterwards.
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
  v_subtotal numeric;
begin
  if not po_bunker.can_write() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_id is not null then
    raise exception 'A submitted order cannot be edited. Cancel it and create a new one.'
      using errcode = '55000';
  end if;
  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception 'Order header is required' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An order needs at least one line' using errcode = '22023';
  end if;

  insert into po_bunker.purchase_orders
    (company_id, partner_id, order_type, date_order, notes, created_by, state,
     option_order, partner_ref, date_vendor, date_bunker, amount_discount, tax_percent)
  values (
    (p_header ->> 'company_id')::bigint,
    (p_header ->> 'partner_id')::bigint,
    p_header ->> 'order_type',
    (p_header ->> 'date_order')::timestamptz,
    coalesce(p_header ->> 'notes', ''),
    auth.uid(),
    'submitted',
    coalesce(p_header ->> 'option_order', 'quotation'),
    nullif(btrim(p_header ->> 'partner_ref'), ''),
    (p_header ->> 'date_vendor')::timestamptz,
    (p_header ->> 'date_bunker')::timestamptz,
    coalesce((p_header ->> 'amount_discount')::numeric, 0),
    coalesce((p_header ->> 'tax_percent')::numeric, 0)
  )
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into po_bunker.purchase_order_lines
      (order_id, product_id, vessel_id, uom_id, product_qty, price_unit,
       region_id, code_budget_id, category_id, project, requested_by, priority)
    values (
      v_order.id,
      (v_line ->> 'product_id')::bigint,
      (v_line ->> 'vessel_id')::bigint,
      (v_line ->> 'uom_id')::bigint,
      (v_line ->> 'product_qty')::numeric,
      (v_line ->> 'price_unit')::numeric,
      (v_line ->> 'region_id')::bigint,
      (v_line ->> 'code_budget_id')::bigint,
      (v_line ->> 'category_id')::bigint,
      coalesce(v_line ->> 'project', ''),
      (v_line ->> 'requested_by')::uuid,
      v_line ->> 'priority'
    );
  end loop;

  perform po_bunker.recompute_order_amounts(v_order.id);

  select coalesce(sum(l.price_subtotal), 0) into v_subtotal
  from po_bunker.purchase_order_lines l where l.order_id = v_order.id;
  select * into v_order from po_bunker.purchase_orders where id = v_order.id;
  if v_order.amount_discount > v_subtotal then
    raise exception 'The discount (%) is larger than the order total (%)',
      v_order.amount_discount, v_subtotal using errcode = '22023';
  end if;

  return v_order;
end;
$$;

-- p_lines: [{line_id, actual_qty}] covering every line of the order.
create or replace function po_bunker.complete_purchase_order(p_id bigint, p_lines jsonb)
returns po_bunker.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    po_bunker.purchase_orders;
  v_expected bigint[];
  v_given    bigint[];
  v_entry    jsonb;
  v_qty      numeric;
begin
  if not po_bunker.can_write() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'The actual quantities are required' using errcode = '22023';
  end if;

  select * into v_order from po_bunker.purchase_orders where id = p_id for update;
  if not found then
    raise exception 'Order % not found', p_id using errcode = 'P0002';
  end if;
  if v_order.state <> 'submitted' then
    raise exception 'Only submitted orders can be completed' using errcode = '55000';
  end if;
  if not exists (
    select 1 from po_bunker.purchase_order_documents d
    where d.order_id = p_id and d.doc_type = 'delivery_order'
  ) then
    raise exception 'Upload the Delivery Order (DO) before completing the order'
      using errcode = '55000';
  end if;

  select array_agg(l.id order by l.id) into v_expected
  from po_bunker.purchase_order_lines l where l.order_id = p_id;
  select array_agg((e ->> 'line_id')::bigint order by (e ->> 'line_id')::bigint) into v_given
  from jsonb_array_elements(p_lines) e;
  if v_given is distinct from v_expected then
    raise exception 'Enter the actual quantity for every line of the order'
      using errcode = '22023';
  end if;

  for v_entry in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_entry ->> 'actual_qty')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'The actual quantity must be zero or more' using errcode = '22023';
    end if;
    update po_bunker.purchase_order_lines l
    set actual_qty = v_qty
    where l.id = (v_entry ->> 'line_id')::bigint and l.order_id = p_id;
  end loop;

  update po_bunker.purchase_orders o
  set state        = 'completed',
      completed_at = now(),
      completed_by = auth.uid(),
      actual_amount = (
        select coalesce(sum(l.actual_subtotal), 0)
        from po_bunker.purchase_order_lines l where l.order_id = p_id
      )
  where o.id = p_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function po_bunker.cancel_purchase_order(p_id bigint, p_reason text)
returns po_bunker.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order po_bunker.purchase_orders;
begin
  if not po_bunker.can_write() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;

  select * into v_order from po_bunker.purchase_orders where id = p_id for update;
  if not found then
    raise exception 'Order % not found', p_id using errcode = 'P0002';
  end if;
  if v_order.state <> 'submitted' then
    raise exception 'Only submitted orders can be cancelled' using errcode = '55000';
  end if;

  update po_bunker.purchase_orders o
  set state = 'cancelled', cancel_reason = btrim(p_reason),
      cancelled_at = now(), cancelled_by = auth.uid()
  where o.id = p_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function
  po_bunker.complete_purchase_order(bigint, jsonb),
  po_bunker.cancel_purchase_order(bigint, text)
  from public, anon;
grant execute on function
  po_bunker.complete_purchase_order(bigint, jsonb),
  po_bunker.cancel_purchase_order(bigint, text)
  to authenticated, service_role;
