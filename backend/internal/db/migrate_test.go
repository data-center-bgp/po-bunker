package db_test

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/data-center-bgp/po-bunker/backend/internal/db"
	"github.com/data-center-bgp/po-bunker/backend/internal/testdb"
)

func TestMigrationsAreIdempotent(t *testing.T) {
	pool := testdb.New(t) // already migrated once
	ctx := context.Background()
	if err := db.Migrate(ctx, pool, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatalf("second run: %v", err)
	}
}

func TestSchemaHasTheExpectedTables(t *testing.T) {
	pool := testdb.New(t)
	ctx := context.Background()
	want := []string{
		"business_units", "code_budgets", "companies", "partners", "po_number_counters",
		"product_categories", "products", "purchase_order_documents", "purchase_order_lines",
		"purchase_order_remarks", "purchase_orders", "refresh_tokens", "regions", "uoms",
		"users", "vessel_types", "vessels",
	}
	for _, table := range want {
		var n int
		err := pool.QueryRow(ctx,
			`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, table).Scan(&n)
		if err != nil || n != 1 {
			t.Errorf("table %s missing (n=%d, err=%v)", table, n, err)
		}
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'regions_view'`).Scan(&n); err != nil || n != 1 {
		t.Error("regions_view missing")
	}
}

func TestGeneratedColumnsAndChecks(t *testing.T) {
	pool := testdb.New(t)
	ctx := context.Background()
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	mustExec(`INSERT INTO companies (name, code_company_general) VALUES ('C', 'CCC')`)
	mustExec(`INSERT INTO partners (name) VALUES ('V')`)
	mustExec(`INSERT INTO product_categories (name) VALUES ('Fuel')`)
	mustExec(`INSERT INTO uoms (name) VALUES ('Liter')`)
	mustExec(`INSERT INTO products (name, category_id, uom_id) VALUES ('HSD', 1, 1)`)
	mustExec(`INSERT INTO vessels (name) VALUES ('TB One')`)
	mustExec(`INSERT INTO purchase_orders (name, company_id, partner_id, order_type, date_order) VALUES ('PO-1', 1, 1, 'bunker_fuel', now())`)
	mustExec(`INSERT INTO purchase_order_lines (order_id, product_id, vessel_id, uom_id, product_qty, price_unit) VALUES (1, 1, 1, 1, 5000, 14500.125)`)

	var subtotal string
	if err := pool.QueryRow(ctx, `SELECT price_subtotal::text FROM purchase_order_lines`).Scan(&subtotal); err != nil || subtotal != "72500625.00" {
		t.Errorf("generated subtotal = %q (%v)", subtotal, err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO purchase_order_lines (order_id, product_id, vessel_id, uom_id, product_qty, price_unit) VALUES (1, 1, 1, 1, 0, 1)`); err == nil {
		t.Error("a zero quantity must be refused")
	}
	if _, err := pool.Exec(ctx, `UPDATE purchase_orders SET state = 'draft'`); err == nil {
		t.Error("an unknown state must be refused")
	}
	if _, err := pool.Exec(ctx, `UPDATE purchase_orders SET tax_percent = 150`); err == nil {
		t.Error("a VAT above 100% must be refused")
	}
}
