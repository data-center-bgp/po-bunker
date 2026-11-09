package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

var (
	pdfFile = append([]byte("%PDF-1.7\n"), bytes.Repeat([]byte("x"), 400)...)
)

type seed struct{ company, partner, vessel, product, uom int64 }

func seedOrderData(t *testing.T, e *env) seed {
	t.Helper()
	var s seed
	ctx := context.Background()
	one := func(dst *int64, sql string, args ...any) {
		t.Helper()
		if err := e.pool.QueryRow(ctx, sql, args...).Scan(dst); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	var cat int64
	one(&s.company, `INSERT INTO companies (name, code_company_general) VALUES ('PT Armada', 'ASG') RETURNING id`)
	one(&s.partner, `INSERT INTO partners (name, is_supplier) VALUES ('Vendor', true) RETURNING id`)
	one(&s.vessel, `INSERT INTO vessels (name) VALUES ('TB BB 99') RETURNING id`)
	one(&cat, `INSERT INTO product_categories (name) VALUES ('Bunker Fuel') RETURNING id`)
	one(&s.uom, `INSERT INTO uoms (name) VALUES ('Liter') RETURNING id`)
	one(&s.product, `INSERT INTO products (name, category_id, uom_id) VALUES ('HSD', $1, $2) RETURNING id`, cat, s.uom)
	return s
}

func (s seed) body(extra string) string {
	return fmt.Sprintf(`{"company_id":%d,"partner_id":%d,"order_type":"bunker_fuel","date_order":"2026-11-02T09:00:00+08:00",
		"tax_percent":11,"lines":[{"product_id":%d,"vessel_id":%d,"uom_id":%d,"product_qty":5000,"price_unit":14500}]%s}`,
		s.company, s.partner, s.product, s.vessel, s.uom, extra)
}

type orderResp struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	State       string  `json:"state"`
	AmountTotal float64 `json:"amount_total"`
	Lines       []struct {
		ID int64 `json:"id"`
	} `json:"lines"`
	Documents []struct {
		ID       int64  `json:"id"`
		FilePath string `json:"file_path"`
	} `json:"documents"`
}

func createOrder(t *testing.T, e *env, token string, s seed) orderResp {
	t.Helper()
	w := e.json(t, "POST", "/api/v1/orders", token, s.body(""))
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	return decode[orderResp](t, w)
}

func (e *env) uploadTo(t *testing.T, method, path, token, field, filename string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	body, ctype := multipartFile(t, field, filename, content)
	return e.call(method, path, body, map[string]string{"Authorization": "Bearer " + token, "Content-Type": ctype})
}

func TestOrderRoutesFollowTheRoleMatrix(t *testing.T) {
	e, tk := newCatalogEnv(t)
	s := seedOrderData(t, e)
	o := createOrder(t, e, tk.staff, s)
	id := fmt.Sprint(o.ID)

	reads := []string{"/orders", "/orders/" + id, "/dashboard/orders"}
	for _, p := range reads {
		if w := e.json(t, "GET", "/api/v1"+p, "", ""); w.Code != 401 {
			t.Errorf("anonymous GET %s: %d", p, w.Code)
		}
		for name, token := range map[string]string{"viewer": tk.viewer, "staff": tk.staff, "admin": tk.admin} {
			if w := e.json(t, "GET", "/api/v1"+p, token, ""); w.Code != 200 {
				t.Errorf("%s GET %s: %d", name, p, w.Code)
			}
		}
	}

	writes := []struct{ method, path, body string }{
		{"POST", "/orders", s.body("")},
		{"POST", "/orders/" + id + "/complete", `{"lines":[]}`},
		{"POST", "/orders/" + id + "/cancel", `{"reason":"because"}`},
		{"POST", "/orders/" + id + "/remarks", `{"remark":"x"}`},
		{"DELETE", "/orders/" + id + "/remarks/1", ""},
		{"DELETE", "/orders/" + id + "/documents/1", ""},
	}
	for _, wr := range writes {
		if w := e.json(t, wr.method, "/api/v1"+wr.path, "", wr.body); w.Code != 401 {
			t.Errorf("anonymous %s %s: %d", wr.method, wr.path, w.Code)
		}
		if w := e.json(t, wr.method, "/api/v1"+wr.path, tk.viewer, wr.body); w.Code != 403 {
			t.Errorf("viewer %s %s: %d", wr.method, wr.path, w.Code)
		}
	}
	if w := e.uploadTo(t, "POST", "/api/v1/orders/"+id+"/documents", tk.viewer, "file", "do.pdf", pdfFile); w.Code != 403 {
		t.Errorf("viewer upload: %d", w.Code)
	}
	if w := e.json(t, "POST", "/api/v1/orders", tk.admin, s.body("")); w.Code != 201 {
		t.Errorf("admin create: %d", w.Code)
	}
}

