// Package orders holds the purchase order rules: numbering, totals and the
// submitted / completed / cancelled lifecycle, plus Delivery Order documents
// and remarks. JSON field names match src/services/types.ts.
package orders

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

func init() {
	// Money and quantities are sent as JSON numbers (the frontend expects
	// numbers), while staying exact decimals on the server.
	decimal.MarshalJSONWithoutQuotes = true
}

type (
	Dec     = decimal.Decimal
	NullDec = decimal.NullDecimal
)

const (
	StateSubmitted = "submitted"
	StateCompleted = "completed"
	StateCancelled = "cancelled"

	TypeBunkerFuel  = "bunker_fuel"
	TypeBunkerWater = "bunker_water"
	TypeLogistic    = "logistic"

	DocTypeDeliveryOrder = "delivery_order"
)

var ErrNotFound = errors.New("not found")

// RuleError is a business rule that refused the request. Conflict is true when
// the order is in the wrong state (HTTP 409); otherwise the input was invalid (422).
type RuleError struct {
	Code     string
	Message  string
	Field    string
	Conflict bool
}

func (e *RuleError) Error() string { return e.Code + ": " + e.Message }

func invalid(code, field, msg string) error {
	return &RuleError{Code: code, Field: field, Message: msg}
}

func conflict(code, msg string) error { return &RuleError{Code: code, Message: msg, Conflict: true} }

// ---- output ----------------------------------------------------------------

type RefName struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type UserRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type CompanyRef struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	CodeCompany *string `json:"code_company"`
	LogoPath    *string `json:"logo_path"`
}

type PartnerRef struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	Street *string `json:"street"`
	City   *string `json:"city"`
	Phone  *string `json:"phone"`
}

type ProductRef struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	DefaultCode  *string `json:"default_code"`
	Merk         *string `json:"merk"`
	Model        *string `json:"model"`
	SerialNumber *string `json:"serial_number"`
	Specs        *string `json:"specs"`
}

type VesselRef struct {
	ID   int64   `json:"id"`
	Name string  `json:"name"`
	Code *string `json:"code"`
}

// Header holds the purchase_orders columns plus the people and companies
// around it. The old three-level approval columns stay in the output (the PDF
// code still reads them) but nothing writes them any more.
type Header struct {
	ID             int64      `json:"id" db:"id"`
	Name           string     `json:"name" db:"name"`
	CompanyID      int64      `json:"company_id" db:"company_id"`
	PartnerID      int64      `json:"partner_id" db:"partner_id"`
	OrderType      string     `json:"order_type" db:"order_type"`
	State          string     `json:"state" db:"state"`
	DateOrder      time.Time  `json:"date_order" db:"date_order"`
	DateApprove    *time.Time `json:"date_approve" db:"date_approve"`
	Notes          string     `json:"notes" db:"notes"`
	AmountUntaxed  Dec        `json:"amount_untaxed" db:"amount_untaxed"`
	AmountTax      Dec        `json:"amount_tax" db:"amount_tax"`
	AmountDiscount Dec        `json:"amount_discount" db:"amount_discount"`
	AmountTotal    Dec        `json:"amount_total" db:"amount_total"`
	OptionOrder    string     `json:"option_order" db:"option_order"`
	PartnerRefText *string    `json:"partner_ref" db:"partner_ref"`
	DateVendor     *time.Time `json:"date_vendor" db:"date_vendor"`
	DateBunker     *time.Time `json:"date_bunker" db:"date_bunker"`
	TaxPercent     Dec        `json:"tax_percent" db:"tax_percent"`
	CreatedBy      *string    `json:"created_by" db:"created_by"`

	FirstApprovedBy             *string    `json:"first_approved_by" db:"first_approved_by"`
	FirstApprovedAt             *time.Time `json:"first_approved_at" db:"first_approved_at"`
	FirstApprovedSignaturePath  *string    `json:"first_approved_signature_path" db:"first_approved_signature_path"`
	SecondApprovedBy            *string    `json:"second_approved_by" db:"second_approved_by"`
	SecondApprovedAt            *time.Time `json:"second_approved_at" db:"second_approved_at"`
	SecondApprovedSignaturePath *string    `json:"second_approved_signature_path" db:"second_approved_signature_path"`
	ThirdApprovedBy             *string    `json:"third_approved_by" db:"third_approved_by"`
	ThirdApprovedAt             *time.Time `json:"third_approved_at" db:"third_approved_at"`
	ThirdApprovedSignaturePath  *string    `json:"third_approved_signature_path" db:"third_approved_signature_path"`

	Company   CompanyRef `json:"company" db:"company"`
	Partner   PartnerRef `json:"partner" db:"partner"`
	Creator   *UserRef   `json:"creator" db:"creator"`
	Completer *UserRef   `json:"completer" db:"completer"`
	Canceller *UserRef   `json:"canceller" db:"canceller"`

	CompletedAt  *time.Time `json:"completed_at" db:"completed_at"`
	CompletedBy  *string    `json:"completed_by" db:"completed_by"`
	CancelReason *string    `json:"cancel_reason" db:"cancel_reason"`
	CancelledAt  *time.Time `json:"cancelled_at" db:"cancelled_at"`
	CancelledBy  *string    `json:"cancelled_by" db:"cancelled_by"`
	ActualAmount NullDec    `json:"actual_amount" db:"actual_amount"`
}

