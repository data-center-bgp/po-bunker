package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestPasswordPolicy(t *testing.T) {
	if err := ValidatePassword("short"); err != ErrPasswordTooShort {
		t.Errorf("short: %v", err)
	}
	if err := ValidatePassword(strings.Repeat("a", 73)); err != ErrPasswordTooLong {
		t.Errorf("long: %v", err)
	}
	if err := ValidatePassword("long enough"); err != nil {
		t.Errorf("ok: %v", err)
	}
	// 8 runes of 2 bytes each is fine; the limit is bytes only at the top end.
	if err := ValidatePassword("éééééééé"); err != nil {
		t.Errorf("multibyte: %v", err)
	}
}

func TestPasswordHashAndCheck(t *testing.T) {
	hash, err := HashPassword("correct horse", 4)
	if err != nil {
		t.Fatal(err)
	}
	if hash == "correct horse" || !strings.HasPrefix(hash, "$2") {
		t.Fatalf("not a bcrypt hash: %q", hash)
	}
	if !CheckPassword(hash, "correct horse") {
		t.Error("right password rejected")
	}
	if CheckPassword(hash, "wrong") || CheckPassword(hash, "") {
		t.Error("wrong password accepted")
	}
	if CheckPassword(hash, strings.Repeat("x", 100)) {
		t.Error("over-long password accepted")
	}
	if _, err := HashPassword("short", 4); err == nil {
		t.Error("hashing a weak password must fail")
	}
}

func TestRandomPassword(t *testing.T) {
	a, _ := RandomPassword(20)
	b, _ := RandomPassword(20)
	if len(a) != 20 || a == b {
		t.Errorf("got %q and %q", a, b)
	}
	if strings.ContainsAny(a, "0O1lI") {
		t.Errorf("look-alike characters in %q", a)
	}
}

func TestAccessTokenRoundTrip(t *testing.T) {
	iss := NewTokenIssuer(strings.Repeat("k", 32), 15*time.Minute)
	tok, exp, err := iss.IssueAccess("user-1", "staff")
	if err != nil {
		t.Fatal(err)
	}
	if time.Until(exp) < 14*time.Minute {
		t.Errorf("expiry too soon: %v", exp)
	}
	id, err := iss.ParseAccess(tok)
	if err != nil || id != "user-1" {
		t.Fatalf("parse: %q %v", id, err)
	}
}

func TestAccessTokenRejections(t *testing.T) {
	secret := strings.Repeat("k", 32)
	iss := NewTokenIssuer(secret, 15*time.Minute)
	good, _, _ := iss.IssueAccess("user-1", "admin")

	cases := map[string]string{
		"empty":     "",
		"garbage":   "not.a.jwt",
		"tampered":  good[:len(good)-3] + "AAA",
		"wrongKey":  mustSign(t, jwt.SigningMethodHS256, "another-secret-another-secret-0000", "user-1", issuer, time.Hour),
		"wrongIss":  mustSign(t, jwt.SigningMethodHS256, secret, "user-1", "someone-else", time.Hour),
		"expired":   mustSign(t, jwt.SigningMethodHS256, secret, "user-1", issuer, -time.Minute),
		"noSubject": mustSign(t, jwt.SigningMethodHS256, secret, "", issuer, time.Hour),
		"hs512":     mustSign(t, jwt.SigningMethodHS512, secret, "user-1", issuer, time.Hour),
	}
	for name, tok := range cases {
		if _, err := iss.ParseAccess(tok); err == nil {
			t.Errorf("%s: token was accepted", name)
		}
	}

	// alg=none must never verify.
	none := jwt.NewWithClaims(jwt.SigningMethodNone, accessClaims{
		RegisteredClaims: jwt.RegisteredClaims{Issuer: issuer, Subject: "user-1", ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))},
	})
	signed, err := none.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := iss.ParseAccess(signed); err == nil {
		t.Error("alg=none token was accepted")
	}
}

func mustSign(t *testing.T, m jwt.SigningMethod, secret, sub, iss string, ttl time.Duration) string {
	t.Helper()
	s, err := jwt.NewWithClaims(m, accessClaims{
		Role: "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: iss, Subject: sub,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
		},
	}).SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestLimiter(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	l := NewLimiter(10*time.Second, 3)
	l.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("attempt %d should pass", i+1)
		}
	}
	ok, wait := l.Allow("a")
	if ok || wait < 9*time.Second || wait > 11*time.Second {
		t.Fatalf("4th attempt: ok=%v wait=%v", ok, wait)
	}
	if ok, _ := l.Allow("b"); !ok {
		t.Error("another key must not be affected")
	}

	now = now.Add(11 * time.Second)
	if ok, _ := l.Allow("a"); !ok {
		t.Error("a token should have refilled")
	}
	if ok, _ := l.Allow("a"); ok {
		t.Error("only one token should have refilled")
	}

	l.Reset("a")
	if ok, _ := l.Allow("a"); !ok {
		t.Error("reset should clear the key")
	}
}

func TestLimiterForgetsIdleKeys(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	l := NewLimiter(time.Second, 1)
	l.now = func() time.Time { return now }
	l.Allow("old")
	now = now.Add(time.Hour)
	l.Allow("new")
	if _, kept := l.entries["old"]; kept {
		t.Error("idle key should have been collected")
	}
}
