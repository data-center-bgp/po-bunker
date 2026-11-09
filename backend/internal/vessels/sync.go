package vessels

import (
	"context"
	"errors"
	"math"
	"strconv"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrEmptyList: an empty answer must never deactivate every vessel.
	ErrEmptyList = errors.New("refusing to sync an empty ship list")
	// ErrNoValidShips: the list had no entry with a numeric id and a name.
	ErrNoValidShips = errors.New("the ship list has no valid entries (need a numeric id and a name)")
	// ErrSyncRunning: another sync is already in progress.
	ErrSyncRunning = errors.New("a vessel sync is already running")
)

// Result is what a sync reports (JSON field names match VesselSyncResult in the frontend).
type Result struct {
	OK           bool `json:"ok"`
	Pages        int  `json:"pages"`
	Total        int  `json:"total"`
	Created      int  `json:"created"`
	Updated      int  `json:"updated"`
	Adopted      int  `json:"adopted"`
	Deactivated  int  `json:"deactivated"`
	Skipped      int  `json:"skipped"`
	TypesCreated int  `json:"types_created"`
}

// Syncer pulls the SMS ship list into the vessels table.
type Syncer struct {
	pool   *pgxpool.Pool
	client *Client
	mu     sync.Mutex
}

func NewSyncer(pool *pgxpool.Pool, client *Client) *Syncer {
	return &Syncer{pool: pool, client: client}
}

// Run fetches the ships and applies them. Only one sync runs at a time.
func (s *Syncer) Run(ctx context.Context) (*Result, error) {
	if !s.mu.TryLock() {
		return nil, ErrSyncRunning
	}
	defer s.mu.Unlock()

	ships, pages, err := s.client.Fetch(ctx)
	if err != nil {
		return nil, err
	}
	res, err := s.Apply(ctx, ships)
	if err != nil {
		return nil, err
	}
	res.Pages = pages
	return res, nil
}

type ship struct {
	id                                      int64
	name                                    string
	typeCode, typeName, fleet, head, hcCode *string
	hcName                                  *string
}

// parseShip reads one API entry. It returns false for entries that cannot be
// used: not an object, no integer id, or no name.
func parseShip(m map[string]any) (ship, bool) {
	var sh ship
	if m == nil {
		return sh, false
	}
	switch v := m["id"].(type) {
	case float64:
		if v != math.Trunc(v) || math.Abs(v) > 1<<53 {
			return sh, false
		}
		sh.id = int64(v)
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		if err != nil {
			return sh, false
		}
		sh.id = n
	default:
		return sh, false
	}
	name, _ := m["name"].(string)
	if sh.name = strings.TrimSpace(name); sh.name == "" {
		return sh, false
	}
	nested := func(obj, key string) *string {
		o, _ := m[obj].(map[string]any)
		s, _ := o[key].(string)
		if s = strings.TrimSpace(s); s != "" {
			return &s
		}
		return nil
	}
	sh.typeCode, sh.typeName = nested("ship_type", "code"), nested("ship_type", "name")
	sh.fleet, sh.head = nested("fleet", "name"), nested("operation_head", "name")
	sh.hcCode, sh.hcName = nested("headcount", "code"), nested("headcount", "name")
	return sh, true
}

