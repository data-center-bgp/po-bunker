package httpapi

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/data-center-bgp/po-bunker/backend/internal/catalog"
	"github.com/data-center-bgp/po-bunker/backend/internal/orders"
)

// asAPIError converts the errors the data layer produces (not found,
// validation, constraint violations) into API errors. Anything else is
// returned unchanged and ends up as a generic 500 in Fail.
func asAPIError(err error) error {
	var ve *catalog.ValidationError
	if errors.As(err, &ve) {
		e := NewError(http.StatusUnprocessableEntity, "validation_failed", ve.Field+" "+ve.Message)
		e.Field = ve.Field
		return e
	}
	if errors.Is(err, catalog.ErrNotFound) {
		return ErrNotFound
	}
	var re *orders.RuleError
	if errors.As(err, &re) {
		status := http.StatusUnprocessableEntity
		if re.Conflict {
			status = http.StatusConflict
		}
		e := NewError(status, re.Code, re.Message)
		e.Field = re.Field
		return e
	}
	if errors.Is(err, orders.ErrNotFound) {
		return ErrNotFound
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Code {
		case "23505": // unique_violation
			return NewError(http.StatusConflict, "duplicate", "A record with the same unique value already exists")
		case "23503": // foreign_key_violation
			return NewError(http.StatusUnprocessableEntity, "invalid_reference", "A referenced record does not exist, or this record is still in use")
		case "23514": // check_violation
			return NewError(http.StatusUnprocessableEntity, "invalid_value", "A value is not allowed")
		case "23502": // not_null_violation
			return NewError(http.StatusUnprocessableEntity, "missing_value", "A required value is missing")
		case "22P02", "22003", "22001": // bad text representation, out of range, too long
			return NewError(http.StatusBadRequest, "invalid_value", "A value has the wrong format or is out of range")
		}
	}
	return err
}
