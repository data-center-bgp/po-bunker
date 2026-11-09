package orders

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/data-center-bgp/po-bunker/backend/internal/files"
	"github.com/data-center-bgp/po-bunker/backend/internal/testdb"
)

var (
	pdfDoc = append([]byte("%PDF-1.7\n"), bytes.Repeat([]byte("x"), 300)...)
	pngDoc = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{3}, 300)...)
)

type fx struct {
	t        *testing.T
	pool     *pgxpool.Pool
	svc      *Service
	store    *Store
	files    *files.Store
	dir      string
	clock    time.Time
	userID   string
	userID2  string
	asg, bgp int64 // companies with a General Code
	noCode   int64 // a company without one
	partner  int64
	vessel1  int64
	vessel2  int64
	fuel     int64 // product ids
	water    int64
	liter    int64
	ton      int64
	catFuel  int64
}

func newFx(t *testing.T) *fx {
	t.Helper()
	pool := testdb.New(t)
	dir := t.TempDir()
	fileStore, err := files.New(dir, strings.Repeat("s", 32))
	if err != nil {
		t.Fatal(err)
	}
	f := &fx{t: t, pool: pool, files: fileStore, dir: dir, clock: time.Date(2026, 11, 2, 9, 0, 0, 0, wita)}
	f.store = NewStore(pool)
	f.svc = NewService(pool, f.store, fileStore)
	f.svc.now = func() time.Time { return f.clock }

	one := func(sql string, args ...any) int64 {
		t.Helper()
		var id int64
		if err := pool.QueryRow(context.Background(), sql, args...).Scan(&id); err != nil {
			t.Fatalf("seed %q: %v", sql, err)
		}
		return id
	}
	one2 := func(sql string) string {
		t.Helper()
		var id string
		if err := pool.QueryRow(context.Background(), sql).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	f.userID = one2(`INSERT INTO users (name, email, password_hash, role) VALUES ('Ada Admin', 'ada@example.com', 'x', 'admin') RETURNING id::text`)
	f.userID2 = one2(`INSERT INTO users (name, email, password_hash, role) VALUES ('Sam Staff', 'sam@example.com', 'x', 'staff') RETURNING id::text`)
	f.asg = one(`INSERT INTO companies (name, code_company_general) VALUES ('PT Armada', 'ASG') RETURNING id`)
	f.bgp = one(`INSERT INTO companies (name, code_company_general) VALUES ('PT Barokah', 'BGP') RETURNING id`)
	f.noCode = one(`INSERT INTO companies (name) VALUES ('PT Tanpa Kode') RETURNING id`)
	f.partner = one(`INSERT INTO partners (name, is_supplier, street, city, phone) VALUES ('Vendor', true, 'Jl. A', 'Balikpapan', '0542') RETURNING id`)
	f.vessel1 = one(`INSERT INTO vessels (name, code) VALUES ('TB BB 99', 'BB99') RETURNING id`)
	f.vessel2 = one(`INSERT INTO vessels (name) VALUES ('MT RATU RUWAIDAH') RETURNING id`)
	f.catFuel = one(`INSERT INTO product_categories (name) VALUES ('Bunker Fuel') RETURNING id`)
	catWater := one(`INSERT INTO product_categories (name) VALUES ('Fresh Water') RETURNING id`)
	f.liter = one(`INSERT INTO uoms (name) VALUES ('Liter') RETURNING id`)
	f.ton = one(`INSERT INTO uoms (name) VALUES ('Ton') RETURNING id`)
	f.fuel = one(`INSERT INTO products (name, category_id, uom_id) VALUES ('HSD', $1, $2) RETURNING id`, f.catFuel, f.liter)
	f.water = one(`INSERT INTO products (name, category_id, uom_id) VALUES ('Air Tawar', $1, $2) RETURNING id`, catWater, f.ton)
	return f
}

func ptr[T any](v T) *T { return &v }

func (f *fx) fuelOrder(company int64, qty, price string) CreateInput {
	return CreateInput{
		CompanyID: company, PartnerID: f.partner, OrderType: TypeBunkerFuel, DateOrder: ptr(f.clock),
		Lines: []LineInput{{
			ProductID: f.fuel, VesselID: f.vessel1, UomID: f.liter,
			ProductQty: ptr(d(qty)), PriceUnit: ptr(d(price)), Project: " ZZ ",
		}},
	}
}

func (f *fx) mustCreate(in CreateInput) *Order {
	f.t.Helper()
	o, err := f.svc.Create(context.Background(), f.userID, in)
	if err != nil {
		f.t.Fatalf("create: %v", err)
	}
	return o
}

func (f *fx) addDO(orderID int64) *Document {
	f.t.Helper()
	doc, err := f.svc.AddDocument(context.Background(), f.userID, orderID, "DO 0001.pdf", bytes.NewReader(pdfDoc))
	if err != nil {
		f.t.Fatalf("add DO: %v", err)
	}
	return doc
}

func ruleCode(err error) string {
	var re *RuleError
	if errors.As(err, &re) {
		return re.Code
	}
	return ""
}

func wantRule(t *testing.T, err error, code string) {
	t.Helper()
	if ruleCode(err) != code {
		t.Fatalf("want rule %q, got %v", code, err)
	}
}

func TestCreateNumbersAndTotalsLikeTheOldSystem(t *testing.T) {
	f := newFx(t)

	a := f.mustCreate(f.fuelOrder(f.asg, "5000", "14500"))
	if a.Name != "001 AC/ASG-OPS/BBM/XI-2026" || a.State != StateSubmitted {
		t.Fatalf("first order: %q %s", a.Name, a.State)
	}
	if !a.AmountUntaxed.Equal(d("72500000")) || !a.AmountTax.Equal(d("0")) || !a.AmountTotal.Equal(d("72500000")) {
		t.Errorf("no VAT yet: %s %s %s", a.AmountUntaxed, a.AmountTax, a.AmountTotal)
	}

	in := f.fuelOrder(f.bgp, "8000", "14500")
	in.AmountDiscount = ptr(d("500000"))
	in.TaxPercent = ptr(d("11"))
	b := f.mustCreate(in)
	// The counter is per type and month across companies: the second fuel PO is 002 even for another company.
	if b.Name != "002 AC/BGP-OPS/BBM/XI-2026" {
		t.Errorf("second fuel order: %q", b.Name)
	}
	if !b.AmountUntaxed.Equal(d("115500000")) || !b.AmountTax.Equal(d("12705000")) || !b.AmountTotal.Equal(d("128205000")) {
		t.Errorf("totals: %s %s %s", b.AmountUntaxed, b.AmountTax, b.AmountTotal)
	}

	water := f.mustCreate(CreateInput{
		CompanyID: f.asg, PartnerID: f.partner, OrderType: TypeBunkerWater, DateOrder: ptr(f.clock),
		Lines: []LineInput{{ProductID: f.water, VesselID: f.vessel2, UomID: f.ton, ProductQty: ptr(d("50")), PriceUnit: ptr(d("85000"))}},
	})
	if water.Name != "001 AC/ASG-OPS/AIR/XI-2026" || !water.AmountTotal.Equal(d("4250000")) {
		t.Errorf("water: %q %s", water.Name, water.AmountTotal)
	}

	logistic := f.mustCreate(CreateInput{
		CompanyID: f.noCode, PartnerID: f.partner, OrderType: TypeLogistic, DateOrder: ptr(f.clock),
		Lines: []LineInput{{ProductID: f.fuel, VesselID: f.vessel1, UomID: f.liter, ProductQty: ptr(d("1")), PriceUnit: ptr(d("10"))}},
	})
	if logistic.Name != "PO/2026/0001" {
		t.Errorf("logistic (no General Code needed): %q", logistic.Name)
	}
}

func TestCreateStoresTheOrderAndEmbedsItsRelations(t *testing.T) {
	f := newFx(t)
	in := f.fuelOrder(f.asg, "1000", "10")
	in.Notes = "<p>note</p>"
	in.PartnerRef = ptr("  QUO-1  ")
	in.OptionOrder = "invoice"
	in.DateBunker = ptr(f.clock.Add(72 * time.Hour))
	in.Lines[0].Priority = ptr("high")
	in.Lines[0].RequestedBy = &f.userID2
	o := f.mustCreate(in)

	if o.Creator == nil || o.Creator.Name != "Ada Admin" || o.CreatedBy == nil || *o.CreatedBy != f.userID {
		t.Errorf("creator: %+v %v", o.Creator, o.CreatedBy)
	}
	if o.Company.Name != "PT Armada" || o.Partner.Name != "Vendor" || *o.Partner.City != "Balikpapan" {
		t.Errorf("company/partner: %+v %+v", o.Company, o.Partner)
	}
	if o.PartnerRefText == nil || *o.PartnerRefText != "QUO-1" || o.OptionOrder != "invoice" || o.Notes != "<p>note</p>" || o.DateBunker == nil {
		t.Errorf("header fields: %+v", o.Header)
	}
	if len(o.Lines) != 1 {
		t.Fatalf("lines: %d", len(o.Lines))
	}
	l := o.Lines[0]
	if l.Project != "ZZ" || l.Product.Name != "HSD" || l.Vessel.Name != "TB BB 99" || *l.Vessel.Code != "BB99" || l.Uom.Name != "Liter" ||
		l.Requester == nil || l.Requester.Name != "Sam Staff" || *l.Priority != "high" || l.StatusList != "onprogress" || l.Region != nil {
		t.Errorf("line: %+v", l)
	}
	if !l.PriceSubtotal.Equal(d("10000")) || l.ActualQty.Valid {
		t.Errorf("subtotal/actual: %s %v", l.PriceSubtotal, l.ActualQty)
	}
	if o.Documents == nil || o.Remarks == nil {
		t.Error("documents and remarks must be [] not null")
	}
}

func TestLineRoundingFollowsPostgres(t *testing.T) {
	f := newFx(t)
	// 3 x 33.335 = 100.005 -> 100.01 (half away from zero); VAT 10% of 100.01 = 10.001 -> 10.00
	in := f.fuelOrder(f.asg, "3", "33.335")
	in.TaxPercent = ptr(d("10"))
	o := f.mustCreate(in)
	if !o.Lines[0].PriceSubtotal.Equal(d("100.01")) || !o.AmountUntaxed.Equal(d("100.01")) || !o.AmountTax.Equal(d("10")) || !o.AmountTotal.Equal(d("110.01")) {
		t.Errorf("rounding: line %s untaxed %s tax %s total %s", o.Lines[0].PriceSubtotal, o.AmountUntaxed, o.AmountTax, o.AmountTotal)
	}
}

func TestCreateRefusals(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	mut := func(fn func(*CreateInput)) CreateInput {
		in := f.fuelOrder(f.asg, "10", "10")
		fn(&in)
		return in
	}
	for name, tc := range map[string]struct {
		in   CreateInput
		code string
	}{
		"no company":        {mut(func(i *CreateInput) { i.CompanyID = 0 }), "validation_failed"},
		"no partner":        {mut(func(i *CreateInput) { i.PartnerID = 0 }), "validation_failed"},
		"bad type":          {mut(func(i *CreateInput) { i.OrderType = "steel" }), "validation_failed"},
		"no date":           {mut(func(i *CreateInput) { i.DateOrder = nil }), "validation_failed"},
		"bad option":        {mut(func(i *CreateInput) { i.OptionOrder = "receipt" }), "validation_failed"},
		"VAT over 100":      {mut(func(i *CreateInput) { i.TaxPercent = ptr(d("100.5")) }), "validation_failed"},
		"negative discount": {mut(func(i *CreateInput) { i.AmountDiscount = ptr(d("-1")) }), "validation_failed"},
		"no lines":          {mut(func(i *CreateInput) { i.Lines = nil }), "lines_required"},
		"zero quantity":     {mut(func(i *CreateInput) { i.Lines[0].ProductQty = ptr(d("0")) }), "validation_failed"},
		"missing quantity":  {mut(func(i *CreateInput) { i.Lines[0].ProductQty = nil }), "validation_failed"},
		"negative price":    {mut(func(i *CreateInput) { i.Lines[0].PriceUnit = ptr(d("-1")) }), "validation_failed"},
		"missing price":     {mut(func(i *CreateInput) { i.Lines[0].PriceUnit = nil }), "validation_failed"},
		"bad priority":      {mut(func(i *CreateInput) { i.Lines[0].Priority = ptr("urgent") }), "validation_failed"},
		"bad requester id":  {mut(func(i *CreateInput) { i.Lines[0].RequestedBy = ptr("not-a-uuid") }), "validation_failed"},
		"no product":        {mut(func(i *CreateInput) { i.Lines[0].ProductID = 0 }), "validation_failed"},
		"huge quantity":     {mut(func(i *CreateInput) { i.Lines[0].ProductQty = ptr(d("1e13")) }), "validation_failed"},
		"unknown company":   {mut(func(i *CreateInput) { i.CompanyID = 9999 }), "invalid_reference"},
		"company w/o code":  {mut(func(i *CreateInput) { i.CompanyID = f.noCode }), "company_code_missing"},
		"discount > lines":  {mut(func(i *CreateInput) { i.AmountDiscount = ptr(d("101")) }), "discount_exceeds_total"},
	} {
		_, err := f.svc.Create(ctx, f.userID, tc.in)
		if ruleCode(err) != tc.code {
			t.Errorf("%s: got %v, want %s", name, err, tc.code)
		}
	}

	// Database-level reference errors surface as Postgres foreign key violations.
	in := f.fuelOrder(f.asg, "10", "10")
	in.Lines[0].ProductID = 9999
	_, err := f.svc.Create(ctx, f.userID, in)
	var pg *pgconn.PgError
	if !errors.As(err, &pg) || pg.Code != "23503" {
		t.Errorf("unknown product: %v", err)
	}

	// None of the refusals may leave an order behind or burn a number.
	var orders int
	_ = f.pool.QueryRow(ctx, `SELECT count(*) FROM purchase_orders`).Scan(&orders)
	var seq *int
	_ = f.pool.QueryRow(ctx, `SELECT max(last_seq) FROM po_number_counters`).Scan(&seq)
	if orders != 0 || (seq != nil && *seq != 0) {
		t.Errorf("refused orders left %d orders and counter %v behind", orders, seq)
	}
	if o := f.mustCreate(f.fuelOrder(f.asg, "10", "10")); o.Name != "001 AC/ASG-OPS/BBM/XI-2026" {
		t.Errorf("after the refusals the first real order must still be 001, got %q", o.Name)
	}
}

func TestMonthRolloverAndMakassarBoundary(t *testing.T) {
	f := newFx(t)
	f.mustCreate(f.fuelOrder(f.asg, "1", "1")) // 001 in November

	// 23:30 UTC on 30 Nov is 07:30 on 1 Dec in Makassar: December counter, XII.
	f.clock = time.Date(2026, 11, 30, 23, 30, 0, 0, time.UTC)
	o := f.mustCreate(f.fuelOrder(f.asg, "1", "1"))
	if o.Name != "001 AC/ASG-OPS/BBM/XII-2026" {
		t.Errorf("December: %q", o.Name)
	}

	// 15:59 UTC on 31 Dec is still December in Makassar; 16:01 UTC is the new year.
	f.clock = time.Date(2026, 12, 31, 15, 59, 0, 0, time.UTC)
	if o := f.mustCreate(f.fuelOrder(f.asg, "1", "1")); o.Name != "002 AC/ASG-OPS/BBM/XII-2026" {
		t.Errorf("last minute of the year: %q", o.Name)
	}
	f.clock = time.Date(2026, 12, 31, 16, 1, 0, 0, time.UTC)
	if o := f.mustCreate(f.fuelOrder(f.asg, "1", "1")); o.Name != "001 AC/ASG-OPS/BBM/I-2027" {
		t.Errorf("new year: %q", o.Name)
	}
}

func TestConcurrentCreatesGetUniqueConsecutiveNumbers(t *testing.T) {
	f := newFx(t)
	const n = 20
	names := make([]string, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			o, err := f.svc.Create(context.Background(), f.userID, f.fuelOrder(f.asg, "1", "1"))
			if err != nil {
				errs[i] = err
				return
			}
			names[i] = o.Name
		}()
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}
	sort.Strings(names)
	for i, name := range names {
		if want := fmt.Sprintf("%03d AC/ASG-OPS/BBM/XI-2026", i+1); name != want {
			t.Fatalf("number %d is %q, want %q (all: %v)", i, name, want, names)
		}
	}
}

