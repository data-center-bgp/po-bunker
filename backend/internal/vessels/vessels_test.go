package vessels

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/data-center-bgp/po-bunker/backend/internal/testdb"
)

func apiShip(id any, name, typeCode, typeName string) map[string]any {
	if n, ok := id.(int); ok {
		id = float64(n) // JSON numbers decode as float64, like the real API client delivers them
	}
	m := map[string]any{
		"id": id, "name": name,
		"fleet":          map[string]any{"id": 1, "name": "Fleet A"},
		"operation_head": map[string]any{"id": 2, "name": "Head X"},
		"headcount":      map[string]any{"code": "HC1", "name": "Headcount One"},
	}
	if typeCode != "" || typeName != "" {
		m["ship_type"] = map[string]any{"code": typeCode, "name": typeName}
	}
	return m
}

// ---- client ----------------------------------------------------------------

func serve(t *testing.T, h http.HandlerFunc) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return srv
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func TestFetchSinglePageSendsTheToken(t *testing.T) {
	var gotAuth, gotAccept string
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotAccept = r.Header.Get("Authorization"), r.Header.Get("Accept")
		writeJSON(w, map[string]any{"data": []any{apiShip(1, "A", "TB", "Tug"), "not an object"}})
	})
	ships, pages, err := NewClient(srv.URL, "secret-token").Fetch(context.Background())
	if err != nil || pages != 1 || len(ships) != 2 {
		t.Fatalf("%d ships, %d pages, %v", len(ships), pages, err)
	}
	if ships[1] != nil {
		t.Error("a non-object entry should come through as nil so the sync counts it as skipped")
	}
	if gotAuth != "Bearer secret-token" || gotAccept != "application/json" {
		t.Errorf("headers: %q %q", gotAuth, gotAccept)
	}
}

func TestFetchAcceptsABareArray(t *testing.T) {
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, []any{apiShip(1, "A", "", "")}) })
	ships, pages, err := NewClient(srv.URL, "t").Fetch(context.Background())
	if err != nil || pages != 1 || len(ships) != 1 {
		t.Fatalf("%d %d %v", len(ships), pages, err)
	}
}

func TestFetchFollowsEveryPaginationShape(t *testing.T) {
	var base string
	for name, build := range map[string]func(page int) map[string]any{
		"links.next": func(p int) map[string]any {
			return map[string]any{"data": []any{apiShip(p, "S", "", "")}, "links": map[string]any{"next": nextIf(p, 3, base+"/?page=%d")}}
		},
		"next_page_url": func(p int) map[string]any {
			return map[string]any{"data": []any{apiShip(p, "S", "", "")}, "next_page_url": nextIf(p, 3, base+"/?page=%d")}
		},
		"meta": func(p int) map[string]any {
			return map[string]any{"data": []any{apiShip(p, "S", "", "")}, "meta": map[string]any{"current_page": p, "last_page": 3}}
		},
	} {
		srv := serve(t, func(w http.ResponseWriter, r *http.Request) {
			p := 1
			_, _ = fmt.Sscanf(r.URL.Query().Get("page"), "%d", &p)
			writeJSON(w, build(p))
		})
		base = srv.URL
		ships, pages, err := NewClient(srv.URL+"/", "t").Fetch(context.Background())
		if err != nil || pages != 3 || len(ships) != 3 {
			t.Errorf("%s: %d ships, %d pages, %v", name, len(ships), pages, err)
		}
	}
}

func nextIf(page, last int, format string) any {
	if page >= last {
		return nil
	}
	return fmt.Sprintf(format, page+1)
}

func TestFetchNeverSendsTheTokenToAnotherHost(t *testing.T) {
	var leaked atomic.Bool
	evil := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			leaked.Store(true)
		}
		writeJSON(w, map[string]any{"data": []any{}})
	})
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"data": []any{apiShip(1, "A", "", "")}, "next_page_url": evil.URL + "/steal"})
	})
	_, _, err := NewClient(srv.URL, "secret").Fetch(context.Background())
	var up *UpstreamError
	if !errors.As(err, &up) || up.Code != "vessel_api_bad_link" {
		t.Fatalf("got %v", err)
	}
	if leaked.Load() {
		t.Fatal("the bearer token was sent to another host")
	}
}

