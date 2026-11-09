// Package accounts is user management for admins: create a user with a
// password, rename, change role, deactivate, reset a password.
package accounts

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

var (
	// ErrCannotChangeSelf: an admin may rename themselves, but not change their own role or deactivate themselves.
	ErrCannotChangeSelf = errors.New("you cannot change your own role or deactivate yourself")
	// ErrLastAdmin: there must always be one active admin.
	ErrLastAdmin = errors.New("there must always be one active admin")
)

// InvalidError is a rejected input field.
type InvalidError struct{ Field, Message string }

func (e *InvalidError) Error() string { return e.Field + " " + e.Message }

func invalid(field, msg string) error { return &InvalidError{Field: field, Message: msg} }

const maxNameLength = 120

type Manager struct {
	users   *users.Store
	refresh *auth.RefreshStore
	cost    int
}

// New builds the manager. cost is the bcrypt cost (0 means the production default).
func New(u *users.Store, refresh *auth.RefreshStore, cost int) *Manager {
	if cost == 0 {
		cost = auth.BcryptCost
	}
	return &Manager{users: u, refresh: refresh, cost: cost}
}

func (m *Manager) List(ctx context.Context) ([]users.User, error) { return m.users.List(ctx) }

type CreateInput struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Password string `json:"password"`
}

func validName(name string) (string, error) {
	n := strings.TrimSpace(name)
	if n == "" {
		return "", invalid("name", "is required")
	}
	if utf8.RuneCountInString(n) > maxNameLength {
		return "", invalid("name", "is too long")
	}
	return n, nil
}

var emailPattern = func(s string) bool {
	at := strings.LastIndex(s, "@")
	return at > 0 && at < len(s)-3 && strings.Contains(s[at:], ".") && !strings.ContainsAny(s, " \t\r\n") && len(s) <= 254
}

// Create adds a user who can sign in straight away.
func (m *Manager) Create(ctx context.Context, in CreateInput) (*users.User, error) {
	email := users.NormalizeEmail(in.Email)
	if !emailPattern(email) {
		return nil, invalid("email", "is not a valid email address")
	}
	name, err := validName(in.Name)
	if err != nil {
		return nil, err
	}
	role := users.Role(in.Role)
	if !role.Valid() {
		return nil, invalid("role", "must be admin, staff or viewer")
	}
	hash, err := auth.HashPassword(in.Password, m.cost)
	if err != nil {
		return nil, err // auth.ErrPasswordTooShort / ErrPasswordTooLong
	}
	return m.users.Create(ctx, users.NewUser{Name: name, Email: email, Role: role, PasswordHash: hash})
}

type UpdateInput struct {
	Name   string `json:"name"`
	Role   string `json:"role"`
	Active *bool  `json:"active"`
}

// Update renames a user, changes the role or switches access off. actorID is
// the signed-in admin: they cannot demote or deactivate themselves.
func (m *Manager) Update(ctx context.Context, actorID, id string, in UpdateInput) (*users.User, error) {
	name, err := validName(in.Name)
	if err != nil {
		return nil, err
	}
	role := users.Role(in.Role)
	if !role.Valid() {
		return nil, invalid("role", "must be admin, staff or viewer")
	}
	if in.Active == nil {
		return nil, invalid("active", "is required")
	}

	current, err := m.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if id == actorID && (role != current.Role || !*in.Active) {
		return nil, ErrCannotChangeSelf
	}

	u, err := m.users.Update(ctx, id, name, role, *in.Active)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && strings.Contains(pg.Message, "last active admin") {
		return nil, ErrLastAdmin
	}
	if err != nil {
		return nil, err
	}
	if !u.Active {
		// Access is already refused on the next request; ending the sessions cleans up.
		_ = m.refresh.RevokeAll(ctx, u.ID)
	}
	return u, nil
}

// ResetPassword sets a new password and ends every session of that user.
func (m *Manager) ResetPassword(ctx context.Context, id, password string) error {
	hash, err := auth.HashPassword(password, m.cost)
	if err != nil {
		return err
	}
	if err := m.users.SetPassword(ctx, id, hash); err != nil {
		return err
	}
	return m.refresh.RevokeAll(ctx, id)
}