func TestCompleteLifecycle(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	in := f.fuelOrder(f.asg, "1000", "14500")
	in.Lines = append(in.Lines, LineInput{ProductID: f.fuel, VesselID: f.vessel2, UomID: f.liter, ProductQty: ptr(d("500")), PriceUnit: ptr(d("14500"))})
	o := f.mustCreate(in)
	l1, l2 := o.Lines[0].ID, o.Lines[1].ID
	actual := func(a, b string) CompleteInput {
		return CompleteInput{Lines: []ActualQty{{LineID: l1, ActualQty: ptr(d(a))}, {LineID: l2, ActualQty: ptr(d(b))}}}
	}

	_, err := f.svc.Complete(ctx, f.userID, o.ID, actual("900", "500"))
	wantRule(t, err, "do_required")

	f.addDO(o.ID)

	for name, ci := range map[string]CompleteInput{
		"no lines given":   {},
		"missing a line":   {Lines: []ActualQty{{LineID: l1, ActualQty: ptr(d("1"))}}},
		"unknown line":     {Lines: []ActualQty{{LineID: l1, ActualQty: ptr(d("1"))}, {LineID: 99999, ActualQty: ptr(d("1"))}}},
		"duplicate line":   {Lines: []ActualQty{{LineID: l1, ActualQty: ptr(d("1"))}, {LineID: l1, ActualQty: ptr(d("1"))}}},
		"extra line":       {Lines: []ActualQty{{LineID: l1, ActualQty: ptr(d("1"))}, {LineID: l2, ActualQty: ptr(d("1"))}, {LineID: 99999, ActualQty: ptr(d("1"))}}},
		"missing quantity": {Lines: []ActualQty{{LineID: l1, ActualQty: ptr(d("1"))}, {LineID: l2}}},
	} {
		if _, err := f.svc.Complete(ctx, f.userID, o.ID, ci); ruleCode(err) != "actual_qty_required" {
			t.Errorf("%s: %v", name, err)
		}
	}
	if _, err := f.svc.Complete(ctx, f.userID, o.ID, actual("-1", "500")); ruleCode(err) != "actual_qty_invalid" {
		t.Errorf("negative quantity: %v", err)
	}
	if got, _ := f.store.Get(ctx, o.ID); got.State != StateSubmitted || got.Lines[0].ActualQty.Valid {
		t.Error("a refused completion must change nothing")
	}

	done, err := f.svc.Complete(ctx, f.userID2, o.ID, actual("900", "0"))
	if err != nil {
		t.Fatal(err)
	}
	if done.State != StateCompleted || done.CompletedAt == nil || done.Completer == nil || done.Completer.Name != "Sam Staff" {
		t.Fatalf("completed: %+v", done.Header)
	}
	// 900 x 14500 = 13,050,000 and a zero delivery is allowed; ordered totals stay as ordered.
	if !done.ActualAmount.Valid || !done.ActualAmount.Decimal.Equal(d("13050000")) {
		t.Errorf("actual amount: %v", done.ActualAmount)
	}
	if !done.AmountTotal.Equal(d("21750000")) {
		t.Errorf("ordered total must not change: %s", done.AmountTotal)
	}
	if !done.Lines[0].ActualQty.Decimal.Equal(d("900")) || !done.Lines[1].ActualSubtotal.Decimal.IsZero() {
		t.Errorf("line actuals: %+v %+v", done.Lines[0].ActualQty, done.Lines[1].ActualSubtotal)
	}

	// final: no second completion, no cancel, no document changes
	if _, err := f.svc.Complete(ctx, f.userID, o.ID, actual("1", "1")); ruleCode(err) != "order_not_submitted" {
		t.Errorf("complete twice: %v", err)
	}
	if _, err := f.svc.Cancel(ctx, f.userID, o.ID, CancelInput{Reason: "too late"}); ruleCode(err) != "order_not_submitted" {
		t.Errorf("cancel a completed order: %v", err)
	}
	if _, err := f.svc.AddDocument(ctx, f.userID, o.ID, "x.pdf", bytes.NewReader(pdfDoc)); ruleCode(err) != "order_not_submitted" {
		t.Errorf("add document after completion: %v", err)
	}
	if err := f.svc.DeleteDocument(ctx, o.ID, done.Documents[0].ID); ruleCode(err) != "order_not_submitted" {
		t.Errorf("delete document after completion: %v", err)
	}
	if _, err := f.svc.Complete(ctx, f.userID, 99999, actual("1", "1")); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown order: %v", err)
	}
}

