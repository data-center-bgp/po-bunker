// Package users holds the user model and its database access.
package users

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleStaff  Role = "staff"
	RoleViewer Role = "viewer"
)

func (r Role) Valid() bool { return r == RoleAdmin || r == RoleStaff || r == RoleViewer }

// CanWrite is true for admin and staff (viewers only read).
func (r Role) CanWrite() bool { return r == RoleAdmin || r == RoleStaff }

type User struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Role         Role       `json:"role"`
	Active       bool       `json:"active"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	PasswordHash string     `json:"-"`
}

var (
	ErrNotFound   = errors.New("user not found")
	ErrEmailTaken = errors.New("email already in use")
)

// NormalizeEmail lower-cases and trims, which is how emails are stored.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const userColumns = `id::text, name, email, role, active, last_login_at, created_at, password_hash`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	var role string
	err := row.Scan(&u.ID, &u.Name, &u.Email, &role, &u.Active, &u.LastLoginAt, &u.CreatedAt, &u.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	u.Role = Role(role)
	return &u, nil
}

func (s *Store) GetByID(ctx context.Context, id string) (*User, error) {
	// A malformed id can never match; answering "not found" avoids a cast error.
	row := s.pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE id::text = $1`, id)
	return scanUser(row)
}

func (s *Store) GetByEmail(ctx context.Context, email string) (*User, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE email = $1`, NormalizeEmail(email))
	return scanUser(row)
}

type NewUser struct {
	Name         string
	Email        string
	Role         Role
	PasswordHash string
}

func (s *Store) Create(ctx context.Context, in NewUser) (*User, error) {
	row := s.pool.QueryRow(ctx,
		`INSERT INTO users (name, email, role, password_hash)
		 VALUES ($1, $2, $3, $4)
		 RETURNING `+userColumns,
		strings.TrimSpace(in.Name), NormalizeEmail(in.Email), string(in.Role), in.PasswordHash)
	u, err := scanUser(row)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return nil, ErrEmailTaken
	}
	return u, err
}

// Requester is a person that can be picked as "Requested By".
type Requester struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ListRequesters returns the active users (id and name only).
func (s *Store) ListRequesters(ctx context.Context) ([]Requester, error) {
	rows, err := s.pool.Query(ctx, `SELECT id::text, name FROM users WHERE active ORDER BY name, id`)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Requester, error) {
		var r Requester
		err := row.Scan(&r.ID, &r.Name)
		return r, err
	})
	if out == nil {
		out = []Requester{}
	}
	return out, err
}

func (s *Store) SetPassword(ctx context.Context, id, hash string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id::text = $1`, id, hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) TouchLogin(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id::text = $1`, id)
	return err
}
