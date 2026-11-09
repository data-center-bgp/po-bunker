package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/data-center-bgp/po-bunker/backend/internal/accounts"
	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/catalog"
	"github.com/data-center-bgp/po-bunker/backend/internal/vessels"
)

// registerUsers mounts user management (admins only).
func registerUsers(g *gin.RouterGroup, authSvc *auth.Service, mgr *accounts.Manager) {
	r := g.Group("/users", Authenticate(authSvc), RequireAdmin())

	r.GET("", func(c *gin.Context) {
		list, err := mgr.List(c.Request.Context())
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, list)
	})
	r.POST("", createJSON(mgr.Create))
	r.PUT("/:id", func(c *gin.Context) {
		var in accounts.UpdateInput
		if !bindJSON(c, &in) {
			return
		}
		u, err := mgr.Update(c.Request.Context(), CurrentUser(c).ID, c.Param("id"), in)
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, u)
	})
	r.POST("/:id/reset-password", func(c *gin.Context) {
		var in struct {
			Password string `json:"password"`
		}
		if !bindJSON(c, &in) {
			return
		}
		if err := mgr.ResetPassword(c.Request.Context(), c.Param("id"), in.Password); err != nil {
			Fail(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	})
}

// registerVesselAdmin mounts the vessel sync (admin and staff) and the vessel
// code editor (admin).
func registerVesselAdmin(g *gin.RouterGroup, authSvc *auth.Service, syncer *vessels.Syncer, store *catalog.Store) {
	r := g.Group("", Authenticate(authSvc))
	r.POST("/vessels/sync", RequireWrite(), func(c *gin.Context) {
		res, err := syncer.Run(c.Request.Context())
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, res)
	})
	r.PUT("/vessels/:id/code", RequireAdmin(), updateJSON(store.SetVesselCode))
}
