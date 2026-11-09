package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/catalog"
	"github.com/data-center-bgp/po-bunker/backend/internal/config"
	"github.com/data-center-bgp/po-bunker/backend/internal/files"
	"github.com/data-center-bgp/po-bunker/backend/internal/testdb"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

const secret = "0123456789abcdef0123456789abcdef"

type env struct {
	r     *gin.Engine
	pool  *pgxpool.Pool
	users *users.Store
	files *files.Store
	dir   string
}

func newEnv(t *testing.T, accessTTL time.Duration) *env {
	t.Helper()
	gin.SetMode(gin.TestMode)
	pool := testdb.New(t)
	us := users.NewStore(pool)
	svc, err := auth.NewService(us, auth.NewTokenIssuer(secret, accessTTL), auth.NewRefreshStore(pool, time.Hour), auth.Options{BcryptCost: 4})
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	fileStore, err := files.New(dir, secret)
	if err != nil {
		t.Fatal(err)
	}
	r, err := NewRouter(
		config.Config{Env: "development", CookieSecure: true, TrustedProxies: []string{"127.0.0.1"}},
		Deps{DB: pool, Auth: svc, Catalog: catalog.NewStore(pool), Users: us, Files: fileStore},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}
	// Probe routes that exercise the role middleware.
	probe := r.Group("/probe", Authenticate(svc))
	probe.GET("/any", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })
	probe.GET("/write", RequireWrite(), func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })
	probe.GET("/admin", RequireAdmin(), func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })
	return &env{r: r, pool: pool, users: us, files: fileStore, dir: dir}
}

func (e *env) addUser(t *testing.T, email string, role users.Role, password string) *users.User {
	t.Helper()
	hash, err := auth.HashPassword(password, 4)
	if err != nil {
		t.Fatal(err)
	}
	u, err := e.users.Create(context.Background(), users.NewUser{Name: email, Email: email, Role: role, PasswordHash: hash})
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func (e *env) call(method, path, body string, headers map[string]string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	e.r.ServeHTTP(w, req)
	return w
}

func bearer(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("bad JSON %q: %v", w.Body.String(), err)
	}
	return v
}

type session struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	User        struct {
		ID, Email, Role string
	} `json:"user"`
}

func refreshCookieOf(t *testing.T, w *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == refreshCookie {
			return c
		}
	}
	t.Fatal("no refresh cookie in the response")
	return nil
}

func login(t *testing.T, e *env, email, password string) (*session, *http.Cookie) {
	t.Helper()
	w := e.call("POST", "/api/v1/auth/login", `{"email":"`+email+`","password":"`+password+`"}`, nil)
	if w.Code != 200 {
		t.Fatalf("login %s: %d %s", email, w.Code, w.Body.String())
	}
	return ptr(decode[session](t, w)), refreshCookieOf(t, w)
}

func ptr[T any](v T) *T { return &v }

func TestLoginReturnsSessionAndSecureCookie(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")

	w := e.call("POST", "/api/v1/auth/login", `{"email":"Ada@Example.com","password":"admin-password"}`, nil)
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	s := decode[session](t, w)
	if s.AccessToken == "" || s.TokenType != "Bearer" || s.ExpiresIn < 800 || s.ExpiresIn > 900 || s.User.Role != "admin" {
		t.Fatalf("session: %+v", s)
	}
	if strings.Contains(w.Body.String(), "password") {
		t.Error("the response must never contain password data")
	}

	c := refreshCookieOf(t, w)
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteStrictMode || c.Path != "/api/v1/auth" || c.Value == "" {
		t.Errorf("cookie flags: %+v", c)
	}
}

func TestLoginErrors(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")

	cases := []struct {
		name, body, code string
		status           int
	}{
		{"wrong password", `{"email":"ada@example.com","password":"nope-nope"}`, "invalid_credentials", 401},
		{"unknown user", `{"email":"x@example.com","password":"nope-nope"}`, "invalid_credentials", 401},
		{"missing fields", `{"email":"ada@example.com"}`, "invalid_request", 400},
		{"not json", `hello`, "invalid_request", 400},
		{"unknown field", `{"email":"a@b.c","password":"x","admin":true}`, "invalid_request", 400},
		{"trailing data", `{"email":"a@b.c","password":"x"}{}`, "invalid_request", 400},
	}
	for _, c := range cases {
		w := e.call("POST", "/api/v1/auth/login", c.body, nil)
		if w.Code != c.status || errorCode(t, w) != c.code {
			t.Errorf("%s: got %d %s", c.name, w.Code, w.Body.String())
		}
	}
	// The same message for a wrong password and an unknown user.
	a := e.call("POST", "/api/v1/auth/login", `{"email":"ada@example.com","password":"bad-bad-bad"}`, nil)
	b := e.call("POST", "/api/v1/auth/login", `{"email":"ghost@example.com","password":"bad-bad-bad"}`, nil)
	if a.Body.String() != b.Body.String() {
		t.Errorf("account existence leaks:\n%s\n%s", a.Body, b.Body)
	}
}

