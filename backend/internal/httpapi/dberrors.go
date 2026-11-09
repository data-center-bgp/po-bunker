package httpapi

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/data-center-bgp/po-bunker/backend/internal/accounts"
	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/catalog"
	"github.com/data-center-bgp/po-bunker/backend/internal/orders"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
	"github.com/data-center-bgp/po-bunker/backend/internal/vessels"
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
	var ie *accounts.InvalidError
	if errors.As(err, &ie) {
		e := NewError(http.StatusUnprocessableEntity, "validation_failed", ie.Field+" "+ie.Message)
		e.Field = ie.Field
		return e
	}
	var up *vessels.UpstreamError
	if errors.As(err, &up) {
		status := http.StatusBadGateway
		if up.NotConfigured {
			status = http.StatusInternalServerError
		}
		return NewError(status, up.Code, up.Message)
	}
	switch {
	case errors.Is(err, accounts.ErrCannotChangeSelf):
		return NewError(http.StatusConflict, "cannot_change_self", "You cannot change your own role or deactivate yourself")
	case errors.Is(err, accounts.ErrLastAdmin):
		return NewError(http.StatusConflict, "last_admin", "There must always be one active admin")
	case errors.Is(err, users.ErrEmailTaken):
		return NewError(http.StatusConflict, "email_taken", "This email already has an account")
	case errors.Is(err, users.ErrNotFound):
		return ErrNotFound
	case errors.Is(err, auth.ErrPasswordTooShort), errors.Is(err, auth.ErrPasswordTooLong):
		return NewError(http.StatusBadRequest, "weak_password", err.Error())
	case errors.Is(err, vessels.ErrEmptyList):
		return NewError(http.StatusUnprocessableEntity, "empty_ship_list", "The vessel API returned no ships, nothing was changed")
	case errors.Is(err, vessels.ErrNoValidShips):
		return NewError(http.StatusUnprocessableEntity, "no_valid_ships", "The vessel API returned no usable ships (each needs a numeric id and a name)")
	case errors.Is(err, vessels.ErrSyncRunning):
		return NewError(http.StatusConflict, "sync_in_progress", "A vessel sync is already running")
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
