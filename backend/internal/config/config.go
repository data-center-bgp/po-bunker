// Package config reads the service settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// Env is "development" or "production". Production demands real secrets
	// and secure cookies.
	Env  string
	Port string

	DatabaseURL string
	DBMaxConns  int32

	JWTSecret         string
	FileSigningSecret string
	AccessTokenTTL    time.Duration
	RefreshTokenTTL   time.Duration
	CookieSecure      bool

	// FilesDir holds uploaded logos and Delivery Order files.
	FilesDir string

	// TrustedProxies are the proxies (the local Nginx) whose X-Forwarded-For
	// is believed when working out the client IP.
	TrustedProxies []string

	VesselAPIURL   string
	VesselAPIToken string
}

const minSecretLength = 32

func (c Config) IsProduction() bool { return c.Env == "production" }

// Load reads the configuration from the environment (see .env.example).
func Load() (Config, error) {
	return load(os.Getenv)
}

func load(get func(string) string) (Config, error) {
	str := func(key, def string) string {
		if v := strings.TrimSpace(get(key)); v != "" {
			return v
		}
		return def
	}

	cfg := Config{
		Env:               str("APP_ENV", "development"),
		Port:              str("PORT", "8080"),
		DatabaseURL:       str("DATABASE_URL", ""),
		JWTSecret:         str("JWT_SECRET", ""),
		FileSigningSecret: str("FILE_SIGNING_SECRET", ""),
		FilesDir:          str("FILES_DIR", "./data/files"),
		VesselAPIURL:      str("VESSEL_API_URL", "https://sms.barokahmarineconsulting.com/api/csbd/ships"),
		VesselAPIToken:    str("VESSEL_API_TOKEN", ""),
	}

	var errs []error

	if cfg.Env != "development" && cfg.Env != "production" {
		errs = append(errs, fmt.Errorf("APP_ENV must be development or production, got %q", cfg.Env))
	}

	if n, err := strconv.Atoi(str("DB_MAX_CONNS", "10")); err != nil || n < 1 || n > 100 {
		errs = append(errs, errors.New("DB_MAX_CONNS must be a number between 1 and 100"))
	} else {
		cfg.DBMaxConns = int32(n)
	}

	var err error
	if cfg.AccessTokenTTL, err = duration(str("ACCESS_TOKEN_TTL", "15m")); err != nil {
		errs = append(errs, fmt.Errorf("ACCESS_TOKEN_TTL: %w", err))
	}
	if cfg.RefreshTokenTTL, err = duration(str("REFRESH_TOKEN_TTL", "720h")); err != nil {
		errs = append(errs, fmt.Errorf("REFRESH_TOKEN_TTL: %w", err))
	}

	// Secure cookies are the default in production; development over plain
	// http://localhost needs them off.
	secureDefault := "false"
	if cfg.IsProduction() {
		secureDefault = "true"
	}
	if cfg.CookieSecure, err = strconv.ParseBool(str("COOKIE_SECURE", secureDefault)); err != nil {
		errs = append(errs, errors.New("COOKIE_SECURE must be true or false"))
	}

	for _, p := range strings.Split(str("TRUSTED_PROXIES", "127.0.0.1,::1,172.16.0.0/12"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			cfg.TrustedProxies = append(cfg.TrustedProxies, p)
		}
	}

	if cfg.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}
	if cfg.IsProduction() {
		if len(cfg.JWTSecret) < minSecretLength {
			errs = append(errs, fmt.Errorf("JWT_SECRET must be at least %d characters in production", minSecretLength))
		}
		if len(cfg.FileSigningSecret) < minSecretLength {
			errs = append(errs, fmt.Errorf("FILE_SIGNING_SECRET must be at least %d characters in production", minSecretLength))
		}
		if !cfg.CookieSecure {
			errs = append(errs, errors.New("COOKIE_SECURE must be true in production"))
		}
	} else {
		// Fixed development secrets keep sessions alive across restarts.
		if cfg.JWTSecret == "" {
			cfg.JWTSecret = "development-only-jwt-secret-change-me-0000"
		}
		if cfg.FileSigningSecret == "" {
			cfg.FileSigningSecret = "development-only-file-secret-change-me-00"
		}
	}

	if err := errors.Join(errs...); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func duration(s string) (time.Duration, error) {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 0, err
	}
	if d <= 0 {
		return 0, errors.New("must be positive")
	}
	return d, nil
}
