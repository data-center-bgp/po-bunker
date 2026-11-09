package accounts

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/testdb"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

type fx struct {
	m     *Manager
	users *users.Store
	auth  *auth.Service
	admin *users.User
}

func newFx(t *testing.T) *fx {
	t.Helper()
	pool := testdb.New(t)
	us := users.NewStore(pool)
	rs := auth.NewRefreshStore(pool, time.Hour)
	svc, err := auth.NewService(us, auth.NewTokenIssuer("0123456789abcdef0123456789abcdef", time.Minute), rs, auth.Options{BcryptCost: 4})
	if err != nil {
		t.Fatal(err)
	}
	m := New(us, rs, 4)
	admin, err := m.Create(context.Background(), CreateInput{Email: "ada@example.com", Name: "Ada", Role: "admin", Password: "admin-password"})
	if err != nil {
		t.Fatal(err)
	}
	return &fx{m: m, users: us, auth: svc, admin: admin}
}

func ptr[T any](v T) *T { return &v }

func wantInvalid(t *testing.T, err error, field string) {
	t.Helper()
	var ie *InvalidError
	if !errors.As(err, &ie) || ie.Field != field {
		t.Fatalf("want an invalid %q, got %v", field, err)
	}
}

func TestCreateNormalizesAndLetsTheUserSignIn(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	u, err := f.m.Create(ctx, CreateInput{Email: "  Bo@Example.COM ", Name: "  Bo  ", Role: "staff", Password: "staff-password"})
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "bo@example.com" || u.Name != "Bo" || u.Role != users.RoleStaff || !u.Active {
		t.Fatalf("created: %+v", u)
	}
	if _, err := f.auth.Login(ctx, "BO@example.com", "staff-password", "1.1.1.1", ""); err != nil {
		t.Errorf("the new user must be able to sign in: %v", err)
	}
	if u.PasswordHash == "staff-password" {
		t.Error("the password must be hashed")
	}
}

func TestCreateRefusals(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	ok := CreateInput{Email: "x@example.com", Name: "X", Role: "viewer", Password: "long-enough-pw"}
	with := func(fn func(*CreateInput)) CreateInput { in := ok; fn(&in); return in }

	for field, in := range map[string]CreateInput{
		"email": with(func(i *CreateInput) { i.Email = "not-an-email" }),
		"name":  with(func(i *CreateInput) { i.Name = "   " }),
		"role":  with(func(i *CreateInput) { i.Role = "owner" }),
	} {
		_, err := f.m.Create(ctx, in)
		wantInvalid(t, err, field)
	}
	for _, bad := range []string{"", "a@b", "a b@c.com", "@c.com", "a@c."} {
		if _, err := f.m.Create(ctx, with(func(i *CreateInput) { i.Email = bad })); err == nil {
			t.Errorf("email %q was accepted", bad)
		}
	}
	if _, err := f.m.Create(ctx, with(func(i *CreateInput) { i.Password = "short" })); !errors.Is(err, auth.ErrPasswordTooShort) {
		t.Errorf("weak password: %v", err)
	}
	if _, err := f.m.Create(ctx, with(func(i *CreateInput) { i.Email = "ADA@example.com" })); !errors.Is(err, users.ErrEmailTaken) {
		t.Errorf("duplicate email: %v", err)
	}
	if list, _ := f.m.List(ctx); len(list) != 1 {
		t.Errorf("refused creations left %d users", len(list))
	}
}

func TestListOrder(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	for _, e := range []struct{ email, name string }{{"c@example.com", "carol"}, {"b@example.com", "Bob"}} {
		_, _ = f.m.Create(ctx, CreateInput{Email: e.email, Name: e.name, Role: "viewer", Password: "long-enough-pw"})
	}
	inactive := false
	bob, _ := f.users.GetByEmail(ctx, "b@example.com")
	_, _ = f.m.Update(ctx, f.admin.ID, bob.ID, UpdateInput{Name: "Bob", Role: "viewer", Active: &inactive})

	list, _ := f.m.List(ctx)
	var names []string
	for _, u := range list {
		names = append(names, u.Name)
	}
	if len(names) != 3 || names[0] != "Ada" || names[1] != "carol" || names[2] != "Bob" {
		t.Errorf("active first, then by name (case-insensitive): %v", names)
	}
}

func TestUpdate(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	bo, _ := f.m.Create(ctx, CreateInput{Email: "bo@example.com", Name: "Bo", Role: "viewer", Password: "long-enough-pw"})
	active := true

	u, err := f.m.Update(ctx, f.admin.ID, bo.ID, UpdateInput{Name: "  Bo Bo ", Role: "staff", Active: &active})
	if err != nil || u.Name != "Bo Bo" || u.Role != users.RoleStaff {
		t.Fatalf("update: %+v %v", u, err)
	}

	for name, in := range map[string]UpdateInput{
		"name":   {Name: " ", Role: "staff", Active: &active},
		"role":   {Name: "x", Role: "root", Active: &active},
		"active": {Name: "x", Role: "staff"},
	} {
		_, err := f.m.Update(ctx, f.admin.ID, bo.ID, in)
		wantInvalid(t, err, name)
	}
	if _, err := f.m.Update(ctx, f.admin.ID, "00000000-0000-0000-0000-000000000000", UpdateInput{Name: "x", Role: "staff", Active: &active}); !errors.Is(err, users.ErrNotFound) {
		t.Errorf("unknown user: %v", err)
	}
	if _, err := f.m.Update(ctx, f.admin.ID, "not-a-uuid", UpdateInput{Name: "x", Role: "staff", Active: &active}); !errors.Is(err, users.ErrNotFound) {
		t.Errorf("malformed id: %v", err)
	}
}

