package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/catalog"
	"github.com/data-center-bgp/po-bunker/backend/internal/files"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

// pathID reads a positive integer :id; anything else is a 404 (no such record).
func pathID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		Fail(c, ErrNotFound)
		return 0, false
	}
	return id, true
}

func listJSON[T any](fn func(context.Context) ([]T, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		items, err := fn(c.Request.Context())
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, items)
	}
}

func createJSON[In, Out any](fn func(context.Context, In) (*Out, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in In
		if !bindJSON(c, &in) {
			return
		}
		out, err := fn(c.Request.Context(), in)
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusCreated, out)
	}
}

func updateJSON[In, Out any](fn func(context.Context, int64, In) (*Out, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := pathID(c)
		if !ok {
			return
		}
		var in In
		if !bindJSON(c, &in) {
			return
		}
		out, err := fn(c.Request.Context(), id, in)
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

// activeOnly reads ?active=true.
func activeOnly(c *gin.Context) bool { return c.Query("active") == "true" }

type catalogHandlers struct {
	store *catalog.Store
	users *users.Store
	files *files.Store
}

// registerCatalog mounts the master data endpoints. Everyone signed in can
// read; admin and staff can create and edit.
func registerCatalog(g *gin.RouterGroup, authSvc *auth.Service, store *catalog.Store, userStore *users.Store, fileStore *files.Store) {
	h := &catalogHandlers{store: store, users: userStore, files: fileStore}
	r := g.Group("", Authenticate(authSvc))
	w := RequireWrite()

	r.GET("/companies", listJSON(store.ListCompanies))
	r.POST("/companies", w, createJSON(store.CreateCompany))
	r.PUT("/companies/:id", w, updateJSON(store.UpdateCompany))
	r.PUT("/companies/:id/logo", w, h.uploadCompanyLogo)
	r.GET("/business-units", listJSON(store.ListBusinessUnits))

	r.GET("/partners", listJSON(store.ListPartners))
	r.POST("/partners", w, createJSON(store.CreatePartner))
	r.PUT("/partners/:id", w, updateJSON(store.UpdatePartner))

	r.GET("/regions", listJSON(store.ListRegions))
	r.POST("/regions", w, createJSON(store.CreateRegion))
	r.PUT("/regions/:id", w, updateJSON(store.UpdateRegion))

	r.GET("/vessels", listJSON(store.ListVessels))

	r.GET("/products", func(c *gin.Context) {
		items, err := store.ListProducts(c.Request.Context(), activeOnly(c))
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, items)
	})
	r.POST("/products", w, createJSON(store.CreateProduct))
	r.PUT("/products/:id", w, updateJSON(store.UpdateProduct))
	r.GET("/product-categories", listJSON(store.ListCategories))

	r.GET("/uoms", listJSON(store.ListUoms))
	r.POST("/uoms", w, createJSON(store.CreateUom))
	r.PUT("/uoms/:id", w, updateJSON(store.UpdateUom))

	r.GET("/code-budgets", func(c *gin.Context) {
		items, err := store.ListCodeBudgets(c.Request.Context(), activeOnly(c))
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, items)
	})
	r.POST("/code-budgets", w, createJSON(store.CreateCodeBudget))
	r.PUT("/code-budgets/:id", w, updateJSON(store.UpdateCodeBudget))

	// People that can be picked as "Requested By": active users (id and name only).
	r.GET("/requesters", listJSON(userStore.ListRequesters))
}

// uploadCompanyLogo takes a multipart form with one PNG or JPEG in "file".
func (h *catalogHandlers) uploadCompanyLogo(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	if _, err := h.store.GetCompany(ctx, id); err != nil {
		Fail(c, err)
		return
	}

	// Allow a little more than the file itself for the multipart framing.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, files.MaxLogoBytes+(64<<10))
	header, err := c.FormFile("file")
	if err != nil {
		failUpload(c, err)
		return
	}
	src, err := header.Open()
	if err != nil {
		Fail(c, err)
		return
	}
	defer src.Close()

	dir := "logos/" + strconv.FormatInt(id, 10)
	rel, _, err := h.files.Save(dir, logoName, src, files.LogoTypes, files.MaxLogoBytes)
	if err != nil {
		failUpload(c, err)
		return
	}
	previous, err := h.store.SetCompanyLogo(ctx, id, rel)
	if err != nil {
		_ = h.files.Remove(rel) // do not leave an orphan behind
		Fail(c, err)
		return
	}
	if previous != nil && *previous != rel {
		_ = h.files.Remove(*previous) // best effort; a stale file is harmless
	}
	company, err := h.store.GetCompany(ctx, id)
	if err != nil {
		Fail(c, err)
		return
	}
	c.JSON(http.StatusOK, company)
}

// failUpload maps upload errors (size, type, malformed form) to API errors.
func failUpload(c *gin.Context, err error) {
	var tooBig *http.MaxBytesError
	switch {
	case errors.As(err, &tooBig), errors.Is(err, files.ErrTooLarge):
		Fail(c, NewError(http.StatusRequestEntityTooLarge, "file_too_large", "The file is too large"))
	case errors.Is(err, files.ErrUnsupportedType):
		Fail(c, NewError(http.StatusUnsupportedMediaType, "unsupported_file_type", "This file type is not allowed"))
	case errors.Is(err, http.ErrMissingFile), errors.Is(err, http.ErrNotMultipart):
		Fail(c, NewError(http.StatusBadRequest, "invalid_request", `Send the file as multipart form data in the "file" field`))
	case errors.Is(err, files.ErrInvalidPath):
		Fail(c, NewError(http.StatusBadRequest, "invalid_path", "Invalid file path"))
	default:
		Fail(c, err)
	}
}

func logoName(info files.Saved) string {
	return strconv.FormatInt(timeNow().UnixMilli(), 10) + "." + info.Ext
}