func TestCancelLifecycle(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	o := f.mustCreate(f.fuelOrder(f.asg, "10", "10"))

	for _, reason := range []string{"", "  ", "ab", " a "} {
		if _, err := f.svc.Cancel(ctx, f.userID, o.ID, CancelInput{Reason: reason}); ruleCode(err) != "cancel_reason_required" {
			t.Errorf("reason %q: %v", reason, err)
		}
	}
	got, err := f.svc.Cancel(ctx, f.userID2, o.ID, CancelInput{Reason: "  Wrong vessel selected  "})
	if err != nil {
		t.Fatal(err)
	}
	if got.State != StateCancelled || *got.CancelReason != "Wrong vessel selected" || got.CancelledAt == nil || got.Canceller == nil || got.Canceller.Name != "Sam Staff" {
		t.Errorf("cancelled: %+v", got.Header)
	}

	if _, err := f.svc.Cancel(ctx, f.userID, o.ID, CancelInput{Reason: "again"}); ruleCode(err) != "order_not_submitted" {
		t.Errorf("cancel twice: %v", err)
	}
	if _, err := f.svc.Complete(ctx, f.userID, o.ID, CompleteInput{Lines: []ActualQty{{LineID: o.Lines[0].ID, ActualQty: ptr(d("1"))}}}); ruleCode(err) != "order_not_submitted" {
		t.Errorf("complete a cancelled order: %v", err)
	}
	if _, err := f.svc.AddDocument(ctx, f.userID, o.ID, "x.pdf", bytes.NewReader(pdfDoc)); ruleCode(err) != "order_not_submitted" {
		t.Errorf("document on a cancelled order: %v", err)
	}
	// a cancelled order's number is not reused
	if next := f.mustCreate(f.fuelOrder(f.asg, "10", "10")); next.Name != "002 AC/ASG-OPS/BBM/XI-2026" {
		t.Errorf("next number: %q", next.Name)
	}
	if _, err := f.svc.Cancel(ctx, f.userID, 99999, CancelInput{Reason: "no such order"}); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown order: %v", err)
	}
}

