-- +goose Up
-- PO Bunker schema for the Go API: the final state of the ten Supabase migrations
-- (supabase/migrations/0001..0010) minus everything Supabase-specific: no RLS, no
-- grants/roles, no auth.users, no plpgsql business functions (numbering, totals,
-- the order lifecycle and vessel sync now live in the Go services).
--
-- Kept on purpose: CHECK constraints, generated columns, indexes and the
-- updated_at / last-admin triggers as a safety net behind the Go code.
-- The old approval/signature columns stay (print code still reads them) and are unused.

-- +goose StatementBegin
CREATE FUNCTION set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- Never leave the app without an active admin.
-- +goose StatementBegin
CREATE FUNCTION guard_last_admin() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.active
     AND (TG_OP = 'DELETE' OR NOT (NEW.role = 'admin' AND NEW.active)) THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE role = 'admin' AND active AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot remove or demote the last active admin';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
-- +goose StatementEnd

-- Who may sign in (replaces po_bunker.profiles + Supabase auth.users).
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL CHECK (btrim(name) <> ''),
    email         text NOT NULL,
    password_hash text NOT NULL,
    role          text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'viewer')),
    active        boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_lower CHECK (email = lower(btrim(email)) AND email <> '')
);
CREATE UNIQUE INDEX users_email_key ON users (email);

