// Package catalog is the master data of PO Bunker: companies, partners,
// regions, vessels, products, units and code budgets. JSON field names match
// the TypeScript types in src/services/types.ts so the frontend components do
// not change.
package catalog

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrNotFound = errors.New("not found")

// ValidationError is a rejected input: which field and why.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string { return fmt.Sprintf("%s: %s", e.Field, e.Message) }

func invalid(field, msg string) error { return &ValidationError{Field: field, Message: msg} }

type Ref struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type RefCode struct {
	ID   int64   `json:"id"`
	Name string  `json:"name"`
	Code *string `json:"code"`
}

// ---- companies -------------------------------------------------------------

type Company struct {
	ID                 int64    `json:"id" db:"id"`
	Name               string   `json:"name" db:"name"`
	CodeCompany        *string  `json:"code_company" db:"code_company"`
	CodeCompanyGeneral *string  `json:"code_company_general" db:"code_company_general"`
	Active             bool     `json:"active" db:"active"`
	Email              *string  `json:"email" db:"email"`
	Phone              *string  `json:"phone" db:"phone"`
	Website            *string  `json:"website" db:"website"`
	VAT                *string  `json:"vat" db:"vat"`
	Street             *string  `json:"street" db:"street"`
	Street2            *string  `json:"street2" db:"street2"`
	City               *string  `json:"city" db:"city"`
	Zip                *string  `json:"zip" db:"zip"`
	RegionID           *int64   `json:"region_id" db:"region_id"`
	Currency           string   `json:"currency" db:"currency"`
	BusinessUnitID     *int64   `json:"business_unit_id" db:"business_unit_id"`
	LogoPath           *string  `json:"logo_path" db:"logo_path"`
	Region             *RefCode `json:"region" db:"region"`
	BusinessUnit       *RefCode `json:"business_unit" db:"business_unit"`
}

// CompanyInput is the full set of editable fields (PUT replaces them). The
// logo has its own upload endpoint.
type CompanyInput struct {
	Name               string  `json:"name"`
	CodeCompany        *string `json:"code_company"`
	CodeCompanyGeneral *string `json:"code_company_general"`
	Active             *bool   `json:"active"`
	Email              *string `json:"email"`
	Phone              *string `json:"phone"`
	Website            *string `json:"website"`
	VAT                *string `json:"vat"`
	Street             *string `json:"street"`
	Street2            *string `json:"street2"`
	City               *string `json:"city"`
	Zip                *string `json:"zip"`
	RegionID           *int64  `json:"region_id"`
	Currency           string  `json:"currency"`
	BusinessUnitID     *int64  `json:"business_unit_id"`
}

type BusinessUnit struct {
	ID   int64   `json:"id" db:"id"`
	Name string  `json:"name" db:"name"`
	Code *string `json:"code" db:"code"`
}

// ---- partners --------------------------------------------------------------

type Partner struct {
	ID         int64   `json:"id" db:"id"`
	Name       string  `json:"name" db:"name"`
	Type       string  `json:"type" db:"type"`
	IsCompany  bool    `json:"is_company" db:"is_company"`
	IsSupplier bool    `json:"is_supplier" db:"is_supplier"`
	IsCustomer bool    `json:"is_customer" db:"is_customer"`
	Active     bool    `json:"active" db:"active"`
	Email      *string `json:"email" db:"email"`
	Phone      *string `json:"phone" db:"phone"`
	Mobile     *string `json:"mobile" db:"mobile"`
	Website    *string `json:"website" db:"website"`
	VAT        *string `json:"vat" db:"vat"`
	Street     *string `json:"street" db:"street"`
	Street2    *string `json:"street2" db:"street2"`
	City       *string `json:"city" db:"city"`
	Zip        *string `json:"zip" db:"zip"`
	VesselID   *int64  `json:"vessel_id" db:"vessel_id"`
	ParentID   *int64  `json:"parent_id" db:"parent_id"`
	Parent     *Ref    `json:"parent" db:"parent"`
	Vessel     *Ref    `json:"vessel" db:"vessel"`
}

type PartnerInput struct {
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	IsCompany  *bool   `json:"is_company"`
	IsSupplier *bool   `json:"is_supplier"`
	IsCustomer *bool   `json:"is_customer"`
	Active     *bool   `json:"active"`
	Email      *string `json:"email"`
	Phone      *string `json:"phone"`
	Mobile     *string `json:"mobile"`
	Website    *string `json:"website"`
	VAT        *string `json:"vat"`
	Street     *string `json:"street"`
	Street2    *string `json:"street2"`
	City       *string `json:"city"`
	Zip        *string `json:"zip"`
	VesselID   *int64  `json:"vessel_id"`
	ParentID   *int64  `json:"parent_id"`
}

// ---- regions ---------------------------------------------------------------

type Region struct {
	ID             int64   `json:"id" db:"id"`
	Name           string  `json:"name" db:"name"`
	Code           *string `json:"code" db:"code"`
	Description    *string `json:"description" db:"description"`
	LevelRegion    *string `json:"level_region" db:"level_region"`
	BPSCode        *int32  `json:"bps_code" db:"bps_code"`
	ParentID       *int64  `json:"parent_id" db:"parent_id"`
	ParentName     *string `json:"parent_name" db:"parent_name"`
	ParentCode     *string `json:"parent_code" db:"parent_code"`
	ChildCount     int32   `json:"child_count" db:"child_count"`
	CompaniesCount int32   `json:"companies_count" db:"companies_count"`
	Active         bool    `json:"active" db:"active"`
}

