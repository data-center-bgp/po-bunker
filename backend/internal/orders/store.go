package orders

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store reads orders. Writes go through Service, which owns the rules.
type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

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

// Money columns are read as text and parsed into exact decimals.
const headerSelect = `
SELECT o.id, o.name, o.company_id, o.partner_id, o.order_type, o.state, o.date_order, o.date_approve, o.notes,
       o.amount_untaxed::text AS amount_untaxed, o.amount_tax::text AS amount_tax,
       o.amount_discount::text AS amount_discount, o.amount_total::text AS amount_total,
       o.option_order, o.partner_ref, o.date_vendor, o.date_bunker, o.tax_percent::text AS tax_percent,
       o.created_by::text AS created_by,
       o.first_approved_by::text AS first_approved_by, o.first_approved_at, o.first_approved_signature_path,
       o.second_approved_by::text AS second_approved_by, o.second_approved_at, o.second_approved_signature_path,
       o.third_approved_by::text AS third_approved_by, o.third_approved_at, o.third_approved_signature_path,
       jsonb_build_object('id', c.id, 'name', c.name, 'code_company', c.code_company, 'logo_path', c.logo_path) AS company,
       jsonb_build_object('id', p.id, 'name', p.name, 'street', p.street, 'city', p.city, 'phone', p.phone) AS partner,
       CASE WHEN cr.id IS NULL THEN NULL ELSE jsonb_build_object('id', cr.id::text, 'name', cr.name) END AS creator,
       CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object('id', co.id::text, 'name', co.name) END AS completer,
       CASE WHEN ca.id IS NULL THEN NULL ELSE jsonb_build_object('id', ca.id::text, 'name', ca.name) END AS canceller,
       o.completed_at, o.completed_by::text AS completed_by, o.cancel_reason, o.cancelled_at,
       o.cancelled_by::text AS cancelled_by, o.actual_amount::text AS actual_amount
FROM purchase_orders o
JOIN companies c ON c.id = o.company_id
JOIN partners p ON p.id = o.partner_id
LEFT JOIN users cr ON cr.id = o.created_by
LEFT JOIN users co ON co.id = o.completed_by
LEFT JOIN users ca ON ca.id = o.cancelled_by`

const lineSelect = `
SELECT l.id, l.order_id, l.product_id, l.vessel_id, l.region_id, l.code_budget_id, l.category_id, l.uom_id,
       l.product_qty::text AS product_qty, l.price_unit::text AS price_unit, l.price_subtotal::text AS price_subtotal,
       l.actual_qty::text AS actual_qty, l.actual_subtotal::text AS actual_subtotal,
       l.project, l.requested_by::text AS requested_by, l.priority, l.status_list,
       jsonb_build_object('id', p.id, 'name', p.name, 'default_code', p.default_code, 'merk', p.merk,
                          'model', p.model, 'serial_number', p.serial_number, 'specs', p.specs) AS product,
       jsonb_build_object('id', v.id, 'name', v.name, 'code', v.code) AS vessel,
       CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id', r.id, 'name', r.name) END AS region,
       jsonb_build_object('id', u.id, 'name', u.name) AS uom,
       CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id', b.id, 'name', b.name) END AS code_budget,
       CASE WHEN pc.id IS NULL THEN NULL ELSE jsonb_build_object('id', pc.id, 'name', pc.name) END AS category,
       CASE WHEN rq.id IS NULL THEN NULL ELSE jsonb_build_object('id', rq.id::text, 'name', rq.name) END AS requester
FROM purchase_order_lines l
JOIN products p ON p.id = l.product_id
JOIN vessels v ON v.id = l.vessel_id
JOIN uoms u ON u.id = l.uom_id
LEFT JOIN regions r ON r.id = l.region_id
LEFT JOIN code_budgets b ON b.id = l.code_budget_id
LEFT JOIN product_categories pc ON pc.id = l.category_id
LEFT JOIN users rq ON rq.id = l.requested_by`

const documentSelect = `
SELECT d.id, d.order_id, d.doc_type, d.file_path, d.file_name, d.mime_type, d.size_bytes, d.uploaded_at,
       CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('id', u.id::text, 'name', u.name) END AS uploader
FROM purchase_order_documents d
LEFT JOIN users u ON u.id = d.uploaded_by`

const remarkSelect = `
SELECT id, order_id, to_char(remark_date, 'YYYY-MM-DD') AS remark_date, color, remark
FROM purchase_order_remarks`

