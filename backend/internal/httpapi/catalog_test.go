package httpapi

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

var (
	pngFile = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{7}, 200)...)
	jpgFile = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{9}, 200)...)
)

type tokens struct{ admin, staff, viewer string }

func newCatalogEnv(t *testing.T) (*env, tokens) {
	t.Helper()
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "admin@example.com", users.RoleAdmin, "admin-password")
	e.addUser(t, "staff@example.com", users.RoleStaff, "staff-password")
	e.addUser(t, "viewer@example.com", users.RoleViewer, "viewer-password")
	a, _ := login(t, e, "admin@example.com", "admin-password")
	s, _ := login(t, e, "staff@example.com", "staff-password")
	v, _ := login(t, e, "viewer@example.com", "viewer-password")
	return e, tokens{a.AccessToken, s.AccessToken, v.AccessToken}
}

func (e *env) json(t *testing.T, method, path, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	var h map[string]string
	if token != "" {
		h = bearer(token)
	}
	return e.call(method, path, body, h)
}

func multipartFile(t *testing.T, field, filename string, content []byte) (string, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	hdr := make(textproto.MIMEHeader)
	hdr.Set("Content-Disposition", fmt.Sprintf(`form-data; name=%q; filename=%q`, field, filename))
	hdr.Set("Content-Type", "application/octet-stream")
	part, _ := w.CreatePart(hdr)
	_, _ = part.Write(content)
	_ = w.Close()
	return buf.String(), w.FormDataContentType()
}

func (e *env) upload(t *testing.T, path, token, field, filename string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	body, ctype := multipartFile(t, field, filename, content)
	return e.call(http.MethodPut, path, body, map[string]string{"Authorization": "Bearer " + token, "Content-Type": ctype})
}

func TestCatalogRequiresLogin(t *testing.T) {
	e, _ := newCatalogEnv(t)
	for _, path := range []string{"/companies", "/partners", "/regions", "/vessels", "/products", "/product-categories", "/uoms", "/code-budgets", "/business-units", "/requesters"} {
		if w := e.json(t, "GET", "/api/v1"+path, "", ""); w.Code != 401 {
			t.Errorf("anonymous GET %s: %d", path, w.Code)
		}
	}
}

func TestEveryRoleCanReadEmptyListsAsArrays(t *testing.T) {
	e, tk := newCatalogEnv(t)
	for _, token := range []string{tk.admin, tk.staff, tk.viewer} {
		for _, path := range []string{"/companies", "/partners", "/regions", "/vessels", "/products", "/product-categories", "/uoms", "/code-budgets", "/business-units"} {
			w := e.json(t, "GET", "/api/v1"+path, token, "")
			if w.Code != 200 || strings.TrimSpace(w.Body.String()) != "[]" {
				t.Errorf("GET %s: %d %q", path, w.Code, w.Body.String())
			}
		}
	}
}