func TestDocuments(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	o := f.mustCreate(f.fuelOrder(f.asg, "10", "10"))

	doc, err := f.svc.AddDocument(ctx, f.userID, o.ID, "DO ZZ TEST 0002.pdf", bytes.NewReader(pdfDoc))
	if err != nil {
		t.Fatal(err)
	}
	if doc.DocType != DocTypeDeliveryOrder || doc.MimeType != "application/pdf" || doc.SizeBytes != int64(len(pdfDoc)) || doc.FileName != "DO ZZ TEST 0002.pdf" ||
		doc.Uploader == nil || doc.Uploader.Name != "Ada Admin" {
		t.Errorf("document: %+v", doc)
	}
	if !strings.HasPrefix(doc.FilePath, fmt.Sprintf("documents/%d/", o.ID)) || !strings.HasSuffix(doc.FilePath, "-DO_ZZ_TEST_0002.pdf") {
		t.Errorf("stored path %q", doc.FilePath)
	}
	if !f.files.Exists(doc.FilePath) {
		t.Fatal("file is not on disk")
	}

	// a PNG with a PDF name is stored as what it really is
	png, err := f.svc.AddDocument(ctx, f.userID, o.ID, "scan.pdf", bytes.NewReader(pngDoc))
	if err != nil || png.MimeType != "image/png" || !strings.HasSuffix(png.FilePath, ".png") {
		t.Errorf("png: %+v %v", png, err)
	}

	// hostile names never reach the path
	evil, err := f.svc.AddDocument(ctx, f.userID, o.ID, `..\..\etc\passwd.pdf`, bytes.NewReader(pdfDoc))
	if err != nil {
		t.Fatal(err)
	}
	if evil.FileName != "passwd.pdf" || !files.ValidPath(evil.FilePath) {
		t.Errorf("hostile name: %q %q", evil.FileName, evil.FilePath)
	}

	for name, body := range map[string][]byte{
		"text":  []byte("not a document, just some text content here"),
		"html":  []byte("<html><script>alert(1)</script></html>"),
		"empty": nil,
	} {
		if _, err := f.svc.AddDocument(ctx, f.userID, o.ID, "x.pdf", bytes.NewReader(body)); !errors.Is(err, files.ErrUnsupportedType) {
			t.Errorf("%s: %v", name, err)
		}
	}
	if _, err := f.svc.AddDocument(ctx, f.userID, o.ID, "big.pdf", bytes.NewReader(append(pdfDoc, make([]byte, files.MaxDocumentBytes)...))); !errors.Is(err, files.ErrTooLarge) {
		t.Errorf("too large: %v", err)
	}
	if _, err := f.svc.AddDocument(ctx, f.userID, 99999, "x.pdf", bytes.NewReader(pdfDoc)); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown order: %v", err)
	}

	// the refusals left no stray files or rows
	entries, _ := os.ReadDir(filepath.Join(f.dir, "documents", fmt.Sprint(o.ID)))
	if len(entries) != 3 {
		t.Errorf("expected 3 files on disk, found %d", len(entries))
	}
	got, _ := f.store.Get(ctx, o.ID)
	if len(got.Documents) != 3 {
		t.Errorf("expected 3 document rows, found %d", len(got.Documents))
	}

	// delete removes the row and the file; another order's document id is not reachable
	other := f.mustCreate(f.fuelOrder(f.asg, "10", "10"))
	if err := f.svc.DeleteDocument(ctx, other.ID, doc.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("document of another order: %v", err)
	}
	if err := f.svc.DeleteDocument(ctx, o.ID, doc.ID); err != nil {
		t.Fatal(err)
	}
	if f.files.Exists(doc.FilePath) {
		t.Error("the file should be deleted with its row")
	}
	if err := f.svc.DeleteDocument(ctx, o.ID, doc.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete twice: %v", err)
	}
}