type Line struct {
	ID             int64       `json:"id" db:"id"`
	OrderID        int64       `json:"order_id" db:"order_id"`
	ProductID      int64       `json:"product_id" db:"product_id"`
	VesselID       int64       `json:"vessel_id" db:"vessel_id"`
	RegionID       *int64      `json:"region_id" db:"region_id"`
	CodeBudgetID   *int64      `json:"code_budget_id" db:"code_budget_id"`
	CategoryID     *int64      `json:"category_id" db:"category_id"`
	UomID          int64       `json:"uom_id" db:"uom_id"`
	ProductQty     Dec         `json:"product_qty" db:"product_qty"`
	PriceUnit      Dec         `json:"price_unit" db:"price_unit"`
	PriceSubtotal  Dec         `json:"price_subtotal" db:"price_subtotal"`
	ActualQty      NullDec     `json:"actual_qty" db:"actual_qty"`
	ActualSubtotal NullDec     `json:"actual_subtotal" db:"actual_subtotal"`
	Project        string      `json:"project" db:"project"`
	RequestedBy    *string     `json:"requested_by" db:"requested_by"`
	Priority       *string     `json:"priority" db:"priority"`
	StatusList     string      `json:"status_list" db:"status_list"`
	Product        *ProductRef `json:"product" db:"product"`
	Vessel         *VesselRef  `json:"vessel" db:"vessel"`
	Region         *RefName    `json:"region" db:"region"`
	Uom            *RefName    `json:"uom" db:"uom"`
	CodeBudget     *RefName    `json:"code_budget" db:"code_budget"`
	Category       *RefName    `json:"category" db:"category"`
	Requester      *UserRef    `json:"requester" db:"requester"`
}

type Document struct {
	ID         int64     `json:"id" db:"id"`
	OrderID    int64     `json:"order_id" db:"order_id"`
	DocType    string    `json:"doc_type" db:"doc_type"`
	FilePath   string    `json:"file_path" db:"file_path"`
	FileName   string    `json:"file_name" db:"file_name"`
	MimeType   string    `json:"mime_type" db:"mime_type"`
	SizeBytes  int64     `json:"size_bytes" db:"size_bytes"`
	UploadedAt time.Time `json:"uploaded_at" db:"uploaded_at"`
	Uploader   *UserRef  `json:"uploader" db:"uploader"`
}

