package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

type userJSON struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	Role        string  `json:"role"`
	Active      bool    `json:"active"`
	LastLoginAt *string `json:"last_login_at"`
}

func TestUserEndpointsAreAdminOnly(t *testing.T) {
	e, tk := newCatalogEnv(t)
	endpoints := []struct{ method, path, body string }{
		{"GET", "/users", ""},
		{"POST", "/users", `{"email":"n@example.com","name":"N","role":"viewer","password":"long-enough-pw"}`},
		{"PUT", "/users/00000000-0000-0000-0000-000000000000", `{"name":"x","role":"staff","active":true}`},
		{"POST", "/users/00000000-0000-0000-0000-000000000000/reset-password", `{"password":"long-enough-pw"}`},
	}
	for _, ep := range endpoints {
		if w := e.json(t, ep.method, "/api/v1"+ep.path, "", ep.body); w.Code != 401 {
			t.Errorf("anonymous %s %s: %d", ep.method, ep.path, w.Code)
		}
		for name, token := range map[string]string{"staff": tk.staff, "viewer": tk.viewer} {
			if w := e.json(t, ep.method, "/api/v1"+ep.path, token, ep.body); w.Code != 403 {
				t.Errorf("%s %s %s: %d", name, ep.method, ep.path, w.Code)
			}
		}
	}
}

func TestUserManagementOverHTTP(t *testing.T) {
	e, tk := newCatalogEnv(t)

	w := e.json(t, "GET", "/api/v1/users", tk.admin, "")
	var list []userJSON
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if w.Code != 200 || len(list) != 3 || list[0].Email != "admin@example.com" || list[0].LastLoginAt == nil {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "password") || strings.Contains(w.Body.String(), "$2") {
		t.Error("the user list must never expose password hashes")
	}

	// create -> the new user can sign in at once
	w = e.json(t, "POST", "/api/v1/users", tk.admin, `{"email":" New@Example.com ","name":"New Person","role":"staff","password":"fresh-password"}`)
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	var created userJSON
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	if created.Email != "new@example.com" || created.Role != "staff" || !created.Active {
		t.Errorf("created: %+v", created)
	}
	login(t, e, "new@example.com", "fresh-password")

	for name, tc := range map[string]struct {
		body, code string
		status     int
	}{
		"duplicate":     {`{"email":"new@example.com","name":"X","role":"staff","password":"fresh-password"}`, "email_taken", 409},
		"weak password": {`{"email":"w@example.com","name":"X","role":"staff","password":"short"}`, "weak_password", 400},
		"bad role":      {`{"email":"r@example.com","name":"X","role":"owner","password":"fresh-password"}`, "validation_failed", 422},
		"bad email":     {`{"email":"nope","name":"X","role":"staff","password":"fresh-password"}`, "validation_failed", 422},
		"unknown field": {`{"email":"u@example.com","name":"X","role":"staff","password":"fresh-password","active":false}`, "invalid_request", 400},
	} {
		if w := e.json(t, "POST", "/api/v1/users", tk.admin, tc.body); w.Code != tc.status || errorCode(t, w) != tc.code {
			t.Errorf("%s: %d %s", name, w.Code, w.Body.String())
		}
	}

	// update: rename and demote someone else, deactivate them (their token stops working at once)
	path := "/api/v1/users/" + created.ID
	staffSession, _ := login(t, e, "new@example.com", "fresh-password")
	w = e.json(t, "PUT", path, tk.admin, `{"name":"Renamed","role":"viewer","active":true}`)
	var updated userJSON
	_ = json.Unmarshal(w.Body.Bytes(), &updated)
	if w.Code != 200 || updated.Name != "Renamed" || updated.Role != "viewer" {
		t.Fatalf("update: %d %s", w.Code, w.Body.String())
	}
	if w := e.json(t, "GET", "/probe/write", staffSession.AccessToken, ""); w.Code != 403 {
		t.Errorf("the demoted user's existing token must lose write access at once: %d", w.Code)
	}
	if w := e.json(t, "PUT", path, tk.admin, `{"name":"Renamed","role":"viewer","active":false}`); w.Code != 200 {
		t.Fatalf("deactivate: %d", w.Code)
	}
	if w := e.json(t, "GET", "/api/v1/auth/me", staffSession.AccessToken, ""); w.Code != 401 {
		t.Errorf("the deactivated user's token must stop working: %d", w.Code)
	}
	if w := e.call("POST", "/api/v1/auth/login", `{"email":"new@example.com","password":"fresh-password"}`, nil); w.Code != 401 {
		t.Errorf("the deactivated user can still log in: %d", w.Code)
	}

	for name, tc := range map[string]struct {
		path, body, code string
		status           int
	}{
		"missing active": {path, `{"name":"x","role":"staff"}`, "validation_failed", 422},
		"bad role":       {path, `{"name":"x","role":"root","active":true}`, "validation_failed", 422},
		"unknown user":   {"/api/v1/users/00000000-0000-0000-0000-000000000000", `{"name":"x","role":"staff","active":true}`, "not_found", 404},
		"malformed id":   {"/api/v1/users/xyz", `{"name":"x","role":"staff","active":true}`, "not_found", 404},
	} {
		if w := e.json(t, "PUT", tc.path, tk.admin, tc.body); w.Code != tc.status || errorCode(t, w) != tc.code {
			t.Errorf("%s: %d %s", name, w.Code, w.Body.String())
		}
	}

	// reset password: the sessions end and the new password works
	_, oldCookie := login(t, e, "staff@example.com", "staff-password")
	var staffID string
	for _, u := range list {
		if u.Email == "staff@example.com" {
			staffID = u.ID
		}
	}
	reset := fmt.Sprintf("/api/v1/users/%s/reset-password", staffID)
	if w := e.json(t, "POST", reset, tk.admin, `{"password":"short"}`); w.Code != 400 || errorCode(t, w) != "weak_password" {
		t.Errorf("weak reset: %d %s", w.Code, w.Body.String())
	}
	if w := e.json(t, "POST", reset, tk.admin, `{"password":"brand-new-password"}`); w.Code != 204 {
		t.Fatalf("reset: %d %s", w.Code, w.Body.String())
	}
	if w := e.call("POST", "/api/v1/auth/refresh", "", nil, oldCookie); w.Code != 401 {
		t.Errorf("the old session must end: %d", w.Code)
	}
	login(t, e, "staff@example.com", "brand-new-password")
	if w := e.json(t, "POST", "/api/v1/users/00000000-0000-0000-0000-000000000000/reset-password", tk.admin, `{"password":"brand-new-password"}`); w.Code != 404 {
		t.Errorf("reset for an unknown user: %d", w.Code)
	}
}

