package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

const userKey = "current_user"

var errInvalidToken = NewError(http.StatusUnauthorized, "invalid_token", "The session is invalid or has expired")

// CurrentUser returns the signed-in user set by the Authenticate middleware.
func CurrentUser(c *gin.Context) *users.User {
	u, _ := c.Get(userKey)
	user, _ := u.(*users.User)
	return user
}

// Authenticate requires a valid Bearer access token. The user is read from the
// database on every request, so deactivation and role changes apply at once.
func Authenticate(svc *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		scheme, token, ok := strings.Cut(c.GetHeader("Authorization"), " ")
		if !ok || !strings.EqualFold(scheme, "Bearer") || strings.TrimSpace(token) == "" {
			Fail(c, ErrUnauthorized)
			return
		}
		u, err := svc.Authenticate(c.Request.Context(), strings.TrimSpace(token))
		if errors.Is(err, auth.ErrInvalidToken) {
			Fail(c, errInvalidToken)
			return
		}
		if err != nil {
			Fail(c, err)
			return
		}
		c.Set(userKey, u)
		c.Next()
	}
}

// RequireRole allows only the listed roles. Use it after Authenticate.
func RequireRole(roles ...users.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := CurrentUser(c)
		if u == nil {
			Fail(c, ErrUnauthorized)
			return
		}
		for _, r := range roles {
			if u.Role == r {
				c.Next()
				return
			}
		}
		Fail(c, ErrForbidden)
	}
}

// RequireWrite allows admin and staff (everything that changes data).
func RequireWrite() gin.HandlerFunc { return RequireRole(users.RoleAdmin, users.RoleStaff) }

// RequireAdmin allows admins only.
func RequireAdmin() gin.HandlerFunc { return RequireRole(users.RoleAdmin) }
