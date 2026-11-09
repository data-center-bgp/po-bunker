package catalog

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/data-center-bgp/po-bunker/backend/internal/testdb"
)

func ptr[T any](v T) *T { return &v }

func newStore(t *testing.T) *Store { return NewStore(testdb.New(t)) }

func pgCode(err error) string {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		return pg.Code
	}
	return ""
}

func wantValidation(t *testing.T, err error, field string) {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != field {
		t.Fatalf("want a validation error on %q, got %v", field, err)
	}
}

func TestCompaniesCRUDWithReferences(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	_, _ = s.pool.Exec(ctx, `INSERT INTO regions (name, code) VALUES ('Kaltim', 'KT')`)
	_, _ = s.pool.Exec(ctx, `INSERT INTO business_units (name, code) VALUES ('Shipping', 'SHP')`)

	c, err := s.CreateCompany(ctx, CompanyInput{
		Name: "  PT Armada  ", CodeCompany: ptr("ASG"), CodeCompanyGeneral: ptr(" ASG "), Active: ptr(true),
		Email: ptr("  "), RegionID: ptr(int64(1)), BusinessUnitID: ptr(int64(1)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if c.Name != "PT Armada" || c.Currency != "IDR" || c.Email != nil || *c.CodeCompanyGeneral != "ASG" {
		t.Fatalf("normalisation: %+v", c)
	}
	if c.Region == nil || c.Region.Name != "Kaltim" || *c.Region.Code != "KT" || c.BusinessUnit == nil || c.BusinessUnit.Name != "Shipping" {
		t.Fatalf("embedded references: %+v %+v", c.Region, c.BusinessUnit)
	}

	upd, err := s.UpdateCompany(ctx, c.ID, CompanyInput{Name: "PT Armada Global", Active: ptr(false), Currency: "usd"})
	if err != nil {
		t.Fatal(err)
	}
	if upd.Name != "PT Armada Global" || upd.Active || upd.Currency != "USD" || upd.Region != nil || upd.CodeCompany != nil {
		t.Fatalf("PUT must replace every field: %+v", upd)
	}

	list, _ := s.ListCompanies(ctx)
	if len(list) != 1 {
		t.Fatalf("list: %d", len(list))
	}
	if _, err := s.UpdateCompany(ctx, 999, CompanyInput{Name: "x", Active: ptr(true)}); !errors.Is(err, ErrNotFound) {
		t.Errorf("update unknown: %v", err)
	}
}

func TestCompanyValidationAndConstraints(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()

	_, err := s.CreateCompany(ctx, CompanyInput{Name: "  ", Active: ptr(true)})
	wantValidation(t, err, "name")
	_, err = s.CreateCompany(ctx, CompanyInput{Name: "X"})
	wantValidation(t, err, "active")
	_, err = s.CreateCompany(ctx, CompanyInput{Name: "X", Active: ptr(true), Currency: "RUPIAH"})
	wantValidation(t, err, "currency")

	if _, err := s.CreateCompany(ctx, CompanyInput{Name: "A", CodeCompany: ptr("DUP"), Active: ptr(true)}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateCompany(ctx, CompanyInput{Name: "B", CodeCompany: ptr("DUP"), Active: ptr(true)}); pgCode(err) != "23505" {
		t.Errorf("duplicate code_company: %v", err)
	}
	if _, err := s.CreateCompany(ctx, CompanyInput{Name: "C", Active: ptr(true), RegionID: ptr(int64(999))}); pgCode(err) != "23503" {
		t.Errorf("unknown region: %v", err)
	}
}

func TestSetCompanyLogoReturnsThePreviousPath(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	c, _ := s.CreateCompany(ctx, CompanyInput{Name: "A", Active: ptr(true)})

	prev, err := s.SetCompanyLogo(ctx, c.ID, "logos/1/1.png")
	if err != nil || prev != nil {
		t.Fatalf("first logo: %v %v", prev, err)
	}
	prev, err = s.SetCompanyLogo(ctx, c.ID, "logos/1/2.png")
	if err != nil || prev == nil || *prev != "logos/1/1.png" {
		t.Fatalf("second logo: %v %v", prev, err)
	}
	got, _ := s.GetCompany(ctx, c.ID)
	if got.LogoPath == nil || *got.LogoPath != "logos/1/2.png" {
		t.Errorf("stored: %+v", got.LogoPath)
	}
	if _, err := s.SetCompanyLogo(ctx, 999, "logos/999/1.png"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown company: %v", err)
	}
	// an edit must not wipe the logo
	if _, err := s.UpdateCompany(ctx, c.ID, CompanyInput{Name: "A2", Active: ptr(true)}); err != nil {
		t.Fatal(err)
	}
	got, _ = s.GetCompany(ctx, c.ID)
	if got.LogoPath == nil {
		t.Error("PUT /companies/:id must leave the logo alone")
	}
}

func TestPartners(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	in := PartnerInput{Name: "Vendor A", IsCompany: ptr(true), IsSupplier: ptr(true), IsCustomer: ptr(false), Active: ptr(true), Phone: ptr("0542-1")}
	a, err := s.CreatePartner(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if a.Type != "contact" || !a.IsSupplier || a.Phone == nil {
		t.Fatalf("created: %+v", a)
	}

	child := in
	child.Name = "Branch"
	child.ParentID = &a.ID
	b, err := s.CreatePartner(ctx, child)
	if err != nil || b.Parent == nil || b.Parent.Name != "Vendor A" {
		t.Fatalf("child: %+v %v", b, err)
	}

	self := in
	self.ParentID = &a.ID
	if _, err := s.UpdatePartner(ctx, a.ID, self); pgCode(err) != "23514" {
		t.Errorf("a partner cannot be its own parent: %v", err)
	}

	missing := in
	missing.IsCompany = nil
	_, err = s.CreatePartner(ctx, missing)
	wantValidation(t, err, "is_company")
	if _, err := s.UpdatePartner(ctx, 999, in); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
	if list, _ := s.ListPartners(ctx); len(list) != 2 {
		t.Errorf("list: %d", len(list))
	}
}

func TestRegionsExposeCounts(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	root, err := s.CreateRegion(ctx, RegionInput{Name: "Kalimantan", Active: ptr(true), BPSCode: ptr(int32(64))})
	if err != nil {
		t.Fatal(err)
	}
	child, err := s.CreateRegion(ctx, RegionInput{Name: "Balikpapan", Code: ptr("BPN"), Active: ptr(true), ParentID: &root.ID})
	if err != nil {
		t.Fatal(err)
	}
	if child.ParentName == nil || *child.ParentName != "Kalimantan" {
		t.Errorf("parent name: %+v", child.ParentName)
	}
	_, _ = s.CreateCompany(ctx, CompanyInput{Name: "C", Active: ptr(true), RegionID: &child.ID})

	list, _ := s.ListRegions(ctx)
	byName := map[string]Region{}
	for _, r := range list {
		byName[r.Name] = r
	}
	if byName["Kalimantan"].ChildCount != 1 || byName["Balikpapan"].CompaniesCount != 1 || *byName["Kalimantan"].BPSCode != 64 {
		t.Errorf("counts: %+v", byName)
	}
	if _, err := s.UpdateRegion(ctx, root.ID, RegionInput{Name: "Kalimantan", Active: ptr(true), ParentID: &root.ID}); pgCode(err) != "23514" {
		t.Errorf("self parent: %v", err)
	}
}

func TestProductsAndLookups(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	_, _ = s.pool.Exec(ctx, `INSERT INTO product_categories (name) VALUES ('Bunker Fuel'), ('Fresh Water')`)
	liter, _ := s.CreateUom(ctx, UomInput{Name: " Liter "})
	ton, _ := s.CreateUom(ctx, UomInput{Name: "Ton"})
	budget, _ := s.CreateCodeBudget(ctx, CodeBudgetInput{Name: "Budget", Code: ptr("B1"), Active: ptr(true)})
	if liter.Name != "Liter" {
		t.Errorf("uom not trimmed: %q", liter.Name)
	}

	p, err := s.CreateProduct(ctx, ProductInput{
		Name: "HSD", CategoryID: 1, UomID: liter.ID, CodeBudgetID: &budget.ID,
		StandardPrice: ptr(14500.125), ListPrice: ptr(0.0), Active: ptr(true), Specs: ptr("Pertamina"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if p.StandardPrice != 14500.125 || p.Category.Name != "Bunker Fuel" || p.Uom.Name != "Liter" || p.CodeBudget.Name != "Budget" {
		t.Fatalf("product: %+v", p)
	}

	water, err := s.CreateProduct(ctx, ProductInput{Name: "Air", CategoryID: 2, UomID: ton.ID, StandardPrice: ptr(0.0), ListPrice: ptr(0.0), Active: ptr(false)})
	if err != nil || water.CodeBudget != nil {
		t.Fatalf("water: %+v %v", water, err)
	}

	all, _ := s.ListProducts(ctx, false)
	active, _ := s.ListProducts(ctx, true)
	if len(all) != 2 || len(active) != 1 || active[0].Name != "HSD" {
		t.Errorf("all=%d active=%d", len(all), len(active))
	}

	up, err := s.UpdateProduct(ctx, water.ID, ProductInput{Name: "Air Tawar", CategoryID: 2, UomID: ton.ID, StandardPrice: ptr(85000.0), ListPrice: ptr(0.0), Active: ptr(true)})
	if err != nil || up.Name != "Air Tawar" || !up.Active || up.StandardPrice != 85000 {
		t.Fatalf("update: %+v %v", up, err)
	}
	if _, err := s.UpdateProduct(ctx, 999, ProductInput{Name: "x", CategoryID: 1, UomID: 1, StandardPrice: ptr(0.0), ListPrice: ptr(0.0), Active: ptr(true)}); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}

	for name, in := range map[string]ProductInput{
		"name":           {CategoryID: 1, UomID: 1, StandardPrice: ptr(0.0), ListPrice: ptr(0.0), Active: ptr(true)},
		"category_id":    {Name: "x", UomID: 1, StandardPrice: ptr(0.0), ListPrice: ptr(0.0), Active: ptr(true)},
		"uom_id":         {Name: "x", CategoryID: 1, StandardPrice: ptr(0.0), ListPrice: ptr(0.0), Active: ptr(true)},
		"standard_price": {Name: "x", CategoryID: 1, UomID: 1, StandardPrice: ptr(-1.0), ListPrice: ptr(0.0), Active: ptr(true)},
		"list_price":     {Name: "x", CategoryID: 1, UomID: 1, StandardPrice: ptr(0.0), Active: ptr(true)},
		"active":         {Name: "x", CategoryID: 1, UomID: 1, StandardPrice: ptr(0.0), ListPrice: ptr(0.0)},
	} {
		_, err := s.CreateProduct(ctx, in)
		wantValidation(t, err, name)
	}
	if _, err := s.CreateProduct(ctx, ProductInput{Name: "x", CategoryID: 99, UomID: liter.ID, StandardPrice: ptr(0.0), ListPrice: ptr(0.0), Active: ptr(true)}); pgCode(err) != "23503" {
		t.Errorf("unknown category: %v", err)
	}

	if _, err := s.CreateUom(ctx, UomInput{Name: "Liter"}); pgCode(err) != "23505" {
		t.Errorf("duplicate unit: %v", err)
	}
	if _, err := s.CreateUom(ctx, UomInput{Name: " "}); err == nil {
		t.Error("blank unit")
	}
	if u, err := s.UpdateUom(ctx, ton.ID, UomInput{Name: "Tonne"}); err != nil || u.Name != "Tonne" {
		t.Errorf("rename unit: %+v %v", u, err)
	}

	if _, err := s.UpdateCodeBudget(ctx, budget.ID, CodeBudgetInput{Name: "Budget", Code: ptr("B1"), Active: ptr(false)}); err != nil {
		t.Fatal(err)
	}
	if all, _ := s.ListCodeBudgets(ctx, false); len(all) != 1 {
		t.Errorf("all budgets: %d", len(all))
	}
	if act, _ := s.ListCodeBudgets(ctx, true); len(act) != 0 {
		t.Errorf("active budgets: %d", len(act))
	}
	cats, _ := s.ListCategories(ctx)
	if len(cats) != 2 {
		t.Errorf("categories: %d", len(cats))
	}
}

func TestEmptyListsAreNotNil(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	if v, _ := s.ListVessels(ctx); v == nil || len(v) != 0 {
		t.Errorf("vessels: %#v", v)
	}
	if v, _ := s.ListCompanies(ctx); v == nil {
		t.Error("companies nil")
	}
	if v, _ := s.ListBusinessUnits(ctx); v == nil {
		t.Error("business units nil")
	}
}

func TestVesselListShape(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	_, _ = s.pool.Exec(ctx, `INSERT INTO vessel_types (name, code) VALUES ('Tug', 'TB')`)
	c, _ := s.CreateCompany(ctx, CompanyInput{Name: "Owner Co", Active: ptr(true)})
	_, err := s.pool.Exec(ctx, `INSERT INTO vessels (name, type_id, gross_tonage, owner_id, external_id, fleet_name) VALUES ('TB BB 99', 1, 199.5, $1, 77, 'F1')`, c.ID)
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.ListVessels(ctx)
	if err != nil || len(list) != 1 {
		t.Fatalf("%v %v", list, err)
	}
	v := list[0]
	if v.Name != "TB BB 99" || v.Type == nil || v.Type.Name != "Tug" || v.Owner == nil || v.Owner.Name != "Owner Co" || v.Operator != nil ||
		v.GrossTonage == nil || *v.GrossTonage != 199.5 || *v.ExternalID != 77 || !v.Active {
		t.Errorf("vessel: %+v", v)
	}
}