func TestLoginRateLimitReturns429(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")
	var last *httptest.ResponseRecorder
	for i := 0; i < 7; i++ {
		last = e.call("POST", "/api/v1/auth/login", `{"email":"ada@example.com","password":"bad-bad-bad"}`, nil)
	}
	if last.Code != 429 || errorCode(t, last) != "too_many_attempts" || last.Header().Get("Retry-After") == "" {
		t.Fatalf("got %d %s retry-after=%q", last.Code, last.Body.String(), last.Header().Get("Retry-After"))
	}
}

func TestMeNeedsAValidToken(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")
	s, _ := login(t, e, "ada@example.com", "admin-password")

	w := e.call("GET", "/api/v1/auth/me", "", bearer(s.AccessToken))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"ada@example.com"`) {
		t.Fatalf("me: %d %s", w.Code, w.Body.String())
	}

	for name, h := range map[string]map[string]string{
		"no header":      nil,
		"wrong scheme":   {"Authorization": "Basic abc"},
		"empty bearer":   {"Authorization": "Bearer "},
		"garbage":        bearer("garbage"),
		"tampered":       bearer(s.AccessToken[:len(s.AccessToken)-4] + "AAAA"),
		"lowercase none": {"Authorization": "bearer " + s.AccessToken},
	} {
		w := e.call("GET", "/api/v1/auth/me", "", h)
		want := 401
		if name == "lowercase none" {
			want = 200 // the scheme is case-insensitive
		}
		if w.Code != want {
			t.Errorf("%s: got %d %s", name, w.Code, w.Body.String())
		}
	}
}

func TestExpiredAccessTokenIsRefused(t *testing.T) {
	e := newEnv(t, -time.Minute) // every token is born expired
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")
	s, _ := login(t, e, "ada@example.com", "admin-password")
	w := e.call("GET", "/api/v1/auth/me", "", bearer(s.AccessToken))
	if w.Code != 401 || errorCode(t, w) != "invalid_token" {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}

func TestDeactivatedUserIsLockedOutImmediately(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")
	bo := e.addUser(t, "bo@example.com", users.RoleStaff, "staff-password")
	s, _ := login(t, e, "bo@example.com", "staff-password")

	if w := e.call("GET", "/probe/write", "", bearer(s.AccessToken)); w.Code != 200 {
		t.Fatalf("before: %d", w.Code)
	}
	_, _ = e.pool.Exec(context.Background(), `UPDATE users SET active = false WHERE id = $1::uuid`, bo.ID)
	if w := e.call("GET", "/probe/write", "", bearer(s.AccessToken)); w.Code != 401 {
		t.Fatalf("after deactivation: %d %s", w.Code, w.Body.String())
	}
}

func TestRoleChangeAppliesWithoutNewToken(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")
	bo := e.addUser(t, "bo@example.com", users.RoleStaff, "staff-password")
	s, _ := login(t, e, "bo@example.com", "staff-password")

	if w := e.call("GET", "/probe/write", "", bearer(s.AccessToken)); w.Code != 200 {
		t.Fatalf("staff write: %d", w.Code)
	}
	_, _ = e.pool.Exec(context.Background(), `UPDATE users SET role = 'viewer' WHERE id = $1::uuid`, bo.ID)
	if w := e.call("GET", "/probe/write", "", bearer(s.AccessToken)); w.Code != 403 || errorCode(t, w) != "forbidden" {
		t.Fatalf("after demotion: %d %s", w.Code, w.Body.String())
	}
}

func TestRolePermissionMatrix(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "admin@example.com", users.RoleAdmin, "admin-password")
	e.addUser(t, "staff@example.com", users.RoleStaff, "staff-password")
	e.addUser(t, "viewer@example.com", users.RoleViewer, "viewer-password")

	want := map[string]map[string]int{
		"admin@example.com":  {"/probe/any": 200, "/probe/write": 200, "/probe/admin": 200},
		"staff@example.com":  {"/probe/any": 200, "/probe/write": 200, "/probe/admin": 403},
		"viewer@example.com": {"/probe/any": 200, "/probe/write": 403, "/probe/admin": 403},
	}
	for email, paths := range want {
		pw := strings.SplitN(email, "@", 2)[0] + "-password"
		s, _ := login(t, e, email, pw)
		for path, code := range paths {
			if w := e.call("GET", path, "", bearer(s.AccessToken)); w.Code != code {
				t.Errorf("%s %s: got %d, want %d", email, path, w.Code, code)
			}
		}
	}
	if w := e.call("GET", "/probe/any", "", nil); w.Code != 401 {
		t.Errorf("anonymous: %d", w.Code)
	}
}

func TestRefreshEndpoint(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")
	_, cookie := login(t, e, "ada@example.com", "admin-password")

	w := e.call("POST", "/api/v1/auth/refresh", "", nil, cookie)
	if w.Code != 200 {
		t.Fatalf("refresh: %d %s", w.Code, w.Body.String())
	}
	next := refreshCookieOf(t, w)
	if next.Value == cookie.Value {
		t.Error("the refresh cookie was not rotated")
	}
	s := decode[session](t, w)
	if w := e.call("GET", "/api/v1/auth/me", "", bearer(s.AccessToken)); w.Code != 200 {
		t.Errorf("new access token: %d", w.Code)
	}

	// The old cookie is dead and the response clears it.
	w = e.call("POST", "/api/v1/auth/refresh", "", nil, cookie)
	if w.Code != 401 || errorCode(t, w) != "invalid_token" {
		t.Fatalf("old cookie: %d %s", w.Code, w.Body.String())
	}
	if c := refreshCookieOf(t, w); c.MaxAge >= 0 {
		t.Errorf("the dead cookie was not cleared: %+v", c)
	}

	if w := e.call("POST", "/api/v1/auth/refresh", "", nil); w.Code != 401 {
		t.Errorf("no cookie: %d", w.Code)
	}
}

func TestLogoutEndsTheSession(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")
	_, cookie := login(t, e, "ada@example.com", "admin-password")

	w := e.call("POST", "/api/v1/auth/logout", "", nil, cookie)
	if w.Code != 204 {
		t.Fatalf("logout: %d", w.Code)
	}
	if c := refreshCookieOf(t, w); c.MaxAge >= 0 {
		t.Errorf("cookie not cleared: %+v", c)
	}
	if w := e.call("POST", "/api/v1/auth/refresh", "", nil, cookie); w.Code != 401 {
		t.Errorf("refresh after logout: %d", w.Code)
	}
	if w := e.call("POST", "/api/v1/auth/logout", "", nil); w.Code != 204 {
		t.Errorf("logout without a session must still succeed: %d", w.Code)
	}
}

func TestChangePasswordEndpoint(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	e.addUser(t, "ada@example.com", users.RoleAdmin, "admin-password")
	s, oldCookie := login(t, e, "ada@example.com", "admin-password")

	call := func(body string) *httptest.ResponseRecorder {
		return e.call("POST", "/api/v1/auth/change-password", body, bearer(s.AccessToken))
	}
	if w := call(`{"current_password":"wrong-password","new_password":"brand-new-password"}`); w.Code != 400 || errorCode(t, w) != "wrong_password" {
		t.Errorf("wrong current: %d %s", w.Code, w.Body.String())
	}
	if w := call(`{"current_password":"admin-password","new_password":"short"}`); w.Code != 400 || errorCode(t, w) != "weak_password" {
		t.Errorf("weak: %d %s", w.Code, w.Body.String())
	}
	w := call(`{"current_password":"admin-password","new_password":"brand-new-password"}`)
	if w.Code != 200 {
		t.Fatalf("change: %d %s", w.Code, w.Body.String())
	}
	if w := e.call("POST", "/api/v1/auth/refresh", "", nil, oldCookie); w.Code != 401 {
		t.Errorf("the old session must end: %d", w.Code)
	}
	if w := e.call("POST", "/api/v1/auth/change-password", `{"current_password":"x","new_password":"y"}`, nil); w.Code != 401 {
		t.Errorf("anonymous: %d", w.Code)
	}
	login(t, e, "ada@example.com", "brand-new-password")
}

func TestBodyIsSizeLimited(t *testing.T) {
	e := newEnv(t, 15*time.Minute)
	big := `{"email":"a@b.c","password":"` + strings.Repeat("x", 2<<20) + `"}`
	if w := e.call("POST", "/api/v1/auth/login", big, nil); w.Code != 400 {
		t.Errorf("oversized body: %d", w.Code)
	}
}
