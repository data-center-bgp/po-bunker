package orders

import (
	"context"
	"errors"
	"fmt"
	"io"
	"path"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/data-center-bgp/po-bunker/backend/internal/files"
)

// Service owns every rule that changes an order. Each operation is one
// database transaction, so a half-saved order can never exist.
type Service struct {
	pool  *pgxpool.Pool
	store *Store
	files *files.Store
	now   func() time.Time
}

func NewService(pool *pgxpool.Pool, store *Store, fileStore *files.Store) *Service {
	return &Service{pool: pool, store: store, files: fileStore, now: time.Now}
}

var (
	uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	maxAmount   = decimal.RequireFromString("1000000000000") // 1e12: far above any real PO, far below numeric(18,4)
)

const (
	minCancelReasonLength = 3
	maxNotesLength        = 100000 // the notes are rich text (HTML)
	maxRemarkLength       = 2000
)

func field(name, msg string) error {
	return &RuleError{Code: "validation_failed", Field: name, Message: name + " " + msg}
}

// ---- create ----------------------------------------------------------------

type lineValues struct {
	in         LineInput
	qty, price Dec
	project    string
}

type createValues struct {
	in       CreateInput
	date     time.Time
	option   string
	discount Dec
	vat      Dec
	partner  *string
	lines    []lineValues
}

func trimmed(s *string) *string {
	if s == nil {
		return nil
	}
	if t := strings.TrimSpace(*s); t != "" {
		return &t
	}
	return nil
}

func (in CreateInput) validate() (createValues, error) {
	v := createValues{in: in}
	if in.CompanyID <= 0 {
		return v, field("company_id", "is required")
	}
	if in.PartnerID <= 0 {
		return v, field("partner_id", "is required")
	}
	if _, err := counterScope(in.OrderType, time.Time{}, time.Time{}); err != nil {
		return v, field("order_type", "must be bunker_fuel, bunker_water or logistic")
	}
	if in.DateOrder == nil || in.DateOrder.IsZero() {
		return v, field("date_order", "is required")
	}
	v.date = *in.DateOrder
	if v.option = in.OptionOrder; v.option == "" {
		v.option = "quotation"
	}
	if v.option != "quotation" && v.option != "invoice" {
		return v, field("option_order", "must be quotation or invoice")
	}
	if utf8.RuneCountInString(in.Notes) > maxNotesLength {
		return v, field("notes", "is too long")
	}
	v.partner = trimmed(in.PartnerRef)

	v.discount, v.vat = decZero, decZero
	if in.AmountDiscount != nil {
		v.discount = *in.AmountDiscount
	}
	if in.TaxPercent != nil {
		v.vat = *in.TaxPercent
	}
	if v.discount.IsNegative() || v.discount.GreaterThanOrEqual(maxAmount) {
		return v, field("amount_discount", "must be between 0 and 1,000,000,000,000")
	}
	if v.vat.IsNegative() || v.vat.GreaterThan(decHundred) {
		return v, field("tax_percent", "must be between 0 and 100")
	}

	if len(in.Lines) == 0 {
		return v, &RuleError{Code: "lines_required", Field: "lines", Message: "An order needs at least one line"}
	}
	if len(in.Lines) > 200 {
		return v, field("lines", "has too many entries (200 at most)")
	}
	for i, l := range in.Lines {
		prefix := fmt.Sprintf("lines[%d].", i)
		if l.ProductID <= 0 {
			return v, field(prefix+"product_id", "is required")
		}
		if l.VesselID <= 0 {
			return v, field(prefix+"vessel_id", "is required")
		}
		if l.UomID <= 0 {
			return v, field(prefix+"uom_id", "is required")
		}
		if l.ProductQty == nil || !l.ProductQty.IsPositive() || l.ProductQty.GreaterThanOrEqual(maxAmount) {
			return v, field(prefix+"product_qty", "must be greater than 0")
		}
		if l.PriceUnit == nil || l.PriceUnit.IsNegative() || l.PriceUnit.GreaterThanOrEqual(maxAmount) {
			return v, field(prefix+"price_unit", "is required and must not be negative")
		}
		if l.Priority != nil && *l.Priority != "low" && *l.Priority != "medium" && *l.Priority != "high" {
			return v, field(prefix+"priority", "must be low, medium or high")
		}
		if l.RequestedBy != nil && !uuidPattern.MatchString(*l.RequestedBy) {
			return v, field(prefix+"requested_by", "is not a valid user id")
		}
		v.lines = append(v.lines, lineValues{in: l, qty: *l.ProductQty, price: *l.PriceUnit, project: strings.TrimSpace(l.Project)})
	}
	return v, nil
}

