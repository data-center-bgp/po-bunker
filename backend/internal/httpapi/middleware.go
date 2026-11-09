package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const requestIDKey = "request_id"

// RequestID returns the id attached by requestIDMiddleware ("" if none).
func RequestID(c *gin.Context) string {
	return c.GetString(requestIDKey)
}

// requestIDMiddleware keeps a caller-supplied X-Request-Id (so Nginx can pass
// its own) or makes a new one, and echoes it back.
func requestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-Id")
		if len(id) == 0 || len(id) > 64 {
			var b [8]byte
			_, _ = rand.Read(b[:])
			id = hex.EncodeToString(b[:])
		}
		c.Set(requestIDKey, id)
		c.Header("X-Request-Id", id)
		c.Next()
	}
}

// accessLogMiddleware writes one structured line per request.
func accessLogMiddleware(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		path := c.FullPath() // the route pattern, not the raw URL, to keep ids out of the log keys
		if path == "" {
			path = "unmatched"
		}
		log.Info("request",
			"method", c.Request.Method,
			"path", path,
			"status", c.Writer.Status(),
			"duration_ms", time.Since(start).Milliseconds(),
			"ip", c.ClientIP(),
			"request_id", RequestID(c),
		)
	}
}

// recoveryMiddleware turns a panic into the standard JSON 500.
func recoveryMiddleware(log *slog.Logger) gin.HandlerFunc {
	// Gin's own recovery logger is silenced: we log the panic ourselves, once, as structured JSON.
	return gin.CustomRecoveryWithWriter(io.Discard, func(c *gin.Context, recovered any) {
		log.Error("panic recovered",
			"panic", recovered,
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"request_id", RequestID(c),
		)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": ErrInternal})
	})
}

// secureHeadersMiddleware sets the response headers an API should always send.
func secureHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		c.Next()
	}
}