func TestOrderLifecycleOverHTTP(t *testing.T) {
	e, tk := newCatalogEnv(t)
	s := seedOrderData(t, e)

	w := e.json(t, "POST", "/api/v1/orders", tk.staff, s.body(`,"notes":"<p>hi</p>","partner_ref":"QUO-1","amount_discount":0`))
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	var raw map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &raw)
	// 5000 x 14500 = 72,500,000 plus 11% VAT
	// the month and year part follows the clock, the rest is fixed
	if name, _ := raw["name"].(string); !regexp.MustCompile(`^001 AC/ASG-OPS/BBM/[IVX]+-[0-9]{4}$`).MatchString(name) {
		t.Errorf("name %v", raw["name"])
	}
	if raw["amount_total"].(float64) != 80475000 || raw["state"] != "submitted" || raw["creator"].(map[string]any)["name"] != "staff@example.com" {
		t.Errorf("order: total %v state %v creator %v", raw["amount_total"], raw["state"], raw["creator"])
	}
	o := decode[orderResp](t, w)
	id := fmt.Sprint(o.ID)
	line := o.Lines[0].ID

	// the list and the single order agree
	if w := e.json(t, "GET", "/api/v1/orders/"+id, tk.viewer, ""); w.Code != 200 || decode[orderResp](t, w).ID != o.ID {
		t.Errorf("get: %d", w.Code)
	}
	var page struct {
		Orders     []orderResp `json:"orders"`
		TotalCount int         `json:"total_count"`
	}
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/orders?page=abc&limit=-3", tk.viewer, "").Body.Bytes(), &page)
	if page.TotalCount != 1 || len(page.Orders) != 1 {
		t.Errorf("list with junk paging: %+v", page)
	}

	// completing needs a DO first
	complete := fmt.Sprintf(`{"lines":[{"line_id":%d,"actual_qty":4500}]}`, line)
	if w := e.json(t, "POST", "/api/v1/orders/"+id+"/complete", tk.staff, complete); w.Code != 409 || errorCode(t, w) != "do_required" {
		t.Errorf("complete without DO: %d %s", w.Code, w.Body.String())
	}

	w = e.uploadTo(t, "POST", "/api/v1/orders/"+id+"/documents", tk.staff, "file", "DO 0001.pdf", pdfFile)
	if w.Code != 201 {
		t.Fatalf("upload DO: %d %s", w.Code, w.Body.String())
	}
	var doc struct {
		ID       int64  `json:"id"`
		FilePath string `json:"file_path"`
		MimeType string `json:"mime_type"`
		FileName string `json:"file_name"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &doc)
	if doc.MimeType != "application/pdf" || doc.FileName != "DO 0001.pdf" || !strings.HasPrefix(doc.FilePath, "documents/"+id+"/") {
		t.Errorf("document: %+v", doc)
	}

	// the DO downloads through a signed link
	lw := e.json(t, "GET", "/api/v1/file-url?path="+doc.FilePath, tk.viewer, "")
	var link struct{ URL string }
	_ = json.Unmarshal(lw.Body.Bytes(), &link)
	if dl := e.call("GET", link.URL, "", nil); dl.Code != 200 || !bytes.Equal(dl.Body.Bytes(), pdfFile) || dl.Header().Get("Content-Type") != "application/pdf" {
		t.Errorf("download: %d %s", dl.Code, dl.Header().Get("Content-Type"))
	}

	// bad completions
	for name, body := range map[string]string{
		"missing line":      `{"lines":[]}`,
		"negative quantity": fmt.Sprintf(`{"lines":[{"line_id":%d,"actual_qty":-1}]}`, line),
		"no quantity":       fmt.Sprintf(`{"lines":[{"line_id":%d}]}`, line),
	} {
		if w := e.json(t, "POST", "/api/v1/orders/"+id+"/complete", tk.staff, body); w.Code != 422 {
			t.Errorf("%s: %d %s", name, w.Code, w.Body.String())
		}
	}

	w = e.json(t, "POST", "/api/v1/orders/"+id+"/complete", tk.admin, complete)
	if w.Code != 200 {
		t.Fatalf("complete: %d %s", w.Code, w.Body.String())
	}
	_ = json.Unmarshal(w.Body.Bytes(), &raw)
	if raw["state"] != "completed" || raw["actual_amount"].(float64) != 65250000 || raw["completer"].(map[string]any)["name"] != "admin@example.com" {
		t.Errorf("completed: %v %v %v", raw["state"], raw["actual_amount"], raw["completer"])
	}

	// final
	for name, call := range map[string]*httptest.ResponseRecorder{
		"complete again":  e.json(t, "POST", "/api/v1/orders/"+id+"/complete", tk.staff, complete),
		"cancel":          e.json(t, "POST", "/api/v1/orders/"+id+"/cancel", tk.staff, `{"reason":"too late"}`),
		"add document":    e.uploadTo(t, "POST", "/api/v1/orders/"+id+"/documents", tk.staff, "file", "x.pdf", pdfFile),
		"delete document": e.json(t, "DELETE", fmt.Sprintf("/api/v1/orders/%s/documents/%d", id, doc.ID), tk.staff, ""),
	} {
		if call.Code != 409 || errorCode(t, call) != "order_not_submitted" {
			t.Errorf("%s: %d %s", name, call.Code, call.Body.String())
		}
	}
}

func TestCancelAndRemarksOverHTTP(t *testing.T) {
	e, tk := newCatalogEnv(t)
	s := seedOrderData(t, e)
	o := createOrder(t, e, tk.staff, s)
	id := fmt.Sprint(o.ID)

	if w := e.json(t, "POST", "/api/v1/orders/"+id+"/cancel", tk.staff, `{"reason":"ab"}`); w.Code != 422 || errorCode(t, w) != "cancel_reason_required" {
		t.Errorf("short reason: %d %s", w.Code, w.Body.String())
	}
	if w := e.json(t, "POST", "/api/v1/orders/"+id+"/cancel", tk.staff, `{"reasons":"x"}`); w.Code != 400 {
		t.Errorf("unknown field: %d", w.Code)
	}
	w := e.json(t, "POST", "/api/v1/orders/"+id+"/cancel", tk.staff, `{"reason":"Wrong vessel selected"}`)
	var raw map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &raw)
	if w.Code != 200 || raw["state"] != "cancelled" || raw["cancel_reason"] != "Wrong vessel selected" {
		t.Errorf("cancel: %d %s", w.Code, w.Body.String())
	}
	if w := e.json(t, "POST", "/api/v1/orders/"+id+"/cancel", tk.staff, `{"reason":"again please"}`); w.Code != 409 {
		t.Errorf("cancel twice: %d", w.Code)
	}

	// remarks work in any state and are deletable
	rw := e.json(t, "POST", "/api/v1/orders/"+id+"/remarks", tk.staff, `{"remark":"Vendor confirmed","color":"biru","remark_date":"2026-11-03"}`)
	if rw.Code != 201 {
		t.Fatalf("remark: %d %s", rw.Code, rw.Body.String())
	}
	var remark struct {
		ID         int64  `json:"id"`
		RemarkDate string `json:"remark_date"`
		Color      string `json:"color"`
	}
	_ = json.Unmarshal(rw.Body.Bytes(), &remark)
	if remark.RemarkDate != "2026-11-03" || remark.Color != "biru" {
		t.Errorf("remark: %+v", remark)
	}
	if w := e.json(t, "POST", "/api/v1/orders/"+id+"/remarks", tk.staff, `{"remark":"x","color":"hijau"}`); w.Code != 422 {
		t.Errorf("bad colour: %d", w.Code)
	}
	if w := e.json(t, "DELETE", fmt.Sprintf("/api/v1/orders/%s/remarks/%d", id, remark.ID), tk.staff, ""); w.Code != 204 {
		t.Errorf("delete remark: %d", w.Code)
	}
	if w := e.json(t, "DELETE", fmt.Sprintf("/api/v1/orders/%s/remarks/%d", id, remark.ID), tk.staff, ""); w.Code != 404 {
		t.Errorf("delete remark twice: %d", w.Code)
	}
}

func TestOrderValidationAndErrorCodes(t *testing.T) {
	e, tk := newCatalogEnv(t)
	s := seedOrderData(t, e)
	post := func(body string) *httptest.ResponseRecorder {
		return e.json(t, "POST", "/api/v1/orders", tk.staff, body)
	}

	cases := []struct {
		name, body, code string
		status           int
	}{
		{"no lines", fmt.Sprintf(`{"company_id":%d,"partner_id":%d,"order_type":"bunker_fuel","date_order":"2026-11-02T09:00:00Z","lines":[]}`, s.company, s.partner), "lines_required", 422},
		{"discount over total", s.body(`,"amount_discount":999999999`), "discount_exceeds_total", 422},
		{"zero quantity", strings.Replace(s.body(""), `"product_qty":5000`, `"product_qty":0`, 1), "validation_failed", 422},
		{"unknown product", strings.Replace(s.body(""), fmt.Sprintf(`"product_id":%d`, s.product), `"product_id":9999`, 1), "invalid_reference", 422},
		{"unknown company", strings.Replace(s.body(""), fmt.Sprintf(`"company_id":%d`, s.company), `"company_id":9999`, 1), "invalid_reference", 422},
		{"unknown field", s.body(`,"state":"completed"`), "invalid_request", 400},
		{"not json", `nope`, "invalid_request", 400},
		{"bad date", strings.Replace(s.body(""), "2026-11-02T09:00:00+08:00", "02-11-2026", 1), "invalid_request", 400},
	}
	for _, c := range cases {
		if w := post(c.body); w.Code != c.status || errorCode(t, w) != c.code {
			t.Errorf("%s: %d %s", c.name, w.Code, w.Body.String())
		}
	}
	// a client cannot create an order in another state, and nothing was created by the refusals
	var n int
	_ = e.pool.QueryRow(context.Background(), `SELECT count(*) FROM purchase_orders`).Scan(&n)
	if n != 0 {
		t.Errorf("%d orders were created by refused requests", n)
	}

	for _, id := range []string{"0", "-4", "abc", "99999"} {
		if w := e.json(t, "GET", "/api/v1/orders/"+id, tk.viewer, ""); w.Code != 404 {
			t.Errorf("GET /orders/%s: %d", id, w.Code)
		}
		if w := e.json(t, "POST", "/api/v1/orders/"+id+"/cancel", tk.staff, `{"reason":"whatever"}`); w.Code != 404 {
			t.Errorf("cancel %s: %d", id, w.Code)
		}
	}
}

func TestDocumentUploadRefusals(t *testing.T) {
	e, tk := newCatalogEnv(t)
	s := seedOrderData(t, e)
	o := createOrder(t, e, tk.staff, s)
	path := fmt.Sprintf("/api/v1/orders/%d/documents", o.ID)

	for _, tc := range []struct {
		name, field, file string
		content           []byte
		status            int
		code              string
	}{
		{"text pretending to be pdf", "file", "do.pdf", []byte("plain text, definitely not a pdf document"), 415, "unsupported_file_type"},
		{"html", "file", "do.png", []byte("<html><script>alert(1)</script></html>"), 415, "unsupported_file_type"},
		{"too big", "file", "big.pdf", append(pdfFile, make([]byte, 5<<20)...), 413, "file_too_large"},
		{"wrong field", "document", "do.pdf", pdfFile, 400, "invalid_request"},
	} {
		w := e.uploadTo(t, "POST", path, tk.staff, tc.field, tc.file, tc.content)
		if w.Code != tc.status || errorCode(t, w) != tc.code {
			t.Errorf("%s: %d %s", tc.name, w.Code, w.Body.String())
		}
	}
	if w := e.uploadTo(t, "POST", "/api/v1/orders/99999/documents", tk.staff, "file", "do.pdf", pdfFile); w.Code != 404 {
		t.Errorf("unknown order: %d", w.Code)
	}
	if w := e.json(t, "POST", path, tk.staff, `{"file":"x"}`); w.Code != 400 {
		t.Errorf("not multipart: %d", w.Code)
	}

	// a good upload still works afterwards and the order holds exactly that document
	if w := e.uploadTo(t, "POST", path, tk.staff, "file", "do.pdf", pdfFile); w.Code != 201 {
		t.Fatalf("good upload: %d %s", w.Code, w.Body.String())
	}
	got := decode[orderResp](t, e.json(t, "GET", fmt.Sprintf("/api/v1/orders/%d", o.ID), tk.viewer, ""))
	if len(got.Documents) != 1 {
		t.Errorf("documents: %d", len(got.Documents))
	}
}

func TestDashboardFeedOverHTTP(t *testing.T) {
	e, tk := newCatalogEnv(t)
	s := seedOrderData(t, e)
	if w := e.json(t, "GET", "/api/v1/dashboard/orders", tk.viewer, ""); strings.TrimSpace(w.Body.String()) != "[]" {
		t.Errorf("empty feed: %s", w.Body.String())
	}
	createOrder(t, e, tk.staff, s)
	var feed []struct {
		Name    string `json:"name"`
		State   string `json:"state"`
		Partner struct {
			Name string `json:"name"`
		} `json:"partner"`
		AmountTotal float64 `json:"amount_total"`
		Lines       []struct {
			Vessel struct{ Name string } `json:"vessel"`
		} `json:"lines"`
	}
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/dashboard/orders", tk.viewer, "").Body.Bytes(), &feed)
	if len(feed) != 1 || feed[0].Partner.Name != "Vendor" || feed[0].AmountTotal != 80475000 || feed[0].Lines[0].Vessel.Name != "TB BB 99" {
		t.Errorf("feed: %+v", feed)
	}
}

var _ = http.StatusOK
