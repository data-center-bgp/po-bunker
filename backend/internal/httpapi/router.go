// Package httpapi holds the Gin router, middleware and handlers.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/data-center-bgp/po-bunker/backend/internal/config"
)

// Pinger is what the health check needs from the database pool.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Deps are the services the handlers use. It grows with each phase.
type Deps struct {
	DB Pinger
}

// NewRouter builds the Gin engine. It uses gin.New(), not gin.Default(), so
// logging and recovery are ours and the JSON error format stays uniform.
func NewRouter(cfg config.Config, deps Deps, log *slog.Logger) (*gin.Engine, error) {
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		return nil, err
	}
	// Bad paths and methods answer with the same JSON error shape.
	r.HandleMethodNotAllowed = true
	r.NoRoute(func(c *gin.Context) { Fail(c, ErrNotFound) })
	r.NoMethod(func(c *gin.Context) {
		Fail(c, NewError(http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed"))
	})

	r.Use(requestIDMiddleware(), accessLogMiddleware(log), recoveryMiddleware(log), secureHeadersMiddleware())

	r.GET("/healthz", healthHandler(deps.DB))

	// Everything else hangs off /api/v1 and is added by later phases.
	_ = r.Group("/api/v1")

	return r, nil
}

func healthHandler(db Pinger) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			slog.Error("health check: database unreachable", "error", err)
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
}
