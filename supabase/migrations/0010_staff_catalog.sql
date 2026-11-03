-- 0010: staff can maintain products, units of measure and code budgets.
--
-- Until now these tables were admin-write only ("no UI, managed from Studio").
-- With the new Produk / Satuan / Kode Budget screens, admin AND staff may
-- create and edit them; viewers stay read-only. Deleting stays admin-only (and
-- is blocked by foreign keys while a row is in use): the screens deactivate
-- products and code budgets instead of deleting them.

do $$
declare
  t text;
begin
  foreach t in array array['products', 'uoms', 'code_budgets'] loop
    execute format('drop policy if exists %I on po_bunker.%I', t || '_admin_write', t);

    execute format(
      'create policy %I on po_bunker.%I for insert to authenticated
         with check (po_bunker.can_write())',
      t || '_insert', t);
    execute format(
      'create policy %I on po_bunker.%I for update to authenticated
         using (po_bunker.can_write()) with check (po_bunker.can_write())',
      t || '_update', t);
    execute format(
      'create policy %I on po_bunker.%I for delete to authenticated
         using (po_bunker.is_admin())',
      t || '_delete', t);
  end loop;
end;
$$;
