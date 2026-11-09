package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadDevelopmentDefaults(t *testing.T) {
	cfg, err := load(env(map[string]string{"DATABASE_URL": "postgres://x"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Env != "development" || cfg.Port != "8080" || cfg.CookieSecure {
		t.Errorf("unexpected defaults: %+v", cfg)
	}
	if cfg.AccessTokenTTL != 15*time.Minute || cfg.RefreshTokenTTL != 720*time.Hour {
		t.Errorf("unexpected token lifetimes: %v %v", cfg.AccessTokenTTL, cfg.RefreshTokenTTL)
	}
	if cfg.JWTSecret == "" || cfg.FileSigningSecret == "" {
		t.Error("development should get fixed secrets")
	}
	if len(cfg.TrustedProxies) != 3 {
		t.Errorf("trusted proxies = %v", cfg.TrustedProxies)
	}
}

func TestLoadRequiresDatabaseURL(t *testing.T) {
	if _, err := load(env(nil)); err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("want DATABASE_URL error, got %v", err)
	}
}

func TestLoadProductionNeedsRealSecrets(t *testing.T) {
	_, err := load(env(map[string]string{
		"APP_ENV": "production", "DATABASE_URL": "postgres://x", "JWT_SECRET": "short",
	}))
	if err == nil {
		t.Fatal("production with weak secrets must fail")
	}
	for _, want := range []string{"JWT_SECRET", "FILE_SIGNING_SECRET"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q should mention %s", err, want)
		}
	}
}

func TestLoadProductionOK(t *testing.T) {
	secret := strings.Repeat("s", 40)
	cfg, err := load(env(map[string]string{
		"APP_ENV": "production", "DATABASE_URL": "postgres://x",
		"JWT_SECRET": secret, "FILE_SIGNING_SECRET": secret,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.CookieSecure {
		t.Error("cookies must be secure by default in production")
	}
}

func TestLoadRejectsBadValues(t *testing.T) {
	_, err := load(env(map[string]string{
		"DATABASE_URL": "postgres://x", "APP_ENV": "staging",
		"DB_MAX_CONNS": "0", "ACCESS_TOKEN_TTL": "-1m", "COOKIE_SECURE": "maybe",
	}))
	if err == nil {
		t.Fatal("expected errors")
	}
	for _, want := range []string{"APP_ENV", "DB_MAX_CONNS", "ACCESS_TOKEN_TTL", "COOKIE_SECURE"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should mention %s: %v", want, err)
		}
	}
}