func TestFetchStopsAtThePageLimit(t *testing.T) {
	var hits atomic.Int32
	var base string
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		writeJSON(w, map[string]any{"data": []any{apiShip(int(hits.Load()), "S", "", "")}, "next_page_url": base + "/?again"})
	})
	base = srv.URL
	_, pages, err := NewClient(srv.URL, "t").Fetch(context.Background())
	if err != nil || pages != maxPages || int(hits.Load()) != maxPages {
		t.Fatalf("pages %d hits %d err %v", pages, hits.Load(), err)
	}
}

func TestFetchErrors(t *testing.T) {
	code := func(err error) string {
		var up *UpstreamError
		if errors.As(err, &up) {
			return up.Code
		}
		return fmt.Sprint(err)
	}
	for name, tc := range map[string]struct {
		handler http.HandlerFunc
		want    string
	}{
		"http 401":      {func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) }, "vessel_api_status"},
		"http 500":      {func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, "vessel_api_status"},
		"not json":      {func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("<html>nope")) }, "vessel_api_unexpected_response"},
		"data not list": {func(w http.ResponseWriter, r *http.Request) { writeJSON(w, map[string]any{"data": "x"}) }, "vessel_api_unexpected_response"},
		"a number":      {func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("42")) }, "vessel_api_unexpected_response"},
	} {
		srv := serve(t, tc.handler)
		if _, _, err := NewClient(srv.URL, "t").Fetch(context.Background()); code(err) != tc.want {
			t.Errorf("%s: %v", name, err)
		}
	}
	if _, _, err := NewClient("http://127.0.0.1:1/", "t").Fetch(context.Background()); code(err) != "vessel_api_unreachable" {
		t.Errorf("unreachable: %v", err)
	}
	if _, _, err := NewClient("https://example.com", "").Fetch(context.Background()); code(err) != "vessel_api_not_configured" {
		t.Errorf("no token: %v", err)
	}
	var up *UpstreamError
	_, _, err := NewClient("::bad::", "t").Fetch(context.Background())
	if !errors.As(err, &up) || !up.NotConfigured {
		t.Errorf("bad url: %v", err)
	}
}

// ---- sync ------------------------------------------------------------------

type fixture struct {
	pool   *pgxpool.Pool
	syncer *Syncer
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	pool := testdb.New(t)
	return &fixture{pool: pool, syncer: NewSyncer(pool, NewClient("http://unused.invalid", "t"))}
}

func (f *fixture) exec(sql string, args ...any) {
	if _, err := f.pool.Exec(context.Background(), sql, args...); err != nil {
		panic(err)
	}
}

func (f *fixture) vessel(name string) (id int64, external *int64, active bool, typeName *string, fleet *string) {
	err := f.pool.QueryRow(context.Background(), `
		SELECT v.id, v.external_id, v.active, t.name, v.fleet_name
		FROM vessels v LEFT JOIN vessel_types t ON t.id = v.type_id WHERE v.name = $1`, name).Scan(&id, &external, &active, &typeName, &fleet)
	if err != nil {
		panic(fmt.Sprintf("vessel %q: %v", name, err))
	}
	return
}

func (f *fixture) count(sql string) int {
	var n int
	if err := f.pool.QueryRow(context.Background(), sql).Scan(&n); err != nil {
		panic(err)
	}
	return n
}

