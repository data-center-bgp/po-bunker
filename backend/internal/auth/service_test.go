package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/data-center-bgp/po-bunker/backend/internal/testdb"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

const testSecret = "0123456789abcdef0123456789abcdef"

type fixture struct {
	pool    *pgxpool.Pool
	users   *users.Store
	refresh *RefreshStore
	svc     *Service
	admin   *users.User
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	pool := testdb.New(t)
	us := users.NewStore(pool)
	rs := NewRefreshStore(pool, time.Hour)
	svc, err := NewService(us, NewTokenIssuer(testSecret, 15*time.Minute), rs, Options{BcryptCost: 4})
	if err != nil {
		t.Fatal(err)
	}
	hash, _ := HashPassword("admin-password", 4)
	admin, err := us.Create(context.Background(), users.NewUser{Name: "Ada", Email: "Ada@Example.com", Role: users.RoleAdmin, PasswordHash: hash})
	if err != nil {
		t.Fatal(err)
	}
	return &fixture{pool: pool, users: us, refresh: rs, svc: svc, admin: admin}
}

func TestLoginSuccess(t *testing.T) {
	f := newFixture(t)
	s, err := f.svc.Login(context.Background(), "  ADA@example.com ", "admin-password", "1.1.1.1", "test-agent")
	if err != nil {
		t.Fatal(err)
	}
	if s.User.ID != f.admin.ID || s.AccessToken == "" || s.RefreshToken == "" {
		t.Fatalf("bad session: %+v", s)
	}
	u, _ := f.users.GetByID(context.Background(), f.admin.ID)
	if u.LastLoginAt == nil {
		t.Error("last_login_at was not recorded")
	}
	// The raw refresh token must not be what is stored.
	var n int
	_ = f.pool.QueryRow(context.Background(), `SELECT count(*) FROM refresh_tokens WHERE token_hash = $1`, s.RefreshToken).Scan(&n)
	if n != 0 {
		t.Error("the raw refresh token was stored")
	}
}

func TestLoginFailuresLookAlike(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	hash, _ := HashPassword("viewer-password", 4)
	v, _ := f.users.Create(ctx, users.NewUser{Name: "Vi", Email: "vi@example.com", Role: users.RoleViewer, PasswordHash: hash})
	_, _ = f.pool.Exec(ctx, `UPDATE users SET active = false WHERE id = $1::uuid`, v.ID)

	for name, c := range map[string][2]string{
		"unknown email":  {"nobody@example.com", "whatever-pass"},
		"wrong password": {"ada@example.com", "wrong-password"},
		"inactive user":  {"vi@example.com", "viewer-password"},
	} {
		_, err := f.svc.Login(ctx, c[0], c[1], "2.2.2.2", "")
		if !errors.Is(err, ErrInvalidCredentials) {
			t.Errorf("%s: got %v, want ErrInvalidCredentials", name, err)
		}
	}
}

func TestLoginRateLimit(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		if _, err := f.svc.Login(ctx, "ada@example.com", "bad-password", "3.3.3.3", ""); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("attempt %d: %v", i+1, err)
		}
	}
	_, err := f.svc.Login(ctx, "ada@example.com", "admin-password", "3.3.3.3", "")
	var limited *RateLimitedError
	if !errors.As(err, &limited) || limited.RetryAfter <= 0 {
		t.Fatalf("6th attempt should be rate limited, got %v", err)
	}
	// Another IP is not affected.
	if _, err := f.svc.Login(ctx, "ada@example.com", "admin-password", "4.4.4.4", ""); err != nil {
		t.Errorf("other IP: %v", err)
	}
}

func TestRefreshRotatesAndOldTokenDies(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	s1, _ := f.svc.Login(ctx, "ada@example.com", "admin-password", "5.5.5.5", "")

	s2, err := f.svc.Refresh(ctx, s1.RefreshToken, "")
	if err != nil {
		t.Fatal(err)
	}
	if s2.RefreshToken == s1.RefreshToken || s2.User.ID != f.admin.ID {
		t.Fatal("refresh token was not rotated")
	}
	if _, err := f.svc.Refresh(ctx, s1.RefreshToken, ""); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("old token: %v", err)
	}
	if _, err := f.svc.Refresh(ctx, s2.RefreshToken, ""); err != nil {
		t.Errorf("new token should work: %v", err)
	}
}