func TestRemarks(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	o := f.mustCreate(f.fuelOrder(f.asg, "10", "10"))

	r, err := f.svc.AddRemark(ctx, f.userID, o.ID, RemarkInput{Remark: "  Vendor confirmed  "})
	if err != nil {
		t.Fatal(err)
	}
	if r.Color != "merah" || r.Remark != "Vendor confirmed" || r.RemarkDate != "2026-11-02" {
		t.Errorf("defaults: %+v", r) // the date is "today" in Makassar
	}
	r2, err := f.svc.AddRemark(ctx, f.userID, o.ID, RemarkInput{Remark: "blue one", Color: "biru", RemarkDate: ptr("2026-10-30")})
	if err != nil || r2.Color != "biru" || r2.RemarkDate != "2026-10-30" {
		t.Errorf("explicit: %+v %v", r2, err)
	}

	for name, in := range map[string]RemarkInput{
		"blank":      {Remark: "   "},
		"bad colour": {Remark: "x", Color: "hijau"},
		"bad date":   {Remark: "x", RemarkDate: ptr("02/11/2026")},
		"impossible": {Remark: "x", RemarkDate: ptr("2026-13-45")},
		"too long":   {Remark: strings.Repeat("x", 2001)},
	} {
		if _, err := f.svc.AddRemark(ctx, f.userID, o.ID, in); ruleCode(err) == "" {
			t.Errorf("%s was accepted", name)
		}
	}
	if _, err := f.svc.AddRemark(ctx, f.userID, 99999, RemarkInput{Remark: "x"}); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown order: %v", err)
	}

	// remarks are allowed in every state
	if _, err := f.svc.Cancel(ctx, f.userID, o.ID, CancelInput{Reason: "cancelled"}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.AddRemark(ctx, f.userID, o.ID, RemarkInput{Remark: "after cancel"}); err != nil {
		t.Errorf("remark on a cancelled order: %v", err)
	}

	other := f.mustCreate(f.fuelOrder(f.asg, "10", "10"))
	if err := f.svc.DeleteRemark(ctx, other.ID, r.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("remark of another order: %v", err)
	}
	if err := f.svc.DeleteRemark(ctx, o.ID, r.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.DeleteRemark(ctx, o.ID, r.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete twice: %v", err)
	}
	got, _ := f.store.Get(ctx, o.ID)
	if len(got.Remarks) != 2 {
		t.Errorf("remarks left: %d", len(got.Remarks))
	}
}

func TestListPagesNewestFirstWithEverythingEmbedded(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	var ids []int64
	for i := 0; i < 3; i++ {
		f.clock = f.clock.Add(time.Hour)
		in := f.fuelOrder(f.asg, "10", "10")
		in.DateOrder = ptr(f.clock)
		ids = append(ids, f.mustCreate(in).ID)
	}
	f.addDO(ids[0])
	_, _ = f.svc.AddRemark(ctx, f.userID, ids[0], RemarkInput{Remark: "hello"})

	p1, err := f.store.List(ctx, 1, 2)
	if err != nil {
		t.Fatal(err)
	}
	if p1.TotalCount != 3 || len(p1.Orders) != 2 || p1.Orders[0].ID != ids[2] || p1.Orders[1].ID != ids[1] {
		t.Fatalf("page 1: total %d, %d orders", p1.TotalCount, len(p1.Orders))
	}
	p2, _ := f.store.List(ctx, 2, 2)
	if len(p2.Orders) != 1 || p2.Orders[0].ID != ids[0] {
		t.Fatalf("page 2: %d orders", len(p2.Orders))
	}
	oldest := p2.Orders[0]
	if len(oldest.Documents) != 1 || len(oldest.Remarks) != 1 || len(oldest.Lines) != 1 || oldest.Lines[0].Product.Name != "HSD" {
		t.Errorf("embedded rows: %d docs, %d remarks, %d lines", len(oldest.Documents), len(oldest.Remarks), len(oldest.Lines))
	}
	if len(p1.Orders[0].Documents) != 0 || p1.Orders[0].Documents == nil {
		t.Error("an order without documents must have an empty array")
	}

	for _, tc := range []struct{ page, limit, want int }{{0, 0, 3}, {-5, 500, 3}, {9, 10, 0}} {
		p, err := f.store.List(ctx, tc.page, tc.limit)
		if err != nil || len(p.Orders) != tc.want {
			t.Errorf("page %d limit %d: %d orders (%v)", tc.page, tc.limit, len(p.Orders), err)
		}
	}
	if _, err := f.store.Get(ctx, 99999); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown order: %v", err)
	}
}