func TestSyncCreatesUpdatesAdoptsAndDeactivates(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.exec(`INSERT INTO vessel_types (name) VALUES ('Tug Boat')`)                                                // matched by name, gets its code
	f.exec(`INSERT INTO vessels (name, code, gross_tonage, imo_no) VALUES ('tb manual', 'MAN', 123.45, 'IMO1')`) // a hand-made vessel the API knows
	f.exec(`INSERT INTO vessels (name, external_id, fleet_name) VALUES ('TB Gone', 99, 'old')`)                  // synced earlier, no longer in the API
	f.exec(`INSERT INTO vessels (name) VALUES ('Hand Only')`)                                                    // never synced: must stay active
	f.exec(`INSERT INTO vessels (name, external_id, active) VALUES ('TB Back', 7, false)`)                       // inactive but returns

	res, err := f.syncer.Apply(ctx, []map[string]any{
		apiShip(1, " TB New ", "TB", "Tug Boat"),
		apiShip("2", "TB Manual", "", ""),           // adopts 'tb manual' (case-insensitive), string id
		apiShip(7, "TB Back", "MT", "Motor Tanker"), // reactivated, new type created
		apiShip(1, "Duplicate id", "", ""),          // skipped
		apiShip("abc", "Bad id", "", ""),            // skipped
		apiShip(3.5, "Fractional id", "", ""),       // skipped
		apiShip(4, "   ", "", ""),                   // skipped: no name
		nil,                                         // skipped: not an object
		apiShip(5, "TB Typeless", "", ""),           // no type info at all
	})
	if err != nil {
		t.Fatal(err)
	}
	want := Result{OK: true, Total: 4, Created: 2, Updated: 1, Adopted: 1, Deactivated: 1, Skipped: 5, TypesCreated: 1}
	if *res != want {
		t.Fatalf("result %+v, want %+v", *res, want)
	}

	if _, ext, active, typ, fleet := f.vessel("TB New"); ext == nil || *ext != 1 || !active || typ == nil || *typ != "Tug Boat" || fleet == nil || *fleet != "Fleet A" {
		t.Errorf("created vessel: %v %v %v %v", ext, active, typ, fleet)
	}
	if _, ext, _, _, _ := f.vessel("tb manual"); ext == nil || *ext != 2 {
		t.Errorf("adopted vessel external id: %v", ext)
	}
	var code *string
	var tonnage *float64
	_ = f.pool.QueryRow(ctx, `SELECT code, gross_tonage::float8 FROM vessels WHERE name = 'tb manual'`).Scan(&code, &tonnage)
	if code == nil || *code != "MAN" || tonnage == nil || *tonnage != 123.45 {
		t.Errorf("the sync must not touch code or tonnage: %v %v", code, tonnage)
	}
	if _, _, active, _, _ := f.vessel("TB Back"); !active {
		t.Error("a returning vessel must be reactivated")
	}
	if _, _, active, _, _ := f.vessel("TB Gone"); active {
		t.Error("a vessel missing from the API must be deactivated")
	}
	if _, _, active, _, _ := f.vessel("Hand Only"); !active {
		t.Error("a vessel the API never knew must stay active")
	}
	if n := f.count(`SELECT count(*) FROM vessels WHERE name = 'Duplicate id' OR name = 'Bad id' OR name = 'Fractional id'`); n != 0 {
		t.Errorf("%d skipped entries were created", n)
	}
	if _, _, _, typ, _ := f.vessel("TB Typeless"); typ != nil {
		t.Errorf("a ship without type information must have no type: %v", *typ)
	}

	// the existing type got the API's code, and the new type was created with its code
	var tugCode, tankerCode *string
	_ = f.pool.QueryRow(ctx, `SELECT code FROM vessel_types WHERE name = 'Tug Boat'`).Scan(&tugCode)
	_ = f.pool.QueryRow(ctx, `SELECT code FROM vessel_types WHERE name = 'Motor Tanker'`).Scan(&tankerCode)
	if tugCode == nil || *tugCode != "TB" || tankerCode == nil || *tankerCode != "MT" {
		t.Errorf("type codes: %v %v", tugCode, tankerCode)
	}
}

func TestSyncIsIdempotent(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	list := []map[string]any{apiShip(1, "A", "TB", "Tug"), apiShip(2, "B", "TB", "Tug")}
	first, err := f.syncer.Apply(ctx, list)
	if err != nil || first.Created != 2 {
		t.Fatalf("%+v %v", first, err)
	}
	again, err := f.syncer.Apply(ctx, list)
	if err != nil || again.Created != 0 || again.Updated != 2 || again.Deactivated != 0 || again.TypesCreated != 0 {
		t.Fatalf("second run %+v %v", again, err)
	}
	if n := f.count(`SELECT count(*) FROM vessels`); n != 2 {
		t.Errorf("vessels: %d", n)
	}
	if n := f.count(`SELECT count(*) FROM vessel_types`); n != 1 {
		t.Errorf("vessel types: %d", n)
	}
}

