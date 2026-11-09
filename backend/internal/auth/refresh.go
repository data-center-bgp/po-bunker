package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// reuseGrace is how long after a rotation the old token still counts as a
// harmless race (two browser tabs refreshing together) instead of theft.
const reuseGrace = 10 * time.Second

// RefreshStore keeps the opaque refresh tokens. Only the SHA-256 of a token is
// stored, so a database leak does not hand out live sessions.
type RefreshStore struct {
	pool *pgxpool.Pool
	ttl  time.Duration
	now  func() time.Time
}

func NewRefreshStore(pool *pgxpool.Pool, ttl time.Duration) *RefreshStore {
	return &RefreshStore{pool: pool, ttl: ttl, now: time.Now}
}

func newRawToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// executor is satisfied by both the pool and a transaction.
type executor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func (s *RefreshStore) insert(ctx context.Context, q executor, userID, userAgent string) (string, time.Time, error) {
	raw, err := newRawToken()
	if err != nil {
		return "", time.Time{}, err
	}
	exp := s.now().Add(s.ttl)
	if len(userAgent) > 255 {
		userAgent = userAgent[:255]
	}
	_, err = q.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
		 VALUES ($1::uuid, $2, $3, NULLIF($4, ''))`,
		userID, hashToken(raw), exp, userAgent)
	if err != nil {
		return "", time.Time{}, err
	}
	return raw, exp, nil
}

// Issue creates a token for the user. The raw value is returned once and never
// stored.
func (s *RefreshStore) Issue(ctx context.Context, userID, userAgent string) (string, time.Time, error) {
	return s.insert(ctx, s.pool, userID, userAgent)
}

// Rotate exchanges a valid token for a new one (the old one is revoked). It
// returns the owner's id. A token that was already rotated, long ago, is
// treated as stolen and every session of that user is revoked.
func (s *RefreshStore) Rotate(ctx context.Context, raw, userAgent string) (userID, newRaw string, exp time.Time, err error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", "", time.Time{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		id      int64
		expires time.Time
		revoked *time.Time
	)
	err = tx.QueryRow(ctx,
		`SELECT id, user_id::text, expires_at, revoked_at
		 FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, hashToken(raw)).
		Scan(&id, &userID, &expires, &revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", time.Time{}, ErrInvalidToken
	}
	if err != nil {
		return "", "", time.Time{}, err
	}

	now := s.now()
	if revoked != nil {
		if now.Sub(*revoked) > reuseGrace {
			if _, err := tx.Exec(ctx,
				`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL`, userID); err != nil {
				return "", "", time.Time{}, err
			}
			if err := tx.Commit(ctx); err != nil {
				return "", "", time.Time{}, err
			}
		}
		return "", "", time.Time{}, ErrInvalidToken
	}
	if !expires.After(now) {
		return "", "", time.Time{}, ErrInvalidToken
	}

	if _, err := tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, id); err != nil {
		return "", "", time.Time{}, err
	}
	newRaw, exp, err = s.insert(ctx, tx, userID, userAgent)
	if err != nil {
		return "", "", time.Time{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", "", time.Time{}, err
	}
	return userID, newRaw, exp, nil
}

// Revoke ends one session (logout). An unknown token is not an error.
func (s *RefreshStore) Revoke(ctx context.Context, raw string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, hashToken(raw))
	return err
}

// RevokeAll ends every session of a user (password change, deactivation).
func (s *RefreshStore) RevokeAll(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL`, userID)
	return err
}

// DeleteExpired removes tokens that expired more than a week ago.
func (s *RefreshStore) DeleteExpired(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'`)
	return tag.RowsAffected(), err
}