func TestJSONShapeMatchesTheFrontendTypes(t *testing.T) {
	f := newFx(t)
	in := f.fuelOrder(f.asg, "5000", "14500.5")
	in.TaxPercent = ptr(d("11"))
	o := f.mustCreate(in)
	raw, err := json.Marshal(o)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	_ = json.Unmarshal(raw, &m)

	// numbers, not strings
	for _, key := range []string{"amount_untaxed", "amount_tax", "amount_discount", "amount_total", "tax_percent"} {
		if _, ok := m[key].(float64); !ok {
			t.Errorf("%s should be a JSON number, got %T (%v)", key, m[key], m[key])
		}
	}
	// 5000 x 14500.5 = 72,502,500 plus 11% VAT
	if m["amount_total"].(float64) != 80477775 {
		t.Errorf("amount_total = %v", m["amount_total"])
	}
	if m["actual_amount"] != nil || m["completed_at"] != nil || m["cancel_reason"] != nil {
		t.Errorf("unset fields must be null: %v %v %v", m["actual_amount"], m["completed_at"], m["cancel_reason"])
	}
	for _, key := range []string{"id", "name", "company_id", "partner_id", "order_type", "state", "date_order", "date_approve", "notes", "option_order",
		"partner_ref", "date_vendor", "date_bunker", "created_by", "first_approved_by", "first_approved_signature_path", "third_approved_at",
		"company", "partner", "creator", "completer", "canceller", "completed_by", "cancelled_by", "cancelled_at", "documents", "remarks", "lines"} {
		if _, ok := m[key]; !ok {
			t.Errorf("missing key %q", key)
		}
	}
	line := m["lines"].([]any)[0].(map[string]any)
	for _, key := range []string{"product_qty", "price_unit", "price_subtotal"} {
		if _, ok := line[key].(float64); !ok {
			t.Errorf("line %s should be a number: %v", key, line[key])
		}
	}
	if line["actual_qty"] != nil || line["actual_subtotal"] != nil {
		t.Error("actual quantities are null until the order is completed")
	}
	if line["price_unit"].(float64) != 14500.5 {
		t.Errorf("price_unit = %v", line["price_unit"])
	}
}

