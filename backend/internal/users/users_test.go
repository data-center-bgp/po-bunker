package users

import (
	"context"
	"errors"
	"testing"

	"github.com/data-center-bgp/po-bunker/backend/internal/testdb"
)

func TestCreateNormalizesAndRejectsDuplicates(t *testing.T) {
	s := NewStore(testdb.New(t))
	ctx := context.Background()

	u, err := s.Create(ctx, NewUser{Name: "  Ada  ", Email: "  Ada@Example.COM ", Role: RoleAdmin, PasswordHash: "h"})
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "ada@example.com" || u.Name != "Ada" || !u.Active || u.ID == "" {
		t.Fatalf("created: %+v", u)
	}

	if _, err := s.Create(ctx, NewUser{Name: "Other", Email: "ADA@example.com", Role: RoleStaff, PasswordHash: "h"}); !errors.Is(err, ErrEmailTaken) {
		t.Errorf("duplicate email (different case): %v", err)
	}

	got, err := s.GetByEmail(ctx, " ADA@example.com")
	if err != nil || got.ID != u.ID {
		t.Errorf("GetByEmail: %v %v", got, err)
	}
	if _, err := s.GetByEmail(ctx, "nobody@example.com"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown email: %v", err)
	}
	if _, err := s.GetByID(ctx, "not-a-uuid"); !errors.Is(err, ErrNotFound) {
		t.Errorf("malformed id: %v", err)
	}
}

func TestDatabaseRefusesBadRolesAndBlankNames(t *testing.T) {
	s := NewStore(testdb.New(t))
	ctx := context.Background()
	if _, err := s.Create(ctx, NewUser{Name: "X", Email: "x@example.com", Role: "owner", PasswordHash: "h"}); err == nil {
		t.Error("an unknown role must be refused by the database")
	}
	if _, err := s.Create(ctx, NewUser{Name: "   ", Email: "y@example.com", Role: RoleStaff, PasswordHash: "h"}); err == nil {
		t.Error("a blank name must be refused")
	}
}

func TestLastAdminGuard(t *testing.T) {
	pool := testdb.New(t)
	s := NewStore(pool)
	ctx := context.Background()
	a, _ := s.Create(ctx, NewUser{Name: "A", Email: "a@example.com", Role: RoleAdmin, PasswordHash: "h"})
	b, _ := s.Create(ctx, NewUser{Name: "B", Email: "b@example.com", Role: RoleAdmin, PasswordHash: "h"})

	if _, err := pool.Exec(ctx, `UPDATE users SET role = 'staff' WHERE id = $1::uuid`, a.ID); err != nil {
		t.Fatalf("demoting one of two admins must work: %v", err)
	}
	for name, q := range map[string]string{
		"demote":     `UPDATE users SET role = 'staff' WHERE id = $1::uuid`,
		"deactivate": `UPDATE users SET active = false WHERE id = $1::uuid`,
		"delete":     `DELETE FROM users WHERE id = $1::uuid`,
	} {
		if _, err := pool.Exec(ctx, q, b.ID); err == nil {
			t.Errorf("%s of the last active admin must be refused", name)
		}
	}
}

func TestSetPasswordAndTouchLogin(t *testing.T) {
	s := NewStore(testdb.New(t))
	ctx := context.Background()
	u, _ := s.Create(ctx, NewUser{Name: "A", Email: "a@example.com", Role: RoleStaff, PasswordHash: "old"})
	if err := s.SetPassword(ctx, u.ID, "new"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetPassword(ctx, "00000000-0000-0000-0000-000000000000", "x"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown user: %v", err)
	}
	if err := s.TouchLogin(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetByID(ctx, u.ID)
	if got.PasswordHash != "new" || got.LastLoginAt == nil {
		t.Errorf("got %+v", got)
	}
}

func TestRoleHelpers(t *testing.T) {
	for r, want := range map[Role][2]bool{
		RoleAdmin: {true, true}, RoleStaff: {true, true}, RoleViewer: {true, false}, "owner": {false, false},
	} {
		if r.Valid() != want[0] || r.CanWrite() != want[1] {
			t.Errorf("%s: valid=%v canWrite=%v", r, r.Valid(), r.CanWrite())
		}
	}
}
