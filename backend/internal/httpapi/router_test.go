package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/data-center-bgp/po-bunker/backend/internal/config"
)

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

func testRouter(t *testing.T, db Pinger) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r, err := NewRouter(
		config.Config{Env: "development", TrustedProxies: []string{"127.0.0.1"}},
		Deps{DB: db},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func do(r http.Handler, method, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, path, nil))
	return w
}

func errorCode(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error struct{ Code string } `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not the JSON error shape: %q", w.Body.String())
	}
	return body.Error.Code
}

func TestHealthOK(t *testing.T) {
	w := do(testRouter(t, fakeDB{}), http.MethodGet, "/healthz")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ok"`) {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if w.Header().Get("X-Request-Id") == "" {
		t.Error("missing X-Request-Id")
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("missing security headers")
	}
}

func TestHealthDatabaseDown(t *testing.T) {
	w := do(testRouter(t, fakeDB{err: errors.New("refused")}), http.MethodGet, "/healthz")
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d", w.Code)
	}
	if strings.Contains(w.Body.String(), "refused") {
		t.Error("the database error must not leak to the client")
	}
}

func TestUnknownRouteIsJSON404(t *testing.T) {
	w := do(testRouter(t, fakeDB{}), http.MethodGet, "/api/v1/nope")
	if w.Code != http.StatusNotFound || errorCode(t, w) != "not_found" {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}

func TestWrongMethodIsJSON405(t *testing.T) {
	w := do(testRouter(t, fakeDB{}), http.MethodPost, "/healthz")
	if w.Code != http.StatusMethodNotAllowed || errorCode(t, w) != "method_not_allowed" {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}

func TestRequestIDIsKeptWhenSane(t *testing.T) {
	r := testRouter(t, fakeDB{})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-Id", "abc-123")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if got := w.Header().Get("X-Request-Id"); got != "abc-123" {
		t.Errorf("request id = %q", got)
	}
}

func TestPanicBecomesJSON500(t *testing.T) {
	r := testRouter(t, fakeDB{})
	r.GET("/boom", func(*gin.Context) { panic("kaboom") })
	w := do(r, http.MethodGet, "/boom")
	if w.Code != http.StatusInternalServerError || errorCode(t, w) != "internal_error" {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "kaboom") {
		t.Error("the panic value must not leak")
	}
}

func TestFailHidesUnknownErrors(t *testing.T) {
	r := testRouter(t, fakeDB{})
	r.GET("/e", func(c *gin.Context) { Fail(c, errors.New("pq: secret detail")) })
	r.GET("/known", func(c *gin.Context) { Fail(c, NewError(http.StatusConflict, "order_not_submitted", "x")) })

	w := do(r, http.MethodGet, "/e")
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "secret") {
		t.Fatalf("unknown error: %d %s", w.Code, w.Body.String())
	}
	w = do(r, http.MethodGet, "/known")
	if w.Code != http.StatusConflict || errorCode(t, w) != "order_not_submitted" {
		t.Fatalf("known error: %d %s", w.Code, w.Body.String())
	}
}
