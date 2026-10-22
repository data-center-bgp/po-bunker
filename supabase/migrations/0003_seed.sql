-- PO Bunker: starter lookup data. Safe to re-run. Edit the lists to taste;
-- they only exist so the order form has something to pick from on day one.
-- Vessels, products, code budgets, partners, companies and regions are real
-- business data: import them from the CSV templates in supabase/import-templates/.

insert into po_bunker.uoms (name) values
  ('Liter'), ('KL'), ('MT'), ('m3'), ('Kg'), ('Unit'), ('Pcs'), ('Drum')
on conflict (name) do nothing;

insert into po_bunker.product_categories (name) values
  ('Bunker Fuel'), ('Fresh Water'), ('Logistic')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- First admin. Run this by hand AFTER creating the user in Studio
-- (Authentication > Users), or reuse an existing CGA account. Replace the
-- email. Without an active profile nobody can read or write anything.
-- ---------------------------------------------------------------------------
--
-- insert into po_bunker.profiles (id, name, email, role)
-- select id, coalesce(raw_user_meta_data ->> 'name', email), email, 'admin'
-- from auth.users
-- where email = 'you@example.com';
--
-- Add everyone else the same way with role 'staff' or 'viewer'.