type Remark struct {
	ID         int64  `json:"id" db:"id"`
	OrderID    int64  `json:"order_id" db:"order_id"`
	RemarkDate string `json:"remark_date" db:"remark_date"` // YYYY-MM-DD
	Color      string `json:"color" db:"color"`
	Remark     string `json:"remark" db:"remark"`
}

type Order struct {
	Header
	Documents []Document `json:"documents"`
	Remarks   []Remark   `json:"remarks"`
	Lines     []Line     `json:"lines"`
}

// Page is one page of the order list.
type Page struct {
	Orders     []Order `json:"orders"`
	TotalCount int64   `json:"total_count"`
}

// ---- dashboard feed --------------------------------------------------------

type DashboardLine struct {
	ID             int64    `json:"id" db:"id"`
	OrderID        int64    `json:"-" db:"order_id"`
	ProductQty     Dec      `json:"product_qty" db:"product_qty"`
	ActualQty      NullDec  `json:"actual_qty" db:"actual_qty"`
	PriceSubtotal  Dec      `json:"price_subtotal" db:"price_subtotal"`
	ActualSubtotal NullDec  `json:"actual_subtotal" db:"actual_subtotal"`
	Product        *RefName `json:"product" db:"product"`
	Vessel         *RefName `json:"vessel" db:"vessel"`
	Uom            *RefName `json:"uom" db:"uom"`
}

type DashboardOrder struct {
	ID           int64           `json:"id" db:"id"`
	Name         string          `json:"name" db:"name"`
	State        string          `json:"state" db:"state"`
	OrderType    string          `json:"order_type" db:"order_type"`
	DateOrder    time.Time       `json:"date_order" db:"date_order"`
	DateBunker   *time.Time      `json:"date_bunker" db:"date_bunker"`
	CompletedAt  *time.Time      `json:"completed_at" db:"completed_at"`
	CancelledAt  *time.Time      `json:"cancelled_at" db:"cancelled_at"`
	AmountTotal  Dec             `json:"amount_total" db:"amount_total"`
	ActualAmount NullDec         `json:"actual_amount" db:"actual_amount"`
	Partner      *RefName        `json:"partner" db:"partner"`
	Company      *RefName        `json:"company" db:"company"`
	Lines        []DashboardLine `json:"lines"`
}

// ---- input -----------------------------------------------------------------

type LineInput struct {
	ProductID    int64   `json:"product_id"`
	VesselID     int64   `json:"vessel_id"`
	UomID        int64   `json:"uom_id"`
	ProductQty   *Dec    `json:"product_qty"`
	PriceUnit    *Dec    `json:"price_unit"`
	RegionID     *int64  `json:"region_id"`
	CodeBudgetID *int64  `json:"code_budget_id"`
	CategoryID   *int64  `json:"category_id"`
	Project      string  `json:"project"`
	RequestedBy  *string `json:"requested_by"`
	Priority     *string `json:"priority"`
}

type CreateInput struct {
	CompanyID      int64       `json:"company_id"`
	PartnerID      int64       `json:"partner_id"`
	OrderType      string      `json:"order_type"`
	DateOrder      *time.Time  `json:"date_order"`
	Notes          string      `json:"notes"`
	OptionOrder    string      `json:"option_order"`
	PartnerRef     *string     `json:"partner_ref"`
	DateVendor     *time.Time  `json:"date_vendor"`
	DateBunker     *time.Time  `json:"date_bunker"`
	AmountDiscount *Dec        `json:"amount_discount"`
	TaxPercent     *Dec        `json:"tax_percent"`
	Lines          []LineInput `json:"lines"`
}

type ActualQty struct {
	LineID    int64 `json:"line_id"`
	ActualQty *Dec  `json:"actual_qty"`
}

type CompleteInput struct {
	Lines []ActualQty `json:"lines"`
}

type CancelInput struct {
	Reason string `json:"reason"`
}

type RemarkInput struct {
	Remark     string  `json:"remark"`
	Color      string  `json:"color"`
	RemarkDate *string `json:"remark_date"`
}