func TestSyncRefusesEmptyAndUselessListsAndChangesNothing(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.exec(`INSERT INTO vessels (name, external_id) VALUES ('Keep', 1)`)

	if _, err := f.syncer.Apply(ctx, nil); !errors.Is(err, ErrEmptyList) {
		t.Errorf("empty: %v", err)
	}
	if _, err := f.syncer.Apply(ctx, []map[string]any{}); !errors.Is(err, ErrEmptyList) {
		t.Errorf("empty slice: %v", err)
	}
	if _, err := f.syncer.Apply(ctx, []map[string]any{apiShip("x", "A", "", ""), nil, apiShip(2, "", "", "")}); !errors.Is(err, ErrNoValidShips) {
		t.Errorf("no valid entries: %v", err)
	}
	if _, _, active, _, _ := f.vessel("Keep"); !active {
		t.Error("a bad API answer must never deactivate the vessels")
	}
	if n := f.count(`SELECT count(*) FROM vessel_types`); n != 0 {
		t.Errorf("a refused sync left %d types behind", n)
	}
}

func TestSyncRollsBackOnAFailure(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.exec(`INSERT INTO vessels (name, external_id) VALUES ('Existing', 10)`)
	f.exec(`INSERT INTO vessels (name, external_id) VALUES ('Other', 11)`)
	// Renaming 'Existing' to a name the unique index on lower(name)... does not exist, so force a failure
	// with an oversized fleet name is not possible either; use a cancelled context instead.
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := f.syncer.Apply(cancelled, []map[string]any{apiShip(10, "Renamed", "", "")}); err == nil {
		t.Fatal("a cancelled context must fail the sync")
	}
	if _, _, _, _, fleet := f.vessel("Existing"); fleet != nil {
		t.Error("nothing may be written when the sync fails")
	}
}

func TestOnlyOneSyncRunsAtATime(t *testing.T) {
	f := newFixture(t)
	release := make(chan struct{})
	started := make(chan struct{})
	var once sync.Once
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) {
		first := false
		once.Do(func() { first = true; close(started) })
		if first {
			<-release
		}
		writeJSON(w, map[string]any{"data": []any{apiShip(1, "A", "", "")}})
	})
	f.syncer.client = NewClient(srv.URL, "t")

	done := make(chan error, 1)
	go func() { _, err := f.syncer.Run(context.Background()); done <- err }()
	<-started
	if _, err := f.syncer.Run(context.Background()); !errors.Is(err, ErrSyncRunning) {
		t.Errorf("second concurrent run: %v", err)
	}
	close(release)
	if err := <-done; err != nil {
		t.Errorf("first run: %v", err)
	}
	if res, err := f.syncer.Run(context.Background()); err != nil || res.Pages != 1 {
		t.Errorf("after the first finished: %+v %v", res, err)
	}
}

func TestRunReportsPagesAndFetchErrors(t *testing.T) {
	f := newFixture(t)
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"data": []any{apiShip(1, "A", "", "")}})
	})
	f.syncer.client = NewClient(srv.URL, "t")
	res, err := f.syncer.Run(context.Background())
	if err != nil || res.Pages != 1 || res.Total != 1 || res.Created != 1 {
		t.Fatalf("%+v %v", res, err)
	}

	bad := serve(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(502) })
	f.syncer.client = NewClient(bad.URL, "t")
	if _, err := f.syncer.Run(context.Background()); err == nil || !strings.Contains(err.Error(), "vessel_api_status") {
		t.Errorf("upstream failure: %v", err)
	}
	// the failed run must not have touched the vessels
	if n := f.count(`SELECT count(*) FROM vessels WHERE active`); n != 1 {
		t.Errorf("active vessels after a failed fetch: %d", n)
	}
}
