// Command api is the PO Bunker HTTP server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// The Makassar (WITA) time zone is needed for PO numbering and must work
	// in a minimal container without system tzdata.
	_ "time/tzdata"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/data-center-bgp/po-bunker/backend/internal/accounts"
	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/catalog"
	"github.com/data-center-bgp/po-bunker/backend/internal/config"
	"github.com/data-center-bgp/po-bunker/backend/internal/db"
	"github.com/data-center-bgp/po-bunker/backend/internal/files"
	"github.com/data-center-bgp/po-bunker/backend/internal/httpapi"
	"github.com/data-center-bgp/po-bunker/backend/internal/orders"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
	"github.com/data-center-bgp/po-bunker/backend/internal/vessels"
)

func main() {
	// `api healthcheck` is what the container HEALTHCHECK runs: the image has no curl.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("configuration: %w", err)
	}

	var handler slog.Handler = slog.NewTextHandler(os.Stdout, nil)
	if cfg.IsProduction() {
		handler = slog.NewJSONHandler(os.Stdout, nil)
	}
	log := slog.New(handler)
	slog.SetDefault(log)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("DATABASE_URL: %w", err)
	}
	poolCfg.MaxConns = cfg.DBMaxConns
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return fmt.Errorf("database pool: %w", err)
	}
	defer pool.Close()
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		return fmt.Errorf("database unreachable: %w", err)
	}

	if err := db.Migrate(ctx, pool, log); err != nil {
		return err
	}

	userStore := users.NewStore(pool)
	refreshStore := auth.NewRefreshStore(pool, cfg.RefreshTokenTTL)
	authService, err := auth.NewService(
		userStore,
		auth.NewTokenIssuer(cfg.JWTSecret, cfg.AccessTokenTTL),
		refreshStore,
		auth.Options{},
	)
	if err != nil {
		return fmt.Errorf("auth service: %w", err)
	}
	go purgeExpiredTokens(ctx, refreshStore, log)

	fileStore, err := files.New(cfg.FilesDir, cfg.FileSigningSecret)
	if err != nil {
		return fmt.Errorf("file storage: %w", err)
	}

	orderStore := orders.NewStore(pool)

	router, err := httpapi.NewRouter(cfg, httpapi.Deps{
		DB:       pool,
		Auth:     authService,
		Catalog:  catalog.NewStore(pool),
		Users:    userStore,
		Files:    fileStore,
		Orders:   orders.NewService(pool, orderStore, fileStore),
		OrderDB:  orderStore,
		Accounts: accounts.New(userStore, refreshStore, 0),
		Vessels:  vessels.NewSyncer(pool, vessels.NewClient(cfg.VesselAPIURL, cfg.VesselAPIToken)),
	}, log)
	if err != nil {
		return fmt.Errorf("router: %w", err)
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

// purgeExpiredTokens removes long-expired refresh tokens once a day.
func purgeExpiredTokens(ctx context.Context, store *auth.RefreshStore, log *slog.Logger) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if n, err := store.DeleteExpired(ctx); err != nil {
				log.Error("purge refresh tokens", "error", err)
			} else if n > 0 {
				log.Info("purged expired refresh tokens", "count", n)
			}
		}
	}
}
