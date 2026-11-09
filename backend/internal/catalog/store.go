package catalog

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// list runs a query and returns every row as T, never a nil slice (so the JSON is [] not null).
func list[T any](ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) ([]T, error) {
	rows, err := pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByNameLax[T])
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []T{}
	}
	return out, nil
}

func get[T any](ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) (*T, error) {
	rows, err := pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	v, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[T])
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func (s *Store) insertID(ctx context.Context, sql string, args ...any) (int64, error) {
	var id int64
	if err := s.pool.QueryRow(ctx, sql, args...).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

func affected(tag pgconn.CommandTag, err error) error {
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---- companies -------------------------------------------------------------

const companySelect = `
SELECT c.id, c.name, c.code_company, c.code_company_general, c.active, c.email, c.phone, c.website,
       c.vat, c.street, c.street2, c.city, c.zip, c.region_id, c.currency, c.business_unit_id, c.logo_path,
       CASE WHEN r.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code) END AS region,
       CASE WHEN b.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code) END AS business_unit
FROM companies c
LEFT JOIN regions r ON r.id = c.region_id
LEFT JOIN business_units b ON b.id = c.business_unit_id`

func (s *Store) ListCompanies(ctx context.Context) ([]Company, error) {
	return list[Company](ctx, s.pool, companySelect+` ORDER BY c.name, c.id`)
}

func (s *Store) GetCompany(ctx context.Context, id int64) (*Company, error) {
	return get[Company](ctx, s.pool, companySelect+` WHERE c.id = $1`, id)
}

type companyValues struct {
	name, currency                                       string
	codeCompany, codeGeneral, email, phone, website, vat *string
	street, street2, city, zip                           *string
	regionID, businessUnitID                             *int64
	active                                               bool
}

func (in CompanyInput) values() (companyValues, error) {
	var v companyValues
	var err error
	if v.name, err = requireName(in.Name); err != nil {
		return v, err
	}
	if v.active, err = requireBool("active", in.Active); err != nil {
		return v, err
	}
	v.currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	if v.currency == "" {
		v.currency = "IDR"
	}
	if len(v.currency) != 3 {
		return v, invalid("currency", "must be a 3-letter code such as IDR")
	}
	v.codeCompany, v.codeGeneral = clean(in.CodeCompany), clean(in.CodeCompanyGeneral)
	v.email, v.phone, v.website, v.vat = clean(in.Email), clean(in.Phone), clean(in.Website), clean(in.VAT)
	v.street, v.street2, v.city, v.zip = clean(in.Street), clean(in.Street2), clean(in.City), clean(in.Zip)
	v.regionID, v.businessUnitID = in.RegionID, in.BusinessUnitID
	return v, nil
}

func (s *Store) CreateCompany(ctx context.Context, in CompanyInput) (*Company, error) {
	v, err := in.values()
	if err != nil {
		return nil, err
	}
	id, err := s.insertID(ctx, `
		INSERT INTO companies (name, code_company, code_company_general, active, email, phone, website, vat,
		                       street, street2, city, zip, region_id, currency, business_unit_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
		v.name, v.codeCompany, v.codeGeneral, v.active, v.email, v.phone, v.website, v.vat,
		v.street, v.street2, v.city, v.zip, v.regionID, v.currency, v.businessUnitID)
	if err != nil {
		return nil, err
	}
	return s.GetCompany(ctx, id)
}

func (s *Store) UpdateCompany(ctx context.Context, id int64, in CompanyInput) (*Company, error) {
	v, err := in.values()
	if err != nil {
		return nil, err
	}
	err = affected(s.pool.Exec(ctx, `
		UPDATE companies SET name=$2, code_company=$3, code_company_general=$4, active=$5, email=$6, phone=$7,
		       website=$8, vat=$9, street=$10, street2=$11, city=$12, zip=$13, region_id=$14, currency=$15,
		       business_unit_id=$16
		WHERE id = $1`,
		id, v.name, v.codeCompany, v.codeGeneral, v.active, v.email, v.phone, v.website, v.vat,
		v.street, v.street2, v.city, v.zip, v.regionID, v.currency, v.businessUnitID))
	if err != nil {
		return nil, err
	}
	return s.GetCompany(ctx, id)
}

// SetCompanyLogo stores the new logo path and returns the previous one so the
// caller can delete the old file.
func (s *Store) SetCompanyLogo(ctx context.Context, id int64, path string) (previous *string, err error) {
	err = s.pool.QueryRow(ctx, `
		UPDATE companies n SET logo_path = $2
		FROM (SELECT id, logo_path FROM companies WHERE id = $1 FOR UPDATE) o
		WHERE n.id = o.id
		RETURNING o.logo_path`, id, path).Scan(&previous)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return previous, err
}

func (s *Store) ListBusinessUnits(ctx context.Context) ([]BusinessUnit, error) {
	return list[BusinessUnit](ctx, s.pool, `SELECT id, name, code FROM business_units ORDER BY name, id`)
}

// ---- partners --------------------------------------------------------------

const partnerSelect = `
SELECT p.id, p.name, p.type, p.is_company, p.is_supplier, p.is_customer, p.active, p.email, p.phone,
       p.mobile, p.website, p.vat, p.street, p.street2, p.city, p.zip, p.vessel_id, p.parent_id,
       CASE WHEN pp.id IS NULL THEN NULL ELSE jsonb_build_object('id', pp.id, 'name', pp.name) END AS parent,
       CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id', v.id, 'name', v.name) END AS vessel
FROM partners p
LEFT JOIN partners pp ON pp.id = p.parent_id
LEFT JOIN vessels v ON v.id = p.vessel_id`

func (s *Store) ListPartners(ctx context.Context) ([]Partner, error) {
	return list[Partner](ctx, s.pool, partnerSelect+` ORDER BY p.name, p.id`)
}

func (s *Store) GetPartner(ctx context.Context, id int64) (*Partner, error) {
	return get[Partner](ctx, s.pool, partnerSelect+` WHERE p.id = $1`, id)
}

type partnerValues struct {
	name, typ                                 string
	isCompany, isSupplier, isCustomer, active bool
	email, phone, mobile, website, vat        *string
	street, street2, city, zip                *string
	vesselID, parentID                        *int64
}

func (in PartnerInput) values() (partnerValues, error) {
	var v partnerValues
	var err error
	if v.name, err = requireName(in.Name); err != nil {
		return v, err
	}
	for _, f := range []struct {
		field string
		in    *bool
		out   *bool
	}{
		{"is_company", in.IsCompany, &v.isCompany},
		{"is_supplier", in.IsSupplier, &v.isSupplier},
		{"is_customer", in.IsCustomer, &v.isCustomer},
		{"active", in.Active, &v.active},
	} {
		if *f.out, err = requireBool(f.field, f.in); err != nil {
			return v, err
		}
	}
	v.typ = strings.TrimSpace(in.Type)
	if v.typ == "" {
		v.typ = "contact"
	}
	v.email, v.phone, v.mobile, v.website, v.vat = clean(in.Email), clean(in.Phone), clean(in.Mobile), clean(in.Website), clean(in.VAT)
	v.street, v.street2, v.city, v.zip = clean(in.Street), clean(in.Street2), clean(in.City), clean(in.Zip)
	v.vesselID, v.parentID = in.VesselID, in.ParentID
	return v, nil
}

func (s *Store) CreatePartner(ctx context.Context, in PartnerInput) (*Partner, error) {
	v, err := in.values()
	if err != nil {
		return nil, err
	}
	id, err := s.insertID(ctx, `
		INSERT INTO partners (name, type, is_company, is_supplier, is_customer, active, email, phone, mobile,
		                      website, vat, street, street2, city, zip, vessel_id, parent_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
		v.name, v.typ, v.isCompany, v.isSupplier, v.isCustomer, v.active, v.email, v.phone, v.mobile,
		v.website, v.vat, v.street, v.street2, v.city, v.zip, v.vesselID, v.parentID)
	if err != nil {
		return nil, err
	}
	return s.GetPartner(ctx, id)
}

func (s *Store) UpdatePartner(ctx context.Context, id int64, in PartnerInput) (*Partner, error) {
	v, err := in.values()
	if err != nil {
		return nil, err
	}
	err = affected(s.pool.Exec(ctx, `
		UPDATE partners SET name=$2, type=$3, is_company=$4, is_supplier=$5, is_customer=$6, active=$7,
		       email=$8, phone=$9, mobile=$10, website=$11, vat=$12, street=$13, street2=$14, city=$15,
		       zip=$16, vessel_id=$17, parent_id=$18
		WHERE id = $1`,
		id, v.name, v.typ, v.isCompany, v.isSupplier, v.isCustomer, v.active, v.email, v.phone, v.mobile,
		v.website, v.vat, v.street, v.street2, v.city, v.zip, v.vesselID, v.parentID))
	if err != nil {
		return nil, err
	}
	return s.GetPartner(ctx, id)
}

// ---- regions ---------------------------------------------------------------

const regionSelect = `
SELECT id, name, code, description, level_region, bps_code, parent_id, parent_name, parent_code,
       child_count, companies_count, active
FROM regions_view`

func (s *Store) ListRegions(ctx context.Context) ([]Region, error) {
	return list[Region](ctx, s.pool, regionSelect+` ORDER BY name, id`)
}

func (s *Store) GetRegion(ctx context.Context, id int64) (*Region, error) {
	return get[Region](ctx, s.pool, regionSelect+` WHERE id = $1`, id)
}

func (in RegionInput) values() (name string, active bool, err error) {
	if name, err = requireName(in.Name); err != nil {
		return
	}
	active, err = requireBool("active", in.Active)
	return
}

func (s *Store) CreateRegion(ctx context.Context, in RegionInput) (*Region, error) {
	name, active, err := in.values()
	if err != nil {
		return nil, err
	}
	id, err := s.insertID(ctx, `
		INSERT INTO regions (name, code, description, level_region, bps_code, parent_id, active)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		name, clean(in.Code), clean(in.Description), clean(in.LevelRegion), in.BPSCode, in.ParentID, active)
	if err != nil {
		return nil, err
	}
	return s.GetRegion(ctx, id)
}

func (s *Store) UpdateRegion(ctx context.Context, id int64, in RegionInput) (*Region, error) {
	name, active, err := in.values()
	if err != nil {
		return nil, err
	}
	err = affected(s.pool.Exec(ctx, `
		UPDATE regions SET name=$2, code=$3, description=$4, level_region=$5, bps_code=$6, parent_id=$7, active=$8
		WHERE id = $1`,
		id, name, clean(in.Code), clean(in.Description), clean(in.LevelRegion), in.BPSCode, in.ParentID, active))
	if err != nil {
		return nil, err
	}
	return s.GetRegion(ctx, id)
}

// ---- vessels ---------------------------------------------------------------

func (s *Store) ListVessels(ctx context.Context) ([]Vessel, error) {
	return list[Vessel](ctx, s.pool, `
		SELECT v.id, v.external_id, v.name, v.fleet_name, v.operation_head_name, v.headcount_code,
		       v.headcount_name, v.synced_at, v.code, v.type_id, v.gross_tonage::float8 AS gross_tonage,
		       v.call_sign, v.imo_no, v.mmsi_no, v.registered_year, v.registered_place, v.flag, v.active,
		       CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id', t.id, 'name', t.name) END AS type,
		       CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id', o.id, 'name', o.name) END AS operator,
		       CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('id', w.id, 'name', w.name) END AS owner,
		       CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id', b.id, 'name', b.name) END AS business_unit
		FROM vessels v
		LEFT JOIN vessel_types t ON t.id = v.type_id
		LEFT JOIN companies o ON o.id = v.operator_id
		LEFT JOIN companies w ON w.id = v.owner_id
		LEFT JOIN business_units b ON b.id = v.business_unit_id
		ORDER BY v.name, v.id`)
}

// ---- products --------------------------------------------------------------

const productSelect = `
SELECT p.id, p.name, p.default_code, p.category_id, p.uom_id, p.code_budget_id,
       p.standard_price::float8 AS standard_price, p.list_price::float8 AS list_price,
       p.merk, p.model, p.serial_number, p.specs, p.description, p.active,
       jsonb_build_object('id', c.id, 'name', c.name) AS category,
       jsonb_build_object('id', u.id, 'name', u.name) AS uom,
       CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id', b.id, 'name', b.name) END AS code_budget
FROM products p
JOIN product_categories c ON c.id = p.category_id
JOIN uoms u ON u.id = p.uom_id
LEFT JOIN code_budgets b ON b.id = p.code_budget_id`

// ListProducts returns every product, or only the active ones (what the order form offers).
func (s *Store) ListProducts(ctx context.Context, activeOnly bool) ([]Product, error) {
	q := productSelect
	if activeOnly {
		q += ` WHERE p.active`
	}
	return list[Product](ctx, s.pool, q+` ORDER BY p.name, p.id`)
}

func (s *Store) GetProduct(ctx context.Context, id int64) (*Product, error) {
	return get[Product](ctx, s.pool, productSelect+` WHERE p.id = $1`, id)
}

type productValues struct {
	name           string
	standard, list float64
	active         bool
}

func (in ProductInput) values() (productValues, error) {
	var v productValues
	var err error
	if v.name, err = requireName(in.Name); err != nil {
		return v, err
	}
	if err = positiveID("category_id", in.CategoryID); err != nil {
		return v, err
	}
	if err = positiveID("uom_id", in.UomID); err != nil {
		return v, err
	}
	if v.active, err = requireBool("active", in.Active); err != nil {
		return v, err
	}
	for _, f := range []struct {
		field string
		in    *float64
		out   *float64
	}{
		{"standard_price", in.StandardPrice, &v.standard},
		{"list_price", in.ListPrice, &v.list},
	} {
		if f.in == nil {
			return v, invalid(f.field, "is required")
		}
		if *f.in < 0 {
			return v, invalid(f.field, "must not be negative")
		}
		*f.out = *f.in
	}
	return v, nil
}

func (s *Store) CreateProduct(ctx context.Context, in ProductInput) (*Product, error) {
	v, err := in.values()
	if err != nil {
		return nil, err
	}
	id, err := s.insertID(ctx, `
		INSERT INTO products (name, default_code, category_id, uom_id, code_budget_id, standard_price, list_price,
		                      merk, model, serial_number, specs, description, active)
		VALUES ($1,$2,$3,$4,$5,$6::float8::numeric,$7::float8::numeric,$8,$9,$10,$11,$12,$13) RETURNING id`,
		v.name, clean(in.DefaultCode), in.CategoryID, in.UomID, in.CodeBudgetID, v.standard, v.list,
		clean(in.Merk), clean(in.Model), clean(in.SerialNumber), clean(in.Specs), clean(in.Description), v.active)
	if err != nil {
		return nil, err
	}
	return s.GetProduct(ctx, id)
}

func (s *Store) UpdateProduct(ctx context.Context, id int64, in ProductInput) (*Product, error) {
	v, err := in.values()
	if err != nil {
		return nil, err
	}
	err = affected(s.pool.Exec(ctx, `
		UPDATE products SET name=$2, default_code=$3, category_id=$4, uom_id=$5, code_budget_id=$6,
		       standard_price=$7::float8::numeric, list_price=$8::float8::numeric, merk=$9, model=$10,
		       serial_number=$11, specs=$12, description=$13, active=$14
		WHERE id = $1`,
		id, v.name, clean(in.DefaultCode), in.CategoryID, in.UomID, in.CodeBudgetID, v.standard, v.list,
		clean(in.Merk), clean(in.Model), clean(in.SerialNumber), clean(in.Specs), clean(in.Description), v.active))
	if err != nil {
		return nil, err
	}
	return s.GetProduct(ctx, id)
}

func (s *Store) ListCategories(ctx context.Context) ([]ProductCategory, error) {
	return list[ProductCategory](ctx, s.pool, `SELECT id, name FROM product_categories ORDER BY name, id`)
}

// ---- units -----------------------------------------------------------------

func (s *Store) ListUoms(ctx context.Context) ([]Uom, error) {
	return list[Uom](ctx, s.pool, `SELECT id, name FROM uoms ORDER BY name, id`)
}

func (s *Store) GetUom(ctx context.Context, id int64) (*Uom, error) {
	return get[Uom](ctx, s.pool, `SELECT id, name FROM uoms WHERE id = $1`, id)
}

func (s *Store) CreateUom(ctx context.Context, in UomInput) (*Uom, error) {
	name, err := requireName(in.Name)
	if err != nil {
		return nil, err
	}
	id, err := s.insertID(ctx, `INSERT INTO uoms (name) VALUES ($1) RETURNING id`, name)
	if err != nil {
		return nil, err
	}
	return s.GetUom(ctx, id)
}

func (s *Store) UpdateUom(ctx context.Context, id int64, in UomInput) (*Uom, error) {
	name, err := requireName(in.Name)
	if err != nil {
		return nil, err
	}
	if err := affected(s.pool.Exec(ctx, `UPDATE uoms SET name = $2 WHERE id = $1`, id, name)); err != nil {
		return nil, err
	}
	return s.GetUom(ctx, id)
}

// ---- code budgets ----------------------------------------------------------

func (s *Store) ListCodeBudgets(ctx context.Context, activeOnly bool) ([]CodeBudget, error) {
	q := `SELECT id, name, code, active FROM code_budgets`
	if activeOnly {
		q += ` WHERE active`
	}
	return list[CodeBudget](ctx, s.pool, q+` ORDER BY name, id`)
}

func (s *Store) GetCodeBudget(ctx context.Context, id int64) (*CodeBudget, error) {
	return get[CodeBudget](ctx, s.pool, `SELECT id, name, code, active FROM code_budgets WHERE id = $1`, id)
}

func (in CodeBudgetInput) values() (name string, active bool, err error) {
	if name, err = requireName(in.Name); err != nil {
		return
	}
	active, err = requireBool("active", in.Active)
	return
}

func (s *Store) CreateCodeBudget(ctx context.Context, in CodeBudgetInput) (*CodeBudget, error) {
	name, active, err := in.values()
	if err != nil {
		return nil, err
	}
	id, err := s.insertID(ctx, `INSERT INTO code_budgets (name, code, active) VALUES ($1,$2,$3) RETURNING id`,
		name, clean(in.Code), active)
	if err != nil {
		return nil, err
	}
	return s.GetCodeBudget(ctx, id)
}

func (s *Store) UpdateCodeBudget(ctx context.Context, id int64, in CodeBudgetInput) (*CodeBudget, error) {
	name, active, err := in.values()
	if err != nil {
		return nil, err
	}
	err = affected(s.pool.Exec(ctx, `UPDATE code_budgets SET name=$2, code=$3, active=$4 WHERE id = $1`,
		id, name, clean(in.Code), active))
	if err != nil {
		return nil, err
	}
	return s.GetCodeBudget(ctx, id)
}