func TestDashboardFeed(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	if feed, err := f.store.Dashboard(ctx); err != nil || feed == nil || len(feed) != 0 {
		t.Fatalf("empty feed: %#v %v", feed, err)
	}
	a := f.mustCreate(f.fuelOrder(f.asg, "1000", "10"))
	f.addDO(a.ID)
	_, _ = f.svc.Complete(ctx, f.userID, a.ID, CompleteInput{Lines: []ActualQty{{LineID: a.Lines[0].ID, ActualQty: ptr(d("900"))}}})
	b := f.mustCreate(f.fuelOrder(f.bgp, "10", "10"))
	_, _ = f.svc.Cancel(ctx, f.userID, b.ID, CancelInput{Reason: "cancelled"})

	feed, err := f.store.Dashboard(ctx)
	if err != nil || len(feed) != 2 {
		t.Fatalf("feed: %d %v", len(feed), err)
	}
	byState := map[string]DashboardOrder{}
	for _, o := range feed {
		byState[o.State] = o
	}
	done := byState[StateCompleted]
	if done.Partner.Name != "Vendor" || done.Company.Name != "PT Armada" || !done.ActualAmount.Decimal.Equal(d("9000")) || len(done.Lines) != 1 ||
		done.Lines[0].Vessel.Name != "TB BB 99" || done.Lines[0].Uom.Name != "Liter" || !done.Lines[0].ActualQty.Decimal.Equal(d("900")) {
		t.Errorf("completed entry: %+v", done)
	}
	if byState[StateCancelled].CancelledAt == nil {
		t.Error("cancelled_at missing")
	}
	raw, _ := json.Marshal(feed)
	if strings.Contains(string(raw), `"order_id"`) {
		t.Error("the feed's lines must not expose order_id")
	}
}