func TestRefreshReuseAfterGraceRevokesEverySession(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	s1, _ := f.svc.Login(ctx, "ada@example.com", "admin-password", "6.6.6.6", "")
	s2, _ := f.svc.Refresh(ctx, s1.RefreshToken, "") // s1 is now rotated

	// Pretend the rotation happened a minute ago, then someone replays s1.
	_, _ = f.pool.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE token_hash = $1`, hashToken(s1.RefreshToken))
	if _, err := f.svc.Refresh(ctx, s1.RefreshToken, ""); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("replay: %v", err)
	}
	if _, err := f.svc.Refresh(ctx, s2.RefreshToken, ""); !errors.Is(err, ErrInvalidToken) {
		t.Error("the replay should have revoked the legitimate session too")
	}
}

func TestRefreshReuseWithinGraceKeepsSessions(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	s1, _ := f.svc.Login(ctx, "ada@example.com", "admin-password", "7.7.7.7", "")
	s2, _ := f.svc.Refresh(ctx, s1.RefreshToken, "")

	// Two tabs racing: the loser gets an error but nobody is logged out.
	if _, err := f.svc.Refresh(ctx, s1.RefreshToken, ""); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("racing refresh: %v", err)
	}
	if _, err := f.svc.Refresh(ctx, s2.RefreshToken, ""); err != nil {
		t.Errorf("the winner's session must survive: %v", err)
	}
}

func TestRefreshExpiredAndUnknown(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	s, _ := f.svc.Login(ctx, "ada@example.com", "admin-password", "8.8.8.8", "")
	_, _ = f.pool.Exec(ctx, `UPDATE refresh_tokens SET expires_at = now() - interval '1 second'`)
	if _, err := f.svc.Refresh(ctx, s.RefreshToken, ""); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("expired: %v", err)
	}
	if _, err := f.svc.Refresh(ctx, "no-such-token", ""); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("unknown: %v", err)
	}
}

func TestRefreshDeactivatedUserRevokesSessions(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	hash, _ := HashPassword("second-password", 4)
	other, _ := f.users.Create(ctx, users.NewUser{Name: "Bo", Email: "bo@example.com", Role: users.RoleStaff, PasswordHash: hash})
	s, _ := f.svc.Login(ctx, "bo@example.com", "second-password", "9.9.9.9", "")
	_, _ = f.pool.Exec(ctx, `UPDATE users SET active = false WHERE id = $1::uuid`, other.ID)
	if _, err := f.svc.Refresh(ctx, s.RefreshToken, ""); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("deactivated user refreshed: %v", err)
	}
}

func TestLogoutRevokesToken(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	s, _ := f.svc.Login(ctx, "ada@example.com", "admin-password", "10.0.0.1", "")
	if err := f.svc.Logout(ctx, s.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Refresh(ctx, s.RefreshToken, ""); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("token still works after logout: %v", err)
	}
	if err := f.svc.Logout(ctx, ""); err != nil || f.svc.Logout(ctx, "unknown") != nil {
		t.Error("logging out without or with an unknown token must not fail")
	}
}

func TestAuthenticateReadsTheUserFresh(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	s, _ := f.svc.Login(ctx, "ada@example.com", "admin-password", "10.0.0.2", "")

	u, err := f.svc.Authenticate(ctx, s.AccessToken)
	if err != nil || u.Email != "ada@example.com" {
		t.Fatalf("authenticate: %v %v", u, err)
	}

	// Add a second admin so the last-admin guard allows deactivating the first.
	hash, _ := HashPassword("second-password", 4)
	_, _ = f.users.Create(ctx, users.NewUser{Name: "Bo", Email: "bo@example.com", Role: users.RoleAdmin, PasswordHash: hash})
	_, _ = f.pool.Exec(ctx, `UPDATE users SET active = false WHERE id = $1::uuid`, f.admin.ID)
	if _, err := f.svc.Authenticate(ctx, s.AccessToken); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("a deactivated user's still-valid token must be refused: %v", err)
	}
	if _, err := f.svc.Authenticate(ctx, "garbage"); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("garbage: %v", err)
	}
}

func TestChangePassword(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	old, _ := f.svc.Login(ctx, "ada@example.com", "admin-password", "10.0.0.3", "")

	if _, err := f.svc.ChangePassword(ctx, f.admin.ID, "wrong-current", "brand-new-password", ""); !errors.Is(err, ErrWrongPassword) {
		t.Errorf("wrong current: %v", err)
	}
	if _, err := f.svc.ChangePassword(ctx, f.admin.ID, "admin-password", "short", ""); !errors.Is(err, ErrPasswordTooShort) {
		t.Errorf("weak new: %v", err)
	}

	s, err := f.svc.ChangePassword(ctx, f.admin.ID, "admin-password", "brand-new-password", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Refresh(ctx, old.RefreshToken, ""); !errors.Is(err, ErrInvalidToken) {
		t.Error("other sessions must end on a password change")
	}
	if _, err := f.svc.Refresh(ctx, s.RefreshToken, ""); err != nil {
		t.Errorf("the caller's new session must work: %v", err)
	}
	if _, err := f.svc.Login(ctx, "ada@example.com", "admin-password", "10.0.0.4", ""); !errors.Is(err, ErrInvalidCredentials) {
		t.Error("the old password still works")
	}
	if _, err := f.svc.Login(ctx, "ada@example.com", "brand-new-password", "10.0.0.5", ""); err != nil {
		t.Errorf("the new password does not work: %v", err)
	}
}

func TestDeleteExpired(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	_, _ = f.svc.Login(ctx, "ada@example.com", "admin-password", "10.0.0.6", "")
	_, _ = f.pool.Exec(ctx, `UPDATE refresh_tokens SET expires_at = now() - interval '8 days'`)
	n, err := f.refresh.DeleteExpired(ctx)
	if err != nil || n != 1 {
		t.Fatalf("deleted %d, err %v", n, err)
	}
}

func TestUserAgentIsTruncated(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if _, err := f.svc.Login(ctx, "ada@example.com", "admin-password", "10.0.0.7", strings.Repeat("x", 1000)); err != nil {
		t.Fatal(err)
	}
}