// Apply upserts the ships in one transaction:
//
//   - the key is vessels.external_id (the API's id);
//   - a hand-made vessel with the same name and no external_id is adopted;
//   - the ship type is matched by code, then by name, otherwise created;
//   - vessels with an external_id that are not in the list become inactive
//     (never deleted: orders keep their vessel);
//   - an empty or fully invalid list is refused;
//   - code, tonnage, IMO, call sign, operator, owner and docking dates are not touched.
func (s *Syncer) Apply(ctx context.Context, ships []map[string]any) (*Result, error) {
	if len(ships) == 0 {
		return nil, ErrEmptyList
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	res := &Result{OK: true}
	seen := map[int64]bool{}
	var seenIDs []int64

	for _, m := range ships {
		sh, ok := parseShip(m)
		if !ok || seen[sh.id] {
			res.Skipped++
			continue
		}
		seen[sh.id] = true
		seenIDs = append(seenIDs, sh.id)

		typeID, created, err := resolveType(ctx, tx, sh)
		if err != nil {
			return nil, err
		}
		if created {
			res.TypesCreated++
		}

		var vesselID int64
		err = tx.QueryRow(ctx, `SELECT id FROM vessels WHERE external_id = $1`, sh.id).Scan(&vesselID)
		switch {
		case err == nil:
			_, err = tx.Exec(ctx, `
				UPDATE vessels SET name = $2, type_id = coalesce($3, type_id), fleet_name = $4, operation_head_name = $5,
				       headcount_code = $6, headcount_name = $7, active = true, synced_at = now()
				WHERE id = $1`, vesselID, sh.name, typeID, sh.fleet, sh.head, sh.hcCode, sh.hcName)
			res.Updated++
		case errors.Is(err, pgx.ErrNoRows):
			err = tx.QueryRow(ctx, `
				SELECT id FROM vessels WHERE external_id IS NULL AND lower(name) = lower($1) ORDER BY id LIMIT 1`, sh.name).Scan(&vesselID)
			switch {
			case err == nil:
				_, err = tx.Exec(ctx, `
					UPDATE vessels SET external_id = $2, type_id = coalesce($3, type_id), fleet_name = $4,
					       operation_head_name = $5, headcount_code = $6, headcount_name = $7, active = true, synced_at = now()
					WHERE id = $1`, vesselID, sh.id, typeID, sh.fleet, sh.head, sh.hcCode, sh.hcName)
				res.Adopted++
			case errors.Is(err, pgx.ErrNoRows):
				_, err = tx.Exec(ctx, `
					INSERT INTO vessels (external_id, name, type_id, fleet_name, operation_head_name, headcount_code,
					                     headcount_name, active, synced_at)
					VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())`,
					sh.id, sh.name, typeID, sh.fleet, sh.head, sh.hcCode, sh.hcName)
				res.Created++
			}
		}
		if err != nil {
			return nil, err
		}
	}

	if len(seenIDs) == 0 {
		return nil, ErrNoValidShips
	}
	tag, err := tx.Exec(ctx, `
		UPDATE vessels SET active = false
		WHERE external_id IS NOT NULL AND active AND NOT (external_id = ANY($1))`, seenIDs)
	if err != nil {
		return nil, err
	}
	res.Deactivated = int(tag.RowsAffected())
	res.Total = len(seenIDs)

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return res, nil
}

// resolveType finds the vessel type by code, then by name (filling in a missing
// code), or creates it. The bool reports whether a type was created.
func resolveType(ctx context.Context, tx pgx.Tx, sh ship) (*int64, bool, error) {
	var id int64
	if sh.typeCode != nil {
		err := tx.QueryRow(ctx, `SELECT id FROM vessel_types WHERE code = $1`, *sh.typeCode).Scan(&id)
		if err == nil {
			return &id, false, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, false, err
		}
	}
	if sh.typeName != nil {
		err := tx.QueryRow(ctx, `SELECT id FROM vessel_types WHERE lower(name) = lower($1) ORDER BY id LIMIT 1`, *sh.typeName).Scan(&id)
		if err == nil {
			if sh.typeCode != nil {
				if _, err := tx.Exec(ctx, `UPDATE vessel_types SET code = $2 WHERE id = $1 AND code IS NULL`, id, *sh.typeCode); err != nil {
					return nil, false, err
				}
			}
			return &id, false, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, false, err
		}
	}
	name := sh.typeName
	if name == nil {
		name = sh.typeCode
	}
	if name == nil {
		return nil, false, nil // the ship has no type information at all
	}
	err := tx.QueryRow(ctx, `
		INSERT INTO vessel_types (name, code) VALUES ($1, $2)
		ON CONFLICT (name) DO UPDATE SET code = coalesce(vessel_types.code, excluded.code)
		RETURNING id`, *name, sh.typeCode).Scan(&id)
	if err != nil {
		return nil, false, err
	}
	return &id, true, nil
}
