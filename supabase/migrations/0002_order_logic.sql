-- PO Bunker: order numbering, totals, and the RPCs the frontend calls to
-- save an order and to change its state. Run after 0001.
--
-- Clients have no INSERT/UPDATE grant on purchase_orders or its lines, so
-- these SECURITY DEFINER functions are the only write path. Each one checks
-- po_bunker.can_write() itself.

-- ---------------------------------------------------------------------------
-- Numbering: PO/YYYY/NNNN, one counter per year (year taken in WITA).
-- ---------------------------------------------------------------------------

create or replace function po_bunker.next_po_name(p_date timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from (p_date at time zone 'Asia/Makassar'))::integer;
  v_seq  integer;
begin
  insert into po_bunker.po_counters as c (year, last_seq)
  values (v_year, 1)
  on conflict (year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into v_seq;

  return 'PO/' || v_year || '/' || lpad(v_seq::text, 4, '0');
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
    new.name := po_bunker.next_po_name(new.date_order);
  end if;
  return new;
end;
$$;

create trigger purchase_orders_assign_name
  before insert on po_bunker.purchase_orders
  for each row execute function po_bunker.assign_po_name();

-- ---------------------------------------------------------------------------
-- Totals. Tax is 0 for now (no tax UI yet): total = untaxed + tax - discount.
-- ---------------------------------------------------------------------------

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
    update po_bunker.purchase_orders o
    set amount_untaxed = s.total,
        amount_total   = s.total + o.amount_tax - o.amount_discount
    from (
      select coalesce(sum(l.price_subtotal), 0) as total
      from po_bunker.purchase_order_lines l
      where l.order_id = v_order_id
    ) s
    where o.id = v_order_id;
  end loop;
  return null;
end;
$$;

create trigger purchase_order_lines_recalc
  after insert or update or delete on po_bunker.purchase_order_lines
  for each row execute function po_bunker.recalc_order_totals();

-- ---------------------------------------------------------------------------
-- save_purchase_order(p_id, p_header, p_lines)
--
--   p_id      null = create, otherwise edit that order (draft only)
--   p_header  {company_id, partner_id, order_type, date_order, notes}
--             all required on create; on edit only the keys present change
--   p_lines   [{id?, product_id, vessel_id, uom_id, product_qty, price_unit,
--               region_id?, code_budget_id?, category_id?, project?,
--               requested_by?, priority?}]
--             lines with an id are updated, lines without are inserted, and
--             existing lines missing from the array are deleted. On edit,
--             null/omitted p_lines leaves the lines untouched.
-- Returns the saved header row; the client re-fetches it with embeds.
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
  v_order   po_bunker.purchase_orders;
  v_line    jsonb;
  v_line_id bigint;
  v_keep    bigint[] := '{}';
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
      (company_id, partner_id, order_type, date_order, notes, created_by)
    values (
      (p_header ->> 'company_id')::bigint,
      (p_header ->> 'partner_id')::bigint,
      p_header ->> 'order_type',
      (p_header ->> 'date_order')::timestamptz,
      coalesce(p_header ->> 'notes', ''),
      auth.uid()
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
    set company_id = coalesce((p_header ->> 'company_id')::bigint, o.company_id),
        partner_id = coalesce((p_header ->> 'partner_id')::bigint, o.partner_id),
        order_type = coalesce(p_header ->> 'order_type', o.order_type),
        date_order = coalesce((p_header ->> 'date_order')::timestamptz, o.date_order),
        notes      = coalesce(p_header ->> 'notes', o.notes)
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
        )
        returning id into v_line_id;
      end if;

      v_keep := v_keep || v_line_id;
    end loop;

    delete from po_bunker.purchase_order_lines l
    where l.order_id = v_order.id
      and l.id <> all (v_keep);
  end if;

  select * into v_order from po_bunker.purchase_orders where id = v_order.id;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- State machine
--   confirm : draft -> purchase           (stamps approval, needs >= 1 line)
--   cancel  : draft | to approve | purchase -> cancel
--   draft   : to approve | purchase | cancel -> draft   (clears approval)
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
  set state              = p_to,
      date_approve       = case p_to when 'purchase' then now()
                                     when 'draft' then null
                                     else o.date_approve end,
      first_approved_by  = case p_to when 'purchase' then auth.uid()
                                     when 'draft' then null
                                     else o.first_approved_by end,
      first_approved_at  = case p_to when 'purchase' then now()
                                     when 'draft' then null
                                     else o.first_approved_at end,
      second_approved_by = case when p_to = 'draft' then null else o.second_approved_by end,
      second_approved_at = case when p_to = 'draft' then null else o.second_approved_at end,
      third_approved_by  = case when p_to = 'draft' then null else o.third_approved_by end,
      third_approved_at  = case when p_to = 'draft' then null else o.third_approved_at end
  where o.id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function po_bunker.confirm_purchase_order(p_id bigint)
returns po_bunker.purchase_orders
language sql
security definer
set search_path = ''
as $$ select * from po_bunker.change_purchase_order_state(p_id, 'purchase') $$;

create or replace function po_bunker.cancel_purchase_order(p_id bigint)
returns po_bunker.purchase_orders
language sql
security definer
set search_path = ''
as $$ select * from po_bunker.change_purchase_order_state(p_id, 'cancel') $$;

create or replace function po_bunker.set_purchase_order_draft(p_id bigint)
returns po_bunker.purchase_orders
language sql
security definer
set search_path = ''
as $$ select * from po_bunker.change_purchase_order_state(p_id, 'draft') $$;

-- ---------------------------------------------------------------------------
-- Function privileges: internal helpers are not callable by clients.
-- ---------------------------------------------------------------------------

revoke all on function
  po_bunker.next_po_name(timestamptz),
  po_bunker.assign_po_name(),
  po_bunker.recalc_order_totals(),
  po_bunker.change_purchase_order_state(bigint, text),
  po_bunker.save_purchase_order(bigint, jsonb, jsonb),
  po_bunker.confirm_purchase_order(bigint),
  po_bunker.cancel_purchase_order(bigint),
  po_bunker.set_purchase_order_draft(bigint)
  from public, anon;

grant execute on function
  po_bunker.save_purchase_order(bigint, jsonb, jsonb),
  po_bunker.confirm_purchase_order(bigint),
  po_bunker.cancel_purchase_order(bigint),
  po_bunker.set_purchase_order_draft(bigint)
  to authenticated, service_role;
