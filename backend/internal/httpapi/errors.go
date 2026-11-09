package httpapi

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

// APIError is the error every endpoint answers with:
//
//	{ "error": { "code": "order_not_submitted", "message": "..." } }
//
// The code is stable and is what the frontend translates; the message is a
// plain English fallback.
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string { return e.Code + ": " + e.Message }

func NewError(status int, code, message string) *APIError {
	return &APIError{Status: status, Code: code, Message: message}
}

var (
	ErrUnauthorized = NewError(http.StatusUnauthorized, "unauthorized", "Sign in required")
	ErrForbidden    = NewError(http.StatusForbidden, "forbidden", "You are not allowed to do this")
	ErrNotFound     = NewError(http.StatusNotFound, "not_found", "Not found")
	ErrInternal     = NewError(http.StatusInternalServerError, "internal_error", "Something went wrong")
)

// Fail writes err as the JSON error body and aborts the request. Anything that
// is not an *APIError is logged and answered as a generic 500, so internals
// never leak to the client.
func Fail(c *gin.Context, err error) {
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		slog.Error("unhandled error",
			"error", err,
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"request_id", RequestID(c),
		)
		apiErr = ErrInternal
	}
	c.AbortWithStatusJSON(apiErr.Status, gin.H{"error": apiErr})
}
