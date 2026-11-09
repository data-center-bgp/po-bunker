// Package auth handles passwords, access tokens (JWT), refresh tokens and the
// login rate limit.
package auth

import (
	"crypto/rand"
	"errors"
	"math/big"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	// BcryptCost is the production work factor. Tests pass a lower one.
	BcryptCost = 12

	MinPasswordLength = 8
	// bcrypt silently ignores everything after 72 bytes, so longer passwords
	// are refused instead of being truncated.
	maxPasswordBytes = 72
)

var (
	ErrPasswordTooShort = errors.New("password must be at least 8 characters")
	ErrPasswordTooLong  = errors.New("password must be at most 72 bytes")
)

func ValidatePassword(pw string) error {
	if utf8.RuneCountInString(pw) < MinPasswordLength {
		return ErrPasswordTooShort
	}
	if len(pw) > maxPasswordBytes {
		return ErrPasswordTooLong
	}
	return nil
}

func HashPassword(pw string, cost int) (string, error) {
	if err := ValidatePassword(pw); err != nil {
		return "", err
	}
	b, err := bcrypt.GenerateFromPassword([]byte(pw), cost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// CheckPassword reports whether pw matches the bcrypt hash.
func CheckPassword(hash, pw string) bool {
	if len(pw) > maxPasswordBytes {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// RandomPassword returns a random password without look-alike characters, for
// the admin CLI when no password is given.
func RandomPassword(n int) (string, error) {
	const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	out := make([]byte, n)
	for i := range out {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		out[i] = alphabet[idx.Int64()]
	}
	return string(out), nil
}