// Create submits a new order: it gets its number, its lines and its totals in
// one transaction. A submitted order cannot be edited afterwards.
func (s *Service) Create(ctx context.Context, userID string, in CreateInput) (*Order, error) {
	v, err := in.validate()
	if err != nil {
		return nil, err
	}
	now := s.now()

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var code *string
	err = tx.QueryRow(ctx, `SELECT code_company_general FROM companies WHERE id = $1`, in.CompanyID).Scan(&code)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, &RuleError{Code: "invalid_reference", Field: "company_id", Message: "The company does not exist"}
	}
	if err != nil {
		return nil, err
	}
	companyCode := ""
	if code != nil {
		companyCode = strings.TrimSpace(*code)
	}
	if in.OrderType != TypeLogistic && companyCode == "" {
		return nil, &RuleError{
			Code: "company_code_missing", Field: "company_id",
			Message: "The company has no General Code, which is required to number a bunker PO. Set it on the Companies page first.",
		}
	}

	scope, err := counterScope(in.OrderType, v.date, now)
	if err != nil {
		return nil, err
	}
	var seq int
	err = tx.QueryRow(ctx, `
		INSERT INTO po_number_counters AS c (scope, last_seq) VALUES ($1, 1)
		ON CONFLICT (scope) DO UPDATE SET last_seq = c.last_seq + 1
		RETURNING last_seq`, scope).Scan(&seq)
	if err != nil {
		return nil, err
	}
	name := formatNumber(in.OrderType, companyCode, seq, v.date, now)

	var orderID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO purchase_orders (name, company_id, partner_id, order_type, state, date_order, notes, option_order,
		                             partner_ref, date_vendor, date_bunker, amount_discount, tax_percent, created_by)
		VALUES ($1, $2, $3, $4, 'submitted', $5, $6, $7, $8, $9, $10, $11::numeric, $12::numeric, $13::uuid)
		RETURNING id`,
		name, in.CompanyID, in.PartnerID, in.OrderType, v.date, in.Notes, v.option,
		v.partner, in.DateVendor, in.DateBunker, v.discount.String(), v.vat.String(), userID).Scan(&orderID)
	if err != nil {
		return nil, err
	}

	for _, l := range v.lines {
		_, err = tx.Exec(ctx, `
			INSERT INTO purchase_order_lines (order_id, product_id, vessel_id, uom_id, product_qty, price_unit,
			                                  region_id, code_budget_id, category_id, project, requested_by, priority)
			VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, $8, $9, $10, $11::uuid, $12)`,
			orderID, l.in.ProductID, l.in.VesselID, l.in.UomID, l.qty.String(), l.price.String(),
			l.in.RegionID, l.in.CodeBudgetID, l.in.CategoryID, l.project, l.in.RequestedBy, l.in.Priority)
		if err != nil {
			return nil, err
		}
	}

	// price_subtotal is a generated column, so the database does the line rounding.
	var linesTotal Dec
	if err := tx.QueryRow(ctx,
		`SELECT coalesce(sum(price_subtotal), 0)::text FROM purchase_order_lines WHERE order_id = $1`, orderID).Scan(&linesTotal); err != nil {
		return nil, err
	}
	totals, err := ComputeTotals(linesTotal, v.discount, v.vat)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE purchase_orders SET amount_untaxed = $2::numeric, amount_tax = $3::numeric, amount_total = $4::numeric WHERE id = $1`,
		orderID, totals.Untaxed.String(), totals.Tax.String(), totals.Total.String()); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.store.Get(ctx, orderID)
}

// lockOrder locks the order row and returns its state.
func lockOrder(ctx context.Context, tx pgx.Tx, id int64, mode string) (string, error) {
	var state string
	err := tx.QueryRow(ctx, `SELECT state FROM purchase_orders WHERE id = $1 FOR `+mode, id).Scan(&state)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return state, err
}

// ---- complete --------------------------------------------------------------