type RegionInput struct {
	Name        string  `json:"name"`
	Code        *string `json:"code"`
	Description *string `json:"description"`
	LevelRegion *string `json:"level_region"`
	BPSCode     *int32  `json:"bps_code"`
	ParentID    *int64  `json:"parent_id"`
	Active      *bool   `json:"active"`
}

// ---- vessels (read-only here; the SMS sync writes them) --------------------

type Vessel struct {
	ID                int64      `json:"id" db:"id"`
	ExternalID        *int64     `json:"external_id" db:"external_id"`
	Name              string     `json:"name" db:"name"`
	FleetName         *string    `json:"fleet_name" db:"fleet_name"`
	OperationHeadName *string    `json:"operation_head_name" db:"operation_head_name"`
	HeadcountCode     *string    `json:"headcount_code" db:"headcount_code"`
	HeadcountName     *string    `json:"headcount_name" db:"headcount_name"`
	SyncedAt          *time.Time `json:"synced_at" db:"synced_at"`
	Code              *string    `json:"code" db:"code"`
	TypeID            *int64     `json:"type_id" db:"type_id"`
	GrossTonage       *float64   `json:"gross_tonage" db:"gross_tonage"`
	CallSign          *string    `json:"call_sign" db:"call_sign"`
	IMONo             *string    `json:"imo_no" db:"imo_no"`
	MMSINo            *string    `json:"mmsi_no" db:"mmsi_no"`
	RegisteredYear    *string    `json:"registered_year" db:"registered_year"`
	RegisteredPlace   *string    `json:"registered_place" db:"registered_place"`
	Flag              *string    `json:"flag" db:"flag"`
	Active            bool       `json:"active" db:"active"`
	Type              *Ref       `json:"type" db:"type"`
	Operator          *Ref       `json:"operator" db:"operator"`
	Owner             *Ref       `json:"owner" db:"owner"`
	BusinessUnit      *Ref       `json:"business_unit" db:"business_unit"`
}

// ---- products, categories, units, code budgets -----------------------------

type Product struct {
	ID            int64   `json:"id" db:"id"`
	Name          string  `json:"name" db:"name"`
	DefaultCode   *string `json:"default_code" db:"default_code"`
	CategoryID    int64   `json:"category_id" db:"category_id"`
	UomID         int64   `json:"uom_id" db:"uom_id"`
	CodeBudgetID  *int64  `json:"code_budget_id" db:"code_budget_id"`
	StandardPrice float64 `json:"standard_price" db:"standard_price"`
	ListPrice     float64 `json:"list_price" db:"list_price"`
	Merk          *string `json:"merk" db:"merk"`
	Model         *string `json:"model" db:"model"`
	SerialNumber  *string `json:"serial_number" db:"serial_number"`
	Specs         *string `json:"specs" db:"specs"`
	Description   *string `json:"description" db:"description"`
	Active        bool    `json:"active" db:"active"`
	Category      *Ref    `json:"category" db:"category"`
	Uom           *Ref    `json:"uom" db:"uom"`
	CodeBudget    *Ref    `json:"code_budget" db:"code_budget"`
}

type ProductInput struct {
	Name          string   `json:"name"`
	DefaultCode   *string  `json:"default_code"`
	CategoryID    int64    `json:"category_id"`
	UomID         int64    `json:"uom_id"`
	CodeBudgetID  *int64   `json:"code_budget_id"`
	StandardPrice *float64 `json:"standard_price"`
	ListPrice     *float64 `json:"list_price"`
	Merk          *string  `json:"merk"`
	Model         *string  `json:"model"`
	SerialNumber  *string  `json:"serial_number"`
	Specs         *string  `json:"specs"`
	Description   *string  `json:"description"`
	Active        *bool    `json:"active"`
}

type ProductCategory struct {
	ID   int64  `json:"id" db:"id"`
	Name string `json:"name" db:"name"`
}

type Uom struct {
	ID   int64  `json:"id" db:"id"`
	Name string `json:"name" db:"name"`
}

type UomInput struct {
	Name string `json:"name"`
}

type CodeBudget struct {
	ID     int64   `json:"id" db:"id"`
	Name   string  `json:"name" db:"name"`
	Code   *string `json:"code" db:"code"`
	Active bool    `json:"active" db:"active"`
}

type CodeBudgetInput struct {
	Name   string  `json:"name"`
	Code   *string `json:"code"`
	Active *bool   `json:"active"`
}

// ---- input helpers ---------------------------------------------------------

// clean trims a nullable string and turns blank into nil.
func clean(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}

func requireName(name string) (string, error) {
	n := strings.TrimSpace(name)
	if n == "" {
		return "", invalid("name", "is required")
	}
	return n, nil
}

func requireBool(field string, b *bool) (bool, error) {
	if b == nil {
		return false, invalid(field, "is required")
	}
	return *b, nil
}

func positiveID(field string, id int64) error {
	if id <= 0 {
		return invalid(field, "is required")
	}
	return nil
}