func TestAdminCannotLockThemselvesOut(t *testing.T) {
	e, tk := newCatalogEnv(t)
	var list []userJSON
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/users", tk.admin, "").Body.Bytes(), &list)
	var adminID string
	for _, u := range list {
		if u.Role == "admin" {
			adminID = u.ID
		}
	}
	path := "/api/v1/users/" + adminID
	for name, body := range map[string]string{
		"demote":     `{"name":"admin@example.com","role":"staff","active":true}`,
		"deactivate": `{"name":"admin@example.com","role":"admin","active":false}`,
	} {
		if w := e.json(t, "PUT", path, tk.admin, body); w.Code != 409 || errorCode(t, w) != "cannot_change_self" {
			t.Errorf("%s: %d %s", name, w.Code, w.Body.String())
		}
	}
	if w := e.json(t, "PUT", path, tk.admin, `{"name":"Renamed Admin","role":"admin","active":true}`); w.Code != 200 {
		t.Errorf("rename self: %d", w.Code)
	}

	// a second admin cannot remove the last other admin either
	e.addUser(t, "second@example.com", "admin", "second-password")
	s2, _ := login(t, e, "second@example.com", "second-password")
	if w := e.json(t, "PUT", path, s2.AccessToken, `{"name":"x","role":"viewer","active":true}`); w.Code != 200 {
		t.Fatalf("demoting one of two admins: %d %s", w.Code, w.Body.String())
	}
}