// Complete records that the bunkering happened: a Delivery Order must be
// uploaded and every line needs the actual quantity from it. Completed orders
// are final.
func (s *Service) Complete(ctx context.Context, userID string, id int64, in CompleteInput) (*Order, error) {
	if in.Lines == nil {
		return nil, &RuleError{Code: "actual_qty_required", Field: "lines", Message: "The actual quantities are required"}
	}
	for i, l := range in.Lines {
		if l.LineID <= 0 || l.ActualQty == nil {
			return nil, &RuleError{Code: "actual_qty_required", Field: fmt.Sprintf("lines[%d]", i), Message: "Enter the actual quantity for every line of the order"}
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	state, err := lockOrder(ctx, tx, id, "UPDATE")
	if err != nil {
		return nil, err
	}
	if state != StateSubmitted {
		return nil, conflict("order_not_submitted", "Only submitted orders can be completed")
	}
	var hasDO bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM purchase_order_documents WHERE order_id = $1 AND doc_type = 'delivery_order')`, id).Scan(&hasDO); err != nil {
		return nil, err
	}
	if !hasDO {
		return nil, conflict("do_required", "Upload the Delivery Order (DO) before completing the order")
	}

	rows, err := tx.Query(ctx, `SELECT id FROM purchase_order_lines WHERE order_id = $1`, id)
	if err != nil {
		return nil, err
	}
	expected, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return nil, err
	}
	given := make(map[int64]bool, len(in.Lines))
	for _, l := range in.Lines {
		given[l.LineID] = true
	}
	missing := len(given) != len(in.Lines) || len(given) != len(expected)
	for _, lineID := range expected {
		if !given[lineID] {
			missing = true
		}
	}
	if missing {
		return nil, &RuleError{Code: "actual_qty_required", Field: "lines", Message: "Enter the actual quantity for every line of the order"}
	}

	for _, l := range in.Lines {
		if l.ActualQty.IsNegative() || l.ActualQty.GreaterThanOrEqual(maxAmount) {
			return nil, &RuleError{Code: "actual_qty_invalid", Field: "lines", Message: "The actual quantity must be zero or more"}
		}
		if _, err := tx.Exec(ctx,
			`UPDATE purchase_order_lines SET actual_qty = $2::numeric WHERE id = $1 AND order_id = $3`,
			l.LineID, l.ActualQty.String(), id); err != nil {
			return nil, err
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE purchase_orders
		SET state = 'completed', completed_at = now(), completed_by = $2::uuid,
		    actual_amount = (SELECT coalesce(sum(actual_subtotal), 0) FROM purchase_order_lines WHERE order_id = $1)
		WHERE id = $1`, id, userID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.store.Get(ctx, id)
}

// ---- cancel ----------------------------------------------------------------

// Cancel ends a wrongly made (or really cancelled) order. It stays in the list
// with its reason; its number is not reused.
func (s *Service) Cancel(ctx context.Context, userID string, id int64, in CancelInput) (*Order, error) {
	reason := strings.TrimSpace(in.Reason)
	if utf8.RuneCountInString(reason) < minCancelReasonLength {
		return nil, &RuleError{Code: "cancel_reason_required", Field: "reason", Message: "A cancellation reason is required"}
	}
	if utf8.RuneCountInString(reason) > maxRemarkLength {
		return nil, field("reason", "is too long")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	state, err := lockOrder(ctx, tx, id, "UPDATE")
	if err != nil {
		return nil, err
	}
	if state != StateSubmitted {
		return nil, conflict("order_not_submitted", "Only submitted orders can be cancelled")
	}
	if _, err := tx.Exec(ctx, `
		UPDATE purchase_orders
		SET state = 'cancelled', cancel_reason = $2, cancelled_at = now(), cancelled_by = $3::uuid
		WHERE id = $1`, id, reason, userID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.store.Get(ctx, id)
}

// ---- Delivery Order documents ----------------------------------------------

// displayName is the file name shown in the UI: the base name of what the
// browser sent, without control characters.
func displayName(original string) string {
	name := path.Base(strings.ReplaceAll(original, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == "/" {
		return "file"
	}
	if utf8.RuneCountInString(name) > 255 {
		name = string([]rune(name)[:255])
	}
	return name
}

// AddDocument stores a Delivery Order file (PDF, PNG or JPG, at most 5 MB) for
// a submitted order. The type comes from the file's bytes.
func (s *Service) AddDocument(ctx context.Context, userID string, orderID int64, originalName string, r io.Reader) (*Document, error) {
	// Fail early, before reading the upload, if the order is missing or locked.
	var state string
	err := s.pool.QueryRow(ctx, `SELECT state FROM purchase_orders WHERE id = $1`, orderID).Scan(&state)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if state != StateSubmitted {
		return nil, conflict("order_not_submitted", "Documents can only be added while the order is submitted")
	}

	now := s.now()
	rel, info, err := s.files.Save(
		fmt.Sprintf("documents/%d", orderID),
		func(i files.Saved) string { return files.SafeName(originalName, i.Ext, now) },
		r, files.DocumentTypes, files.MaxDocumentBytes)
	if err != nil {
		return nil, err
	}
	removeFile := func() { _ = s.files.Remove(rel) }

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		removeFile()
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// FOR SHARE: a concurrent Complete (FOR UPDATE) waits for us or we wait for it.
	state, err = lockOrder(ctx, tx, orderID, "SHARE")
	if err != nil {
		removeFile()
		return nil, err
	}
	if state != StateSubmitted {
		removeFile()
		return nil, conflict("order_not_submitted", "Documents can only be added while the order is submitted")
	}
	var docID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO purchase_order_documents (order_id, doc_type, file_path, file_name, mime_type, size_bytes, uploaded_by)
		VALUES ($1, 'delivery_order', $2, $3, $4, $5, $6::uuid) RETURNING id`,
		orderID, rel, displayName(originalName), info.Mime, info.Size, userID).Scan(&docID)
	if err != nil {
		removeFile()
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		removeFile()
		return nil, err
	}

	docs, err := list[Document](ctx, s.pool, documentSelect+` WHERE d.id = $1`, docID)
	if err != nil || len(docs) == 0 {
		return nil, errors.Join(err, ErrNotFound)
	}
	return &docs[0], nil
}

// DeleteDocument removes a Delivery Order file while the order is submitted.
func (s *Service) DeleteDocument(ctx context.Context, orderID, docID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	state, err := lockOrder(ctx, tx, orderID, "UPDATE")
	if err != nil {
		return err
	}
	if state != StateSubmitted {
		return conflict("order_not_submitted", "Documents can only be deleted while the order is submitted")
	}
	var filePath string
	err = tx.QueryRow(ctx,
		`DELETE FROM purchase_order_documents WHERE id = $1 AND order_id = $2 RETURNING file_path`, docID, orderID).Scan(&filePath)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	_ = s.files.Remove(filePath) // best effort: a leftover file is harmless
	return nil
}

// ---- remarks ---------------------------------------------------------------

// AddRemark adds a coloured note to an order in any state.
func (s *Service) AddRemark(ctx context.Context, userID string, orderID int64, in RemarkInput) (*Remark, error) {
	text := strings.TrimSpace(in.Remark)
	if text == "" {
		return nil, &RuleError{Code: "remark_required", Field: "remark", Message: "remark is required"}
	}
	if utf8.RuneCountInString(text) > maxRemarkLength {
		return nil, field("remark", "is too long")
	}
	color := in.Color
	if color == "" {
		color = "merah"
	}
	if color != "merah" && color != "biru" {
		return nil, field("color", "must be merah or biru")
	}
	date := s.now().In(wita).Format("2006-01-02")
	if in.RemarkDate != nil && strings.TrimSpace(*in.RemarkDate) != "" {
		if _, err := time.Parse("2006-01-02", *in.RemarkDate); err != nil {
			return nil, field("remark_date", "must be a date like 2026-11-09")
		}
		date = *in.RemarkDate
	}

	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM purchase_orders WHERE id = $1)`, orderID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrNotFound
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO purchase_order_remarks (order_id, remark_date, color, remark, created_by)
		VALUES ($1, $2::date, $3, $4, $5::uuid) RETURNING id`, orderID, date, color, text, userID).Scan(&id)
	if err != nil {
		return nil, err
	}
	remarks, err := list[Remark](ctx, s.pool, remarkSelect+` WHERE id = $1`, id)
	if err != nil || len(remarks) == 0 {
		return nil, errors.Join(err, ErrNotFound)
	}
	return &remarks[0], nil
}

// DeleteRemark removes a remark that belongs to the order.
func (s *Service) DeleteRemark(ctx context.Context, orderID, remarkID int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM purchase_order_remarks WHERE id = $1 AND order_id = $2`, remarkID, orderID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
