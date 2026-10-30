-- 0009: add the "Ton" unit of measure (fresh water is ordered in tons).
-- The unit of a line comes from its product, so switching a fresh water
-- product to Ton is done on the product (Studio) and only affects new orders.

insert into po_bunker.uoms (name)
select 'Ton'
where not exists (
  select 1 from po_bunker.uoms where lower(name) = 'ton'
);