// The Go decimal arithmetic must give the same cents as the Postgres numeric
// arithmetic the old plpgsql functions used. 3000 random vectors, fixed seed.
func TestTotalsMatchPostgresArithmetic(t *testing.T) {
	pool := testdb.New(t)
	ctx := context.Background()
	rng := rand.New(rand.NewSource(20261109))

	for i := 0; i < 3000; i++ {
		cents := rng.Int63n(1_000_000_000_000_00) // up to 1e12 with two decimals
		lines := decimal.New(cents, -2)
		discount := decimal.New(rng.Int63n(cents+1), -2)
		vat := decimal.New(rng.Int63n(10001), -2) // 0.00 .. 100.00

		got, err := ComputeTotals(lines, discount, vat)
		if err != nil {
			t.Fatalf("vector %d (%s, %s, %s): %v", i, lines, discount, vat, err)
		}
		var untaxed, tax string
		err = pool.QueryRow(ctx, `
			WITH x AS (SELECT greatest($1::numeric - $2::numeric, 0) AS u)
			SELECT u::text, round(u * $3::numeric / 100, 2)::text FROM x`,
			lines.String(), discount.String(), vat.String()).Scan(&untaxed, &tax)
		if err != nil {
			t.Fatal(err)
		}
		if !got.Untaxed.Equal(d(untaxed)) || !got.Tax.Equal(d(tax)) {
			t.Fatalf("vector %d (lines %s, discount %s, vat %s): Go %s / %s, Postgres %s / %s",
				i, lines, discount, vat, got.Untaxed, got.Tax, untaxed, tax)
		}
	}
}