func TestVesselSyncOverHTTP(t *testing.T) {
	e, tk := newCatalogEnv(t)

	for name, token := range map[string]string{"anonymous": "", "viewer": tk.viewer} {
		want := 403
		if token == "" {
			want = 401
		}
		if w := e.json(t, "POST", "/api/v1/vessels/sync", token, ""); w.Code != want {
			t.Errorf("%s: %d", name, w.Code)
		}
	}

	// staff and admin can sync; the result matches the frontend's VesselSyncResult
	w := e.json(t, "POST", "/api/v1/vessels/sync", tk.staff, "")
	if w.Code != 200 {
		t.Fatalf("staff sync: %d %s", w.Code, w.Body.String())
	}
	var res map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if res["ok"] != true || res["total"] != float64(2) || res["created"] != float64(2) || res["pages"] != float64(1) {
		t.Errorf("result: %v", res)
	}
	for _, key := range []string{"ok", "pages", "total", "created", "updated", "adopted", "deactivated", "skipped", "types_created"} {
		if _, ok := res[key]; !ok {
			t.Errorf("missing %q", key)
		}
	}
	var list []struct {
		Name string `json:"name"`
		Type *struct {
			Name string `json:"name"`
		} `json:"type"`
		SyncedAt *string `json:"synced_at"`
	}
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/vessels", tk.viewer, "").Body.Bytes(), &list)
	if len(list) != 2 || list[0].SyncedAt == nil || list[0].Type == nil || list[0].Type.Name != "Tug" {
		t.Errorf("vessels after the sync: %+v", list)
	}
	if w := e.json(t, "POST", "/api/v1/vessels/sync", tk.admin, ""); w.Code != 200 {
		t.Errorf("admin sync: %d", w.Code)
	}

	// SMS API problems: bad gateway with a stable code, nothing changed
	e.sms = func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }
	if w := e.json(t, "POST", "/api/v1/vessels/sync", tk.staff, ""); w.Code != 502 || errorCode(t, w) != "vessel_api_status" {
		t.Errorf("upstream 500: %d %s", w.Code, w.Body.String())
	}
	e.sms = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[]}`))
	}
	if w := e.json(t, "POST", "/api/v1/vessels/sync", tk.staff, ""); w.Code != 422 || errorCode(t, w) != "empty_ship_list" {
		t.Errorf("empty list: %d %s", w.Code, w.Body.String())
	}
	var active int
	_ = e.pool.QueryRow(context.Background(), `SELECT count(*) FROM vessels WHERE active`).Scan(&active)
	if active != 2 {
		t.Errorf("failed syncs deactivated vessels: %d active", active)
	}
}

func TestVesselCodeIsAdminOnly(t *testing.T) {
	e, tk := newCatalogEnv(t)
	e.json(t, "POST", "/api/v1/vessels/sync", tk.admin, "")
	var list []struct {
		ID   int64   `json:"id"`
		Code *string `json:"code"`
	}
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/vessels", tk.admin, "").Body.Bytes(), &list)
	path := fmt.Sprintf("/api/v1/vessels/%d/code", list[0].ID)

	for name, token := range map[string]string{"staff": tk.staff, "viewer": tk.viewer} {
		if w := e.json(t, "PUT", path, token, `{"code":"X"}`); w.Code != 403 {
			t.Errorf("%s: %d", name, w.Code)
		}
	}
	w := e.json(t, "PUT", path, tk.admin, `{"code":"  TB1  "}`)
	var v struct {
		Code *string `json:"code"`
		Name string  `json:"name"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	if w.Code != 200 || v.Code == nil || *v.Code != "TB1" {
		t.Fatalf("set code: %d %s", w.Code, w.Body.String())
	}
	// a later sync must keep the code
	e.json(t, "POST", "/api/v1/vessels/sync", tk.staff, "")
	_ = json.Unmarshal(e.json(t, "GET", "/api/v1/vessels", tk.admin, "").Body.Bytes(), &list)
	if list[0].Code == nil || *list[0].Code != "TB1" {
		t.Error("the sync overwrote the vessel code")
	}
	if w := e.json(t, "PUT", path, tk.admin, `{"code":"  "}`); w.Code != 200 || strings.Contains(w.Body.String(), `"code":"`) {
		t.Errorf("clearing the code: %d %s", w.Code, w.Body.String())
	}
	if w := e.json(t, "PUT", path, tk.admin, `{"code":"`+strings.Repeat("x", 31)+`"}`); w.Code != 422 {
		t.Errorf("long code: %d", w.Code)
	}
	if w := e.json(t, "PUT", "/api/v1/vessels/99999/code", tk.admin, `{"code":"X"}`); w.Code != 404 {
		t.Errorf("unknown vessel: %d", w.Code)
	}
}