// attach loads the lines, documents and remarks of the given headers (three
// queries for the whole page, not three per order).
func (s *Store) attach(ctx context.Context, headers []Header) ([]Order, error) {
	out := make([]Order, len(headers))
	if len(headers) == 0 {
		return out, nil
	}
	ids := make([]int64, len(headers))
	index := make(map[int64]int, len(headers))
	for i, h := range headers {
		ids[i] = h.ID
		index[h.ID] = i
		out[i] = Order{Header: h, Documents: []Document{}, Remarks: []Remark{}, Lines: []Line{}}
	}

	lines, err := list[Line](ctx, s.pool, lineSelect+` WHERE l.order_id = ANY($1) ORDER BY l.order_id, l.id`, ids)
	if err != nil {
		return nil, err
	}
	for _, l := range lines {
		o := &out[index[l.OrderID]]
		o.Lines = append(o.Lines, l)
	}
	docs, err := list[Document](ctx, s.pool, documentSelect+` WHERE d.order_id = ANY($1) ORDER BY d.order_id, d.id`, ids)
	if err != nil {
		return nil, err
	}
	for _, d := range docs {
		o := &out[index[d.OrderID]]
		o.Documents = append(o.Documents, d)
	}
	remarks, err := list[Remark](ctx, s.pool, remarkSelect+` WHERE order_id = ANY($1) ORDER BY order_id, id`, ids)
	if err != nil {
		return nil, err
	}
	for _, r := range remarks {
		o := &out[index[r.OrderID]]
		o.Remarks = append(o.Remarks, r)
	}
	return out, nil
}

// Get returns one order with its lines, documents and remarks.
func (s *Store) Get(ctx context.Context, id int64) (*Order, error) {
	headers, err := list[Header](ctx, s.pool, headerSelect+` WHERE o.id = $1`, id)
	if err != nil {
		return nil, err
	}
	if len(headers) == 0 {
		return nil, ErrNotFound
	}
	orders, err := s.attach(ctx, headers)
	if err != nil {
		return nil, err
	}
	return &orders[0], nil
}

// List returns one page of orders, newest first.
func (s *Store) List(ctx context.Context, page, limit int) (*Page, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM purchase_orders`).Scan(&total); err != nil {
		return nil, err
	}
	headers, err := list[Header](ctx, s.pool,
		headerSelect+` ORDER BY o.date_order DESC, o.id DESC LIMIT $1 OFFSET $2`, limit, (page-1)*limit)
	if err != nil {
		return nil, err
	}
	orders, err := s.attach(ctx, headers)
	if err != nil {
		return nil, err
	}
	return &Page{Orders: orders, TotalCount: total}, nil
}

// Dashboard returns every order with just the fields the dashboard totals
// need, newest first. Orders are few, so the browser aggregates them.
func (s *Store) Dashboard(ctx context.Context) ([]DashboardOrder, error) {
	orders, err := list[DashboardOrder](ctx, s.pool, `
		SELECT o.id, o.name, o.state, o.order_type, o.date_order, o.date_bunker, o.completed_at, o.cancelled_at,
		       o.amount_total::text AS amount_total, o.actual_amount::text AS actual_amount,
		       jsonb_build_object('id', p.id, 'name', p.name) AS partner,
		       jsonb_build_object('id', c.id, 'name', c.name) AS company
		FROM purchase_orders o
		JOIN partners p ON p.id = o.partner_id
		JOIN companies c ON c.id = o.company_id
		ORDER BY o.date_order DESC, o.id DESC`)
	if err != nil {
		return nil, err
	}
	for i := range orders {
		orders[i].Lines = []DashboardLine{}
	}
	if len(orders) == 0 {
		return orders, nil
	}
	index := make(map[int64]int, len(orders))
	for i, o := range orders {
		index[o.ID] = i
	}
	lines, err := list[DashboardLine](ctx, s.pool, `
		SELECT l.id, l.order_id, l.product_qty::text AS product_qty, l.actual_qty::text AS actual_qty,
		       l.price_subtotal::text AS price_subtotal, l.actual_subtotal::text AS actual_subtotal,
		       jsonb_build_object('id', p.id, 'name', p.name) AS product,
		       jsonb_build_object('id', v.id, 'name', v.name) AS vessel,
		       jsonb_build_object('id', u.id, 'name', u.name) AS uom
		FROM purchase_order_lines l
		JOIN products p ON p.id = l.product_id
		JOIN vessels v ON v.id = l.vessel_id
		JOIN uoms u ON u.id = l.uom_id
		ORDER BY l.order_id, l.id`)
	if err != nil {
		return nil, err
	}
	for _, l := range lines {
		if i, ok := index[l.OrderID]; ok {
			orders[i].Lines = append(orders[i].Lines, l)
		}
	}
	return orders, nil
}