func TestWriteEndpointsFollowTheRoleMatrix(t *testing.T) {
	e, tk := newCatalogEnv(t)
	bodies := map[string]string{
		"/companies":    `{"name":"C","active":true}`,
		"/partners":     `{"name":"P","is_company":true,"is_supplier":true,"is_customer":false,"active":true}`,
		"/regions":      `{"name":"R","active":true}`,
		"/uoms":         `{"name":"U"}`,
		"/code-budgets": `{"name":"B","active":true}`,
	}
	for path, body := range bodies {
		if w := e.json(t, "POST", "/api/v1"+path, tk.viewer, body); w.Code != 403 {
			t.Errorf("viewer POST %s: %d", path, w.Code)
		}
		if w := e.json(t, "POST", "/api/v1"+path, "", body); w.Code != 401 {
			t.Errorf("anonymous POST %s: %d", path, w.Code)
		}
		for name, token := range map[string]string{"staff": tk.staff, "admin": tk.admin} {
			w := e.json(t, "POST", "/api/v1"+path, token, body)
			if w.Code != 201 {
				t.Fatalf("%s POST %s: %d %s", name, path, w.Code, w.Body.String())
			}
			if name == "admin" {
				continue
			}
			// the staff-created row can be edited by staff and not by a viewer
			var created struct{ ID int64 }
			_ = json.Unmarshal(w.Body.Bytes(), &created)
			put := fmt.Sprintf("/api/v1%s/%d", path, created.ID)
			if w := e.json(t, "PUT", put, tk.viewer, body); w.Code != 403 {
				t.Errorf("viewer PUT %s: %d", put, w.Code)
			}
			if w := e.json(t, "PUT", put, tk.staff, strings.Replace(body, `"name":"`, `"name":"Edited `, 1)); w.Code != 200 || !strings.Contains(w.Body.String(), "Edited") {
				t.Errorf("staff PUT %s: %d %s", put, w.Code, w.Body.String())
			}
		}
	}
	// requesters: any role reads
	if w := e.json(t, "GET", "/api/v1/requesters", tk.viewer, ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"admin@example.com"`) {
		t.Errorf("requesters: %d %s", w.Code, w.Body.String())
	}
}

func TestCompanyResponseShapeMatchesTheFrontendType(t *testing.T) {
	e, tk := newCatalogEnv(t)
	e.json(t, "POST", "/api/v1/regions", tk.admin, `{"name":"Kaltim","code":"KT","active":true}`)
	w := e.json(t, "POST", "/api/v1/companies", tk.staff, `{"name":"PT Armada","code_company":"ASG","code_company_general":"ASG","active":true,"region_id":1,"currency":"IDR"}`)
	if w.Code != 201 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	var got map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	for _, key := range []string{"id", "name", "code_company", "code_company_general", "active", "email", "phone", "website", "vat", "street", "street2", "city", "zip", "region_id", "currency", "business_unit_id", "logo_path", "region", "business_unit"} {
		if _, ok := got[key]; !ok {
			t.Errorf("missing key %q in %s", key, w.Body.String())
		}
	}
	region := got["region"].(map[string]any)
	if region["name"] != "Kaltim" || region["code"] != "KT" || got["business_unit"] != nil || got["email"] != nil {
		t.Errorf("shape: %v", got)
	}
}

func TestCatalogErrorMapping(t *testing.T) {
	e, tk := newCatalogEnv(t)
	post := func(path, body string) *httptest.ResponseRecorder {
		return e.json(t, "POST", "/api/v1"+path, tk.staff, body)
	}

	if w := post("/companies", `{"name":"  ","active":true}`); w.Code != 422 || errorCode(t, w) != "validation_failed" || !strings.Contains(w.Body.String(), `"field":"name"`) {
		t.Errorf("blank name: %d %s", w.Code, w.Body.String())
	}
	if w := post("/companies", `{"name":"X"}`); w.Code != 422 || !strings.Contains(w.Body.String(), `"field":"active"`) {
		t.Errorf("missing active: %d %s", w.Code, w.Body.String())
	}
	post("/companies", `{"name":"A","code_company":"DUP","active":true}`)
	if w := post("/companies", `{"name":"B","code_company":"DUP","active":true}`); w.Code != 409 || errorCode(t, w) != "duplicate" {
		t.Errorf("duplicate: %d %s", w.Code, w.Body.String())
	}
	if w := post("/companies", `{"name":"C","active":true,"region_id":999}`); w.Code != 422 || errorCode(t, w) != "invalid_reference" {
		t.Errorf("bad reference: %d %s", w.Code, w.Body.String())
	}
	if w := post("/companies", `{"name":"D","active":true,"surprise":1}`); w.Code != 400 || errorCode(t, w) != "invalid_request" {
		t.Errorf("unknown field: %d %s", w.Code, w.Body.String())
	}
	if w := post("/companies", `{"name":"D","active":"yes"}`); w.Code != 400 {
		t.Errorf("wrong type: %d", w.Code)
	}
	for _, id := range []string{"999", "0", "-1", "abc", "1e3"} {
		if w := e.json(t, "PUT", "/api/v1/companies/"+id, tk.staff, `{"name":"x","active":true}`); w.Code != 404 {
			t.Errorf("PUT /companies/%s: %d", id, w.Code)
		}
	}
	if w := post("/uoms", `{"name":"Liter"}`); w.Code != 201 {
		t.Fatal("seed unit")
	}
	if w := post("/uoms", `{"name":"Liter"}`); w.Code != 409 {
		t.Errorf("duplicate unit: %d", w.Code)
	}
}

func TestProductsActiveFilterAndPrices(t *testing.T) {
	e, tk := newCatalogEnv(t)
	e.pool.Exec(t.Context(), `INSERT INTO product_categories (name) VALUES ('Fuel')`)
	e.json(t, "POST", "/api/v1/uoms", tk.staff, `{"name":"Liter"}`)
	mk := func(name string, active bool) {
		w := e.json(t, "POST", "/api/v1/products", tk.staff, fmt.Sprintf(`{"name":%q,"category_id":1,"uom_id":1,"standard_price":14500.125,"list_price":0,"active":%v}`, name, active))
		if w.Code != 201 {
			t.Fatalf("%s: %d %s", name, w.Code, w.Body.String())
		}
	}
	mk("HSD", true)
	mk("Old", false)

	var all, active []map[string]any
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/products", tk.viewer, "").Body.Bytes(), &all)
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/products?active=true", tk.viewer, "").Body.Bytes(), &active)
	if len(all) != 2 || len(active) != 1 || active[0]["name"] != "HSD" {
		t.Fatalf("all=%d active=%d", len(all), len(active))
	}
	if active[0]["standard_price"] != 14500.125 || active[0]["uom"].(map[string]any)["name"] != "Liter" {
		t.Errorf("product JSON: %v", active[0])
	}
	if w := e.json(t, "POST", "/api/v1/products", tk.staff, `{"name":"neg","category_id":1,"uom_id":1,"standard_price":-5,"list_price":0,"active":true}`); w.Code != 422 {
		t.Errorf("negative price: %d", w.Code)
	}
}

func TestCompanyLogoUpload(t *testing.T) {
	e, tk := newCatalogEnv(t)
	e.json(t, "POST", "/api/v1/companies", tk.staff, `{"name":"A","active":true}`)

	// permissions
	if w := e.upload(t, "/api/v1/companies/1/logo", tk.viewer, "file", "logo.png", pngFile); w.Code != 403 {
		t.Errorf("viewer: %d", w.Code)
	}
	if w := e.call("PUT", "/api/v1/companies/1/logo", "", nil); w.Code != 401 {
		t.Errorf("anonymous: %d", w.Code)
	}

	// success
	w := e.upload(t, "/api/v1/companies/1/logo", tk.staff, "file", "logo.png", pngFile)
	if w.Code != 200 {
		t.Fatalf("upload: %d %s", w.Code, w.Body.String())
	}
	var c struct {
		LogoPath string `json:"logo_path"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &c)
	if !strings.HasPrefix(c.LogoPath, "logos/1/") || !strings.HasSuffix(c.LogoPath, ".png") {
		t.Fatalf("logo path %q", c.LogoPath)
	}
	if _, err := os.Stat(filepath.Join(e.dir, filepath.FromSlash(c.LogoPath))); err != nil {
		t.Fatalf("file not on disk: %v", err)
	}

	// replacing a logo removes the old file (names carry a millisecond stamp)
	time.Sleep(5 * time.Millisecond)
	w = e.upload(t, "/api/v1/companies/1/logo", tk.admin, "file", "new.jpg", jpgFile)
	if w.Code != 200 {
		t.Fatalf("replace: %d %s", w.Code, w.Body.String())
	}
	var c2 struct {
		LogoPath string `json:"logo_path"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &c2)
	if !strings.HasSuffix(c2.LogoPath, ".jpg") || c2.LogoPath == c.LogoPath {
		t.Fatalf("second logo %q", c2.LogoPath)
	}
	if _, err := os.Stat(filepath.Join(e.dir, filepath.FromSlash(c.LogoPath))); !os.IsNotExist(err) {
		t.Error("the replaced logo file should have been deleted")
	}

	// refusals
	cases := []struct {
		name, file string
		content    []byte
		field      string
		status     int
		code       string
	}{
		{"text pretending to be png", "evil.png", []byte("<html><script>alert(1)</script></html>"), "file", 415, "unsupported_file_type"},
		{"svg", "logo.svg", []byte("<svg xmlns='http://www.w3.org/2000/svg'/>"), "file", 415, "unsupported_file_type"},
		{"pdf as logo", "doc.pdf", append([]byte("%PDF-1.4\n"), make([]byte, 50)...), "file", 415, "unsupported_file_type"},
		{"too big", "big.png", append(pngFile, make([]byte, 1<<20)...), "file", 413, "file_too_large"},
		{"wrong field name", "logo.png", pngFile, "image", 400, "invalid_request"},
	}
	for _, tc := range cases {
		w := e.upload(t, "/api/v1/companies/1/logo", tk.staff, tc.field, tc.file, tc.content)
		if w.Code != tc.status || errorCode(t, w) != tc.code {
			t.Errorf("%s: %d %s", tc.name, w.Code, w.Body.String())
		}
	}
	if w := e.call("PUT", "/api/v1/companies/1/logo", `{"file":"x"}`, map[string]string{"Authorization": "Bearer " + tk.staff}); w.Code != 400 {
		t.Errorf("not multipart: %d", w.Code)
	}
	if w := e.upload(t, "/api/v1/companies/999/logo", tk.staff, "file", "logo.png", pngFile); w.Code != 404 {
		t.Errorf("unknown company: %d", w.Code)
	}

	// none of the refusals may have changed the logo or left files behind
	var list []struct {
		LogoPath string `json:"logo_path"`
	}
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/companies", tk.viewer, "").Body.Bytes(), &list)
	if list[0].LogoPath != c2.LogoPath {
		t.Errorf("logo changed by a refused upload: %q", list[0].LogoPath)
	}
	entries, _ := os.ReadDir(filepath.Join(e.dir, "logos", "1"))
	if len(entries) != 1 {
		t.Errorf("expected exactly one logo file on disk, found %d", len(entries))
	}
}

func TestSignedDownloads(t *testing.T) {
	e, tk := newCatalogEnv(t)
	e.json(t, "POST", "/api/v1/companies", tk.staff, `{"name":"A","active":true}`)
	w := e.upload(t, "/api/v1/companies/1/logo", tk.staff, "file", "logo.png", pngFile)
	var c struct {
		LogoPath string `json:"logo_path"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &c)

	// asking for a link needs a login, a valid path and an existing file
	if w := e.json(t, "GET", "/api/v1/file-url?path="+c.LogoPath, "", ""); w.Code != 401 {
		t.Errorf("anonymous link: %d", w.Code)
	}
	for _, p := range []string{"", "../x.png", "logos/1/../../etc/passwd", "other/1/a.png"} {
		if w := e.json(t, "GET", "/api/v1/file-url?path="+p, tk.viewer, ""); w.Code != 400 {
			t.Errorf("path %q: %d", p, w.Code)
		}
	}
	if w := e.json(t, "GET", "/api/v1/file-url?path=logos/1/nope.png", tk.viewer, ""); w.Code != 404 {
		t.Errorf("missing file: %d", w.Code)
	}

	w = e.json(t, "GET", "/api/v1/file-url?path="+c.LogoPath, tk.viewer, "")
	if w.Code != 200 {
		t.Fatalf("link: %d %s", w.Code, w.Body.String())
	}
	var link struct {
		URL       string    `json:"url"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &link)
	if time.Until(link.ExpiresAt) < 50*time.Minute {
		t.Errorf("expiry too soon: %v", link.ExpiresAt)
	}

	// the link works without any login and serves the real bytes
	got := e.call("GET", link.URL, "", nil)
	if got.Code != 200 || !bytes.Equal(got.Body.Bytes(), pngFile) {
		t.Fatalf("download: %d (%d bytes)", got.Code, got.Body.Len())
	}
	if ct := got.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("content type %q", ct)
	}
	if got.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("missing nosniff")
	}

	// tampering
	bad := map[string]string{
		"no signature":    strings.Split(link.URL, "&sig=")[0],
		"wrong signature": strings.Split(link.URL, "&sig=")[0] + "&sig=" + strings.Repeat("0", 64),
		"other path":      strings.Replace(link.URL, "logos/1/", "logos/2/", 1),
		"extended expiry": strings.Replace(link.URL, "exp=", "exp=9", 1),
		"traversal":       "/api/v1/files/logos/1/../../x.png?exp=9999999999&sig=abc",
		"garbage exp":     "/api/v1/files/" + c.LogoPath + "?exp=soon&sig=abc",
	}
	for name, u := range bad {
		if w := e.call("GET", u, "", nil); w.Code != 403 && w.Code != 404 {
			t.Errorf("%s: %d", name, w.Code)
		}
	}

	// an expired but correctly signed link
	expired := func() string {
		past := time.Now().Add(-time.Minute).Unix()
		return fmt.Sprintf("/api/v1/files/%s?exp=%d&sig=%s", c.LogoPath, past, hmacHex(secret, c.LogoPath, past))
	}()
	if w := e.call("GET", expired, "", nil); w.Code != 403 {
		t.Errorf("expired link: %d", w.Code)
	}
}

// hmacHex mirrors how the file store signs links, so the test can produce a
// correctly signed link that has already expired.
func hmacHex(key, rel string, exp int64) string {
	m := hmac.New(sha256.New, []byte(key))
	m.Write([]byte(rel + string(rune(10)) + fmt.Sprint(exp)))
	return hex.EncodeToString(m.Sum(nil))
}