func TestAdminCannotDemoteOrDeactivateThemselvesButCanRename(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	yes, no := true, false

	if _, err := f.m.Update(ctx, f.admin.ID, f.admin.ID, UpdateInput{Name: "Ada", Role: "staff", Active: &yes}); !errors.Is(err, ErrCannotChangeSelf) {
		t.Errorf("demote self: %v", err)
	}
	if _, err := f.m.Update(ctx, f.admin.ID, f.admin.ID, UpdateInput{Name: "Ada", Role: "admin", Active: &no}); !errors.Is(err, ErrCannotChangeSelf) {
		t.Errorf("deactivate self: %v", err)
	}
	u, err := f.m.Update(ctx, f.admin.ID, f.admin.ID, UpdateInput{Name: "Ada Lovelace", Role: "admin", Active: &yes})
	if err != nil || u.Name != "Ada Lovelace" {
		t.Errorf("rename self: %+v %v", u, err)
	}
}

func TestTheLastActiveAdminIsProtected(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	yes, no := true, false
	bo, _ := f.m.Create(ctx, CreateInput{Email: "bo@example.com", Name: "Bo", Role: "admin", Password: "long-enough-pw"})

	// Bo (an admin) tries to remove Ada, the other admin: fine while two admins exist...
	if _, err := f.m.Update(ctx, bo.ID, f.admin.ID, UpdateInput{Name: "Ada", Role: "staff", Active: &yes}); err != nil {
		t.Fatalf("demoting one of two admins: %v", err)
	}
	// ... and now Bo is the last one, so Ada (staff, acting as someone else) cannot touch Bo.
	if _, err := f.m.Update(ctx, f.admin.ID, bo.ID, UpdateInput{Name: "Bo", Role: "viewer", Active: &yes}); !errors.Is(err, ErrLastAdmin) {
		t.Errorf("demote the last admin: %v", err)
	}
	if _, err := f.m.Update(ctx, f.admin.ID, bo.ID, UpdateInput{Name: "Bo", Role: "admin", Active: &no}); !errors.Is(err, ErrLastAdmin) {
		t.Errorf("deactivate the last admin: %v", err)
	}
	if got, _ := f.users.GetByID(ctx, bo.ID); got.Role != users.RoleAdmin || !got.Active {
		t.Errorf("the last admin changed anyway: %+v", got)
	}
}

func TestDeactivatingEndsTheSessions(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	bo, _ := f.m.Create(ctx, CreateInput{Email: "bo@example.com", Name: "Bo", Role: "staff", Password: "long-enough-pw"})
	s, err := f.auth.Login(ctx, "bo@example.com", "long-enough-pw", "2.2.2.2", "")
	if err != nil {
		t.Fatal(err)
	}
	no := false
	if _, err := f.m.Update(ctx, f.admin.ID, bo.ID, UpdateInput{Name: "Bo", Role: "staff", Active: &no}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.auth.Refresh(ctx, s.RefreshToken, ""); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("refresh after deactivation: %v", err)
	}
	if _, err := f.auth.Authenticate(ctx, s.AccessToken); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("access token after deactivation: %v", err)
	}
	if _, err := f.auth.Login(ctx, "bo@example.com", "long-enough-pw", "2.2.2.3", ""); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("login after deactivation: %v", err)
	}
	// and access can be given back
	yes := true
	if _, err := f.m.Update(ctx, f.admin.ID, bo.ID, UpdateInput{Name: "Bo", Role: "staff", Active: &yes}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.auth.Login(ctx, "bo@example.com", "long-enough-pw", "2.2.2.4", ""); err != nil {
		t.Errorf("login after reactivation: %v", err)
	}
}

func TestResetPassword(t *testing.T) {
	f := newFx(t)
	ctx := context.Background()
	bo, _ := f.m.Create(ctx, CreateInput{Email: "bo@example.com", Name: "Bo", Role: "staff", Password: "old-password"})
	s, _ := f.auth.Login(ctx, "bo@example.com", "old-password", "3.3.3.3", "")

	if err := f.m.ResetPassword(ctx, bo.ID, "short"); !errors.Is(err, auth.ErrPasswordTooShort) {
		t.Errorf("weak: %v", err)
	}
	if err := f.m.ResetPassword(ctx, "00000000-0000-0000-0000-000000000000", "a-new-password"); !errors.Is(err, users.ErrNotFound) {
		t.Errorf("unknown user: %v", err)
	}
	if err := f.m.ResetPassword(ctx, bo.ID, "a-new-password"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.auth.Refresh(ctx, s.RefreshToken, ""); !errors.Is(err, auth.ErrInvalidToken) {
		t.Error("the user's sessions must end on a reset")
	}
	if _, err := f.auth.Login(ctx, "bo@example.com", "old-password", "3.3.3.4", ""); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Error("the old password still works")
	}
	if _, err := f.auth.Login(ctx, "bo@example.com", "a-new-password", "3.3.3.5", ""); err != nil {
		t.Errorf("the new password: %v", err)
	}
}
