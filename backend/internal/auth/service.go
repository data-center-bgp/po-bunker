package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

var (
	// ErrInvalidCredentials is the one answer for an unknown email, a wrong
	// password and a deactivated user, so the response reveals nothing.
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrWrongPassword      = errors.New("current password is incorrect")
)

// RateLimitedError is returned when too many attempts were made.
type RateLimitedError struct{ RetryAfter time.Duration }

func (e *RateLimitedError) Error() string { return "too many attempts" }

// Session is what a successful login or refresh hands back.
type Session struct {
	User           *users.User
	AccessToken    string
	AccessExpires  time.Time
	RefreshToken   string
	RefreshExpires time.Time
}

type Service struct {
	users      *users.Store
	tokens     *TokenIssuer
	refresh    *RefreshStore
	byAccount  *Limiter // per IP + email
	byIP       *Limiter // per IP across accounts (credential stuffing)
	bcryptCost int
	dummyHash  string // compared against when the user does not exist, to even out timing
}

type Options struct {
	BcryptCost int // 0 means BcryptCost (12)
}

func NewService(u *users.Store, tokens *TokenIssuer, refresh *RefreshStore, opts Options) (*Service, error) {
	cost := opts.BcryptCost
	if cost == 0 {
		cost = BcryptCost
	}
	dummy, err := HashPassword("not-a-real-password", cost)
	if err != nil {
		return nil, fmt.Errorf("dummy hash: %w", err)
	}
	return &Service{
		users:      u,
		tokens:     tokens,
		refresh:    refresh,
		byAccount:  NewLimiter(12*time.Second, 5), // 5 quick tries, then one per 12 s
		byIP:       NewLimiter(3*time.Second, 30),
		bcryptCost: cost,
		dummyHash:  dummy,
	}, nil
}

func (s *Service) newSession(ctx context.Context, u *users.User, userAgent string) (*Session, error) {
	access, accessExp, err := s.tokens.IssueAccess(u.ID, string(u.Role))
	if err != nil {
		return nil, err
	}
	refresh, refreshExp, err := s.refresh.Issue(ctx, u.ID, userAgent)
	if err != nil {
		return nil, err
	}
	return &Session{User: u, AccessToken: access, AccessExpires: accessExp, RefreshToken: refresh, RefreshExpires: refreshExp}, nil
}

func (s *Service) Login(ctx context.Context, email, password, ip, userAgent string) (*Session, error) {
	email = users.NormalizeEmail(email)
	key := ip + "|" + email
	if ok, wait := s.byIP.Allow(ip); !ok {
		return nil, &RateLimitedError{RetryAfter: wait}
	}
	if ok, wait := s.byAccount.Allow(key); !ok {
		return nil, &RateLimitedError{RetryAfter: wait}
	}

	u, err := s.users.GetByEmail(ctx, email)
	switch {
	case errors.Is(err, users.ErrNotFound):
		CheckPassword(s.dummyHash, password)
		return nil, ErrInvalidCredentials
	case err != nil:
		return nil, err
	}
	if !CheckPassword(u.PasswordHash, password) || !u.Active {
		return nil, ErrInvalidCredentials
	}

	s.byAccount.Reset(key)
	if err := s.users.TouchLogin(ctx, u.ID); err != nil {
		return nil, err
	}
	return s.newSession(ctx, u, userAgent)
}

// Refresh swaps a refresh token for a new session (and a rotated refresh token).
func (s *Service) Refresh(ctx context.Context, raw, userAgent string) (*Session, error) {
	userID, newRaw, refreshExp, err := s.refresh.Rotate(ctx, raw, userAgent)
	if err != nil {
		return nil, err
	}
	u, err := s.users.GetByID(ctx, userID)
	if errors.Is(err, users.ErrNotFound) || (err == nil && !u.Active) {
		_ = s.refresh.RevokeAll(ctx, userID)
		return nil, ErrInvalidToken
	}
	if err != nil {
		return nil, err
	}
	access, accessExp, err := s.tokens.IssueAccess(u.ID, string(u.Role))
	if err != nil {
		return nil, err
	}
	return &Session{User: u, AccessToken: access, AccessExpires: accessExp, RefreshToken: newRaw, RefreshExpires: refreshExp}, nil
}

func (s *Service) Logout(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	return s.refresh.Revoke(ctx, raw)
}

// ChangePassword checks the current password, sets the new one, ends every
// other session and returns a fresh session for the caller.
func (s *Service) ChangePassword(ctx context.Context, userID, current, next, userAgent string) (*Session, error) {
	if ok, wait := s.byAccount.Allow("pw|" + userID); !ok {
		return nil, &RateLimitedError{RetryAfter: wait}
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !CheckPassword(u.PasswordHash, current) {
		return nil, ErrWrongPassword
	}
	hash, err := HashPassword(next, s.bcryptCost)
	if err != nil {
		return nil, err
	}
	if err := s.users.SetPassword(ctx, u.ID, hash); err != nil {
		return nil, err
	}
	if err := s.refresh.RevokeAll(ctx, u.ID); err != nil {
		return nil, err
	}
	s.byAccount.Reset("pw|" + userID)
	return s.newSession(ctx, u, userAgent)
}

// Authenticate verifies an access token and loads the user fresh from the
// database, so deactivating a user or changing a role takes effect on the next
// request instead of when the token expires.
func (s *Service) Authenticate(ctx context.Context, accessToken string) (*users.User, error) {
	id, err := s.tokens.ParseAccess(accessToken)
	if err != nil {
		return nil, err
	}
	u, err := s.users.GetByID(ctx, id)
	if errors.Is(err, users.ErrNotFound) {
		return nil, ErrInvalidToken
	}
	if err != nil {
		return nil, err
	}
	if !u.Active {
		return nil, ErrInvalidToken
	}
	return u, nil
}

// HashPassword hashes with this service's cost (used by user management).
func (s *Service) HashPassword(pw string) (string, error) { return HashPassword(pw, s.bcryptCost) }
