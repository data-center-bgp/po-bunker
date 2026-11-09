package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
)

const (
	refreshCookie = "po_refresh"
	// The cookie is only ever sent to the auth endpoints.
	refreshCookiePath = "/api/v1/auth"
)

type authHandlers struct {
	svc          *auth.Service
	cookieSecure bool
}

// registerAuth mounts /auth/* on the group.
func registerAuth(g *gin.RouterGroup, svc *auth.Service, cookieSecure bool) {
	h := &authHandlers{svc: svc, cookieSecure: cookieSecure}
	g.POST("/auth/login", h.login)
	g.POST("/auth/refresh", h.refresh)
	g.POST("/auth/logout", h.logout)
	protected := g.Group("/auth", Authenticate(svc))
	protected.GET("/me", h.me)
	protected.POST("/change-password", h.changePassword)
}

type sessionBody struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	User        any    `json:"user"`
}

func (h *authHandlers) respondSession(c *gin.Context, s *auth.Session) {
	h.setRefreshCookie(c, s.RefreshToken, s.RefreshExpires)
	c.JSON(http.StatusOK, sessionBody{
		AccessToken: s.AccessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int(time.Until(s.AccessExpires).Seconds()),
		User:        s.User,
	})
}

func (h *authHandlers) setRefreshCookie(c *gin.Context, value string, expires time.Time) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     refreshCookie,
		Value:    value,
		Path:     refreshCookiePath,
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

func (h *authHandlers) clearRefreshCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     refreshCookie,
		Value:    "",
		Path:     refreshCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

// failAuth maps the auth package's errors onto API errors.
func failAuth(c *gin.Context, err error) {
	var limited *auth.RateLimitedError
	switch {
	case errors.As(err, &limited):
		secs := int(limited.RetryAfter.Seconds())
		if secs < 1 {
			secs = 1
		}
		c.Header("Retry-After", strconv.Itoa(secs))
		Fail(c, NewError(http.StatusTooManyRequests, "too_many_attempts", "Too many attempts, try again later"))
	case errors.Is(err, auth.ErrInvalidCredentials):
		Fail(c, NewError(http.StatusUnauthorized, "invalid_credentials", "Invalid email or password"))
	case errors.Is(err, auth.ErrInvalidToken):
		Fail(c, errInvalidToken)
	case errors.Is(err, auth.ErrWrongPassword):
		Fail(c, NewError(http.StatusBadRequest, "wrong_password", "The current password is incorrect"))
	case errors.Is(err, auth.ErrPasswordTooShort), errors.Is(err, auth.ErrPasswordTooLong):
		Fail(c, NewError(http.StatusBadRequest, "weak_password", err.Error()))
	default:
		Fail(c, err)
	}
}

func (h *authHandlers) login(c *gin.Context) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !bindJSON(c, &in) {
		return
	}
	if strings.TrimSpace(in.Email) == "" || in.Password == "" {
		Fail(c, NewError(http.StatusBadRequest, "invalid_request", "Email and password are required"))
		return
	}
	s, err := h.svc.Login(c.Request.Context(), in.Email, in.Password, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		failAuth(c, err)
		return
	}
	h.respondSession(c, s)
}

func (h *authHandlers) refresh(c *gin.Context) {
	raw, err := c.Cookie(refreshCookie)
	if err != nil || raw == "" {
		Fail(c, ErrUnauthorized)
		return
	}
	s, err := h.svc.Refresh(c.Request.Context(), raw, c.Request.UserAgent())
	if err != nil {
		if errors.Is(err, auth.ErrInvalidToken) {
			h.clearRefreshCookie(c)
		}
		failAuth(c, err)
		return
	}
	h.respondSession(c, s)
}

func (h *authHandlers) logout(c *gin.Context) {
	if raw, err := c.Cookie(refreshCookie); err == nil {
		if err := h.svc.Logout(c.Request.Context(), raw); err != nil {
			Fail(c, err)
			return
		}
	}
	h.clearRefreshCookie(c)
	c.Status(http.StatusNoContent)
}

func (h *authHandlers) me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"user": CurrentUser(c)})
}

func (h *authHandlers) changePassword(c *gin.Context) {
	var in struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !bindJSON(c, &in) {
		return
	}
	s, err := h.svc.ChangePassword(c.Request.Context(), CurrentUser(c).ID, in.CurrentPassword, in.NewPassword, c.Request.UserAgent())
	if err != nil {
		failAuth(c, err)
		return
	}
	h.respondSession(c, s)
}
