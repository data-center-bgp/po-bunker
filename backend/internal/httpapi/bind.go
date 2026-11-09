package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

const maxJSONBody = 1 << 20 // 1 MB; file uploads have their own limit

var errInvalidBody = NewError(http.StatusBadRequest, "invalid_request", "The request body is not valid JSON for this endpoint")

// bindJSON decodes the request body into dst strictly: unknown fields and
// trailing data are refused. It answers 400 itself and returns false on failure.
func bindJSON(c *gin.Context, dst any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxJSONBody)
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		Fail(c, errInvalidBody)
		return false
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		Fail(c, errInvalidBody)
		return false
	}
	return true
}