-- Opaque refresh tokens, stored only as a SHA-256 hash and rotated on every use.
CREATE TABLE refresh_tokens (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  text NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    user_agent  text
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Tables

CREATE TABLE purchase_orders (
    id bigint NOT NULL,
    name text NOT NULL,
    company_id bigint NOT NULL,
    partner_id bigint NOT NULL,
    order_type text NOT NULL,
    state text DEFAULT 'submitted'::text NOT NULL,
    date_order timestamp with time zone NOT NULL,
    date_approve timestamp with time zone,
    notes text DEFAULT ''::text NOT NULL,
    is_ppn boolean DEFAULT false NOT NULL,
    amount_untaxed numeric(18,2) DEFAULT 0 NOT NULL,
    amount_tax numeric(18,2) DEFAULT 0 NOT NULL,
    amount_discount numeric(18,2) DEFAULT 0 NOT NULL,
    amount_total numeric(18,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    first_approved_by uuid,
    first_approved_at timestamp with time zone,
    first_approved_signature_path text,
    second_approved_by uuid,
    second_approved_at timestamp with time zone,
    second_approved_signature_path text,
    third_approved_by uuid,
    third_approved_at timestamp with time zone,
    third_approved_signature_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    option_order text DEFAULT 'quotation'::text NOT NULL,
    partner_ref text,
    date_vendor timestamp with time zone,
    date_bunker timestamp with time zone,
    tax_percent numeric(5,2) DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    completed_by uuid,
    cancel_reason text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    actual_amount numeric(18,2),
    CONSTRAINT purchase_orders_discount_nonneg CHECK ((amount_discount >= (0)::numeric)),
    CONSTRAINT purchase_orders_option_order_check CHECK ((option_order = ANY (ARRAY['quotation'::text, 'invoice'::text]))),
    CONSTRAINT purchase_orders_order_type_check CHECK ((order_type = ANY (ARRAY['bunker_fuel'::text, 'bunker_water'::text, 'logistic'::text]))),
    CONSTRAINT purchase_orders_state_check CHECK ((state = ANY (ARRAY['submitted'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT purchase_orders_tax_percent_check CHECK (((tax_percent >= (0)::numeric) AND (tax_percent <= (100)::numeric)))
);

CREATE TABLE business_units (
    id bigint NOT NULL,
    name text NOT NULL,
    code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE code_budgets (
    id bigint NOT NULL,
    name text NOT NULL,
    code text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE companies (
    id bigint NOT NULL,
    name text NOT NULL,
    code_company text,
    code_company_general text,
    active boolean DEFAULT true NOT NULL,
    email text,
    phone text,
    website text,
    vat text,
    street text,
    street2 text,
    city text,
    zip text,
    region_id bigint,
    currency text DEFAULT 'IDR'::text NOT NULL,
    business_unit_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_path text
);

CREATE TABLE partners (
    id bigint NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'contact'::text NOT NULL,
    is_company boolean DEFAULT false NOT NULL,
    is_supplier boolean DEFAULT false NOT NULL,
    is_customer boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    email text,
    phone text,
    mobile text,
    website text,
    vat text,
    street text,
    street2 text,
    city text,
    zip text,
    state text,
    country text,
    vessel_id bigint,
    parent_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partners_check CHECK ((parent_id IS DISTINCT FROM id))
);

CREATE TABLE po_number_counters (
    scope text NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL
);

CREATE TABLE product_categories (
    id bigint NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE products (
    id bigint NOT NULL,
    name text NOT NULL,
    default_code text,
    category_id bigint NOT NULL,
    uom_id bigint NOT NULL,
    code_budget_id bigint,
    standard_price numeric(18,4) DEFAULT 0 NOT NULL,
    list_price numeric(18,4) DEFAULT 0 NOT NULL,
    merk text,
    model text,
    serial_number text,
    specs text,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE purchase_order_documents (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    doc_type text DEFAULT 'delivery_order'::text NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_order_documents_doc_type_check CHECK ((doc_type = 'delivery_order'::text)),
    CONSTRAINT purchase_order_documents_mime_type_check CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/png'::text, 'image/jpeg'::text]))),
    CONSTRAINT purchase_order_documents_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= 5242880)))
);

CREATE TABLE purchase_order_lines (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    product_id bigint NOT NULL,
    vessel_id bigint NOT NULL,
    region_id bigint,
    code_budget_id bigint,
    category_id bigint,
    uom_id bigint NOT NULL,
    product_qty numeric(18,4) NOT NULL,
    price_unit numeric(18,4) NOT NULL,
    price_subtotal numeric(18,2) GENERATED ALWAYS AS (round((product_qty * price_unit), 2)) STORED,
    project text DEFAULT ''::text NOT NULL,
    requested_by uuid,
    priority text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status_list text DEFAULT 'onprogress'::text NOT NULL,
    actual_qty numeric(18,4),
    actual_subtotal numeric(18,2) GENERATED ALWAYS AS (round((actual_qty * price_unit), 2)) STORED,
    CONSTRAINT purchase_order_lines_actual_qty_check CHECK ((actual_qty >= (0)::numeric)),
    CONSTRAINT purchase_order_lines_price_unit_check CHECK ((price_unit >= (0)::numeric)),
    CONSTRAINT purchase_order_lines_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT purchase_order_lines_product_qty_check CHECK ((product_qty > (0)::numeric)),
    CONSTRAINT purchase_order_lines_status_list_check CHECK ((status_list = ANY (ARRAY['onprogress'::text, 'hold'::text, 'cancel'::text, 'close'::text])))
);

CREATE TABLE purchase_order_remarks (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    remark_date date DEFAULT CURRENT_DATE NOT NULL,
    color text DEFAULT 'merah'::text NOT NULL,
    remark text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_order_remarks_color_check CHECK ((color = ANY (ARRAY['merah'::text, 'biru'::text]))),
    CONSTRAINT purchase_order_remarks_remark_check CHECK ((btrim(remark) <> ''::text))
);

CREATE TABLE regions (
    id bigint NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    level_region text,
    bps_code integer,
    parent_id bigint,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT regions_check CHECK ((parent_id IS DISTINCT FROM id))
);

CREATE TABLE uoms (
    id bigint NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE vessel_types (
    id bigint NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text
);

CREATE TABLE vessels (
    id bigint NOT NULL,
    name text NOT NULL,
    type_id bigint,
    gross_tonage numeric(18,2),
    call_sign text,
    imo_no text,
    mmsi_no text,
    registered_year text,
    registered_place text,
    operator_id bigint,
    owner_id bigint,
    business_unit_id bigint,
    flag text,
    last_docking date,
    intermediate_docking date,
    annual_docking date,
    status_doc_office text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    external_id bigint,
    fleet_name text,
    operation_head_name text,
    headcount_code text,
    headcount_name text,
    synced_at timestamp with time zone
);

-- Identity columns

ALTER TABLE business_units ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME business_units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE code_budgets ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME code_budgets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE companies ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME companies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE partners ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME partners_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE product_categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME product_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE products ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE purchase_order_documents ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME purchase_order_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE purchase_order_lines ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME purchase_order_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE purchase_order_remarks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME purchase_order_remarks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE purchase_orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME purchase_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE regions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME regions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE uoms ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME uoms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE vessel_types ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME vessel_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE vessels ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME vessels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Primary keys and unique constraints

ALTER TABLE ONLY business_units
    ADD CONSTRAINT business_units_pkey PRIMARY KEY (id);

ALTER TABLE ONLY code_budgets
    ADD CONSTRAINT code_budgets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);

ALTER TABLE ONLY po_number_counters
    ADD CONSTRAINT po_number_counters_pkey PRIMARY KEY (scope);

ALTER TABLE ONLY product_categories
    ADD CONSTRAINT product_categories_name_key UNIQUE (name);

ALTER TABLE ONLY product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

ALTER TABLE ONLY purchase_order_documents
    ADD CONSTRAINT purchase_order_documents_file_path_key UNIQUE (file_path);

ALTER TABLE ONLY purchase_order_documents
    ADD CONSTRAINT purchase_order_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY purchase_order_remarks
    ADD CONSTRAINT purchase_order_remarks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_name_key UNIQUE (name);

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY uoms
    ADD CONSTRAINT uoms_name_key UNIQUE (name);

ALTER TABLE ONLY uoms
    ADD CONSTRAINT uoms_pkey PRIMARY KEY (id);

ALTER TABLE ONLY vessel_types
    ADD CONSTRAINT vessel_types_name_key UNIQUE (name);

ALTER TABLE ONLY vessel_types
    ADD CONSTRAINT vessel_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY vessels
    ADD CONSTRAINT vessels_external_id_key UNIQUE (external_id);

ALTER TABLE ONLY vessels
    ADD CONSTRAINT vessels_pkey PRIMARY KEY (id);

-- Indexes

CREATE UNIQUE INDEX companies_code_company_key ON companies USING btree (code_company) WHERE (code_company IS NOT NULL);

CREATE INDEX companies_region_idx ON companies USING btree (region_id);

CREATE INDEX partners_parent_idx ON partners USING btree (parent_id);

CREATE INDEX pol_order_idx ON purchase_order_lines USING btree (order_id);

CREATE INDEX pol_product_idx ON purchase_order_lines USING btree (product_id);

CREATE INDEX pol_vessel_idx ON purchase_order_lines USING btree (vessel_id);

CREATE INDEX products_category_idx ON products USING btree (category_id);

CREATE INDEX purchase_order_documents_order_idx ON purchase_order_documents USING btree (order_id);

CREATE INDEX purchase_order_remarks_order_idx ON purchase_order_remarks USING btree (order_id);

CREATE INDEX purchase_orders_company_idx ON purchase_orders USING btree (company_id);

CREATE INDEX purchase_orders_date_idx ON purchase_orders USING btree (date_order DESC, id DESC);

CREATE INDEX purchase_orders_partner_idx ON purchase_orders USING btree (partner_id);

CREATE INDEX purchase_orders_state_idx ON purchase_orders USING btree (state);

CREATE INDEX regions_parent_idx ON regions USING btree (parent_id);

CREATE UNIQUE INDEX vessel_types_code_key ON vessel_types USING btree (code) WHERE (code IS NOT NULL);

CREATE INDEX vessels_type_idx ON vessels USING btree (type_id);

-- Views

CREATE VIEW regions_view AS
 SELECT r.id,
    r.name,
    r.code,
    r.description,
    r.level_region,
    r.bps_code,
    r.parent_id,
    r.active,
    r.created_at,
    r.updated_at,
    p.name AS parent_name,
    p.code AS parent_code,
    (( SELECT count(*) AS count
           FROM regions c
          WHERE (c.parent_id = r.id)))::integer AS child_count,
    (( SELECT count(*) AS count
           FROM companies c
          WHERE (c.region_id = r.id)))::integer AS companies_count
   FROM (regions r
     LEFT JOIN regions p ON ((p.id = r.parent_id)));

-- updated_at triggers

CREATE TRIGGER business_units_set_updated_at BEFORE UPDATE ON business_units FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER code_budgets_set_updated_at BEFORE UPDATE ON code_budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER partners_set_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_categories_set_updated_at BEFORE UPDATE ON product_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchase_order_lines_set_updated_at BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchase_order_remarks_set_updated_at BEFORE UPDATE ON purchase_order_remarks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchase_orders_set_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER regions_set_updated_at BEFORE UPDATE ON regions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER uoms_set_updated_at BEFORE UPDATE ON uoms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER vessel_types_set_updated_at BEFORE UPDATE ON vessel_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER vessels_set_updated_at BEFORE UPDATE ON vessels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_guard_last_admin BEFORE DELETE OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_last_admin();

-- Foreign keys

ALTER TABLE ONLY companies
    ADD CONSTRAINT companies_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);

ALTER TABLE ONLY companies
    ADD CONSTRAINT companies_region_id_fkey FOREIGN KEY (region_id) REFERENCES regions(id);

ALTER TABLE ONLY partners
    ADD CONSTRAINT partners_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES partners(id);

ALTER TABLE ONLY partners
    ADD CONSTRAINT partners_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES vessels(id);

ALTER TABLE ONLY products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES product_categories(id);

ALTER TABLE ONLY products
    ADD CONSTRAINT products_code_budget_id_fkey FOREIGN KEY (code_budget_id) REFERENCES code_budgets(id);

ALTER TABLE ONLY products
    ADD CONSTRAINT products_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES uoms(id);

ALTER TABLE ONLY purchase_order_documents
    ADD CONSTRAINT purchase_order_documents_order_id_fkey FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY purchase_order_documents
    ADD CONSTRAINT purchase_order_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_category_id_fkey FOREIGN KEY (category_id) REFERENCES product_categories(id);

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_code_budget_id_fkey FOREIGN KEY (code_budget_id) REFERENCES code_budgets(id);

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_region_id_fkey FOREIGN KEY (region_id) REFERENCES regions(id);

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES uoms(id);

ALTER TABLE ONLY purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES vessels(id);

ALTER TABLE ONLY purchase_order_remarks
    ADD CONSTRAINT purchase_order_remarks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY purchase_order_remarks
    ADD CONSTRAINT purchase_order_remarks_order_id_fkey FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_first_approved_by_fkey FOREIGN KEY (first_approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES partners(id);

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_second_approved_by_fkey FOREIGN KEY (second_approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY purchase_orders
    ADD CONSTRAINT purchase_orders_third_approved_by_fkey FOREIGN KEY (third_approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY regions
    ADD CONSTRAINT regions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES regions(id);

ALTER TABLE ONLY vessels
    ADD CONSTRAINT vessels_business_unit_id_fkey FOREIGN KEY (business_unit_id) REFERENCES business_units(id);

ALTER TABLE ONLY vessels
    ADD CONSTRAINT vessels_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES companies(id);

ALTER TABLE ONLY vessels
    ADD CONSTRAINT vessels_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES companies(id);

ALTER TABLE ONLY vessels
    ADD CONSTRAINT vessels_type_id_fkey FOREIGN KEY (type_id) REFERENCES vessel_types(id);

-- +goose Down
-- Forward-only: restoring an older schema is done from a backup, not by a down migration.
SELECT 1;
