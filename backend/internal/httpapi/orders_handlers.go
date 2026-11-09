package httpapi

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/files"
	"github.com/data-center-bgp/po-bunker/backend/internal/orders"
)

type orderHandlers struct {
	store *orders.Store
	svc   *orders.Service
}

// registerOrders mounts the purchase order endpoints. Everyone signed in can
// read; admin and staff can create, complete, cancel and attach documents and
// remarks. Orders are never deleted.
func registerOrders(g *gin.RouterGroup, authSvc *auth.Service, store *orders.Store, svc *orders.Service) {
	h := &orderHandlers{store: store, svc: svc}
	r := g.Group("", Authenticate(authSvc))
	w := RequireWrite()

	r.GET("/orders", h.list)
	r.GET("/orders/:id", h.get)
	r.POST("/orders", w, h.create)
	r.POST("/orders/:id/complete", w, h.complete)
	r.POST("/orders/:id/cancel", w, h.cancel)
	r.POST("/orders/:id/documents", w, h.addDocument)
	r.DELETE("/orders/:id/documents/:docId", w, h.deleteDocument)
	r.POST("/orders/:id/remarks", w, h.addRemark)
	r.DELETE("/orders/:id/remarks/:remarkId", w, h.deleteRemark)

	r.GET("/dashboard/orders", func(c *gin.Context) {
		feed, err := store.Dashboard(c.Request.Context())
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, feed)
	})
}

// queryInt reads a positive integer query parameter, falling back to def.
func queryInt(c *gin.Context, name string, def int) int {
	n, err := strconv.Atoi(c.Query(name))
	if err != nil || n < 1 {
		return def
	}
	return n
}

func (h *orderHandlers) list(c *gin.Context) {
	page, err := h.store.List(c.Request.Context(), queryInt(c, "page", 1), queryInt(c, "limit", 10))
	if err != nil {
		Fail(c, err)
		return
	}
	c.JSON(http.StatusOK, page)
}

func (h *orderHandlers) get(c *gin.Context) {
	id, ok := pathParamID(c, "id")
	if !ok {
		return
	}
	order, err := h.store.Get(c.Request.Context(), id)
	if err != nil {
		Fail(c, err)
		return
	}
	c.JSON(http.StatusOK, order)
}

func (h *orderHandlers) create(c *gin.Context) {
	var in orders.CreateInput
	if !bindJSON(c, &in) {
		return
	}
	order, err := h.svc.Create(c.Request.Context(), CurrentUser(c).ID, in)
	if err != nil {
		Fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, order)
}

func (h *orderHandlers) complete(c *gin.Context) {
	id, ok := pathParamID(c, "id")
	if !ok {
		return
	}
	var in orders.CompleteInput
	if !bindJSON(c, &in) {
		return
	}
	order, err := h.svc.Complete(c.Request.Context(), CurrentUser(c).ID, id, in)
	if err != nil {
		Fail(c, err)
		return
	}
	c.JSON(http.StatusOK, order)
}

func (h *orderHandlers) cancel(c *gin.Context) {
	id, ok := pathParamID(c, "id")
	if !ok {
		return
	}
	var in orders.CancelInput
	if !bindJSON(c, &in) {
		return
	}
	order, err := h.svc.Cancel(c.Request.Context(), CurrentUser(c).ID, id, in)
	if err != nil {
		Fail(c, err)
		return
	}
	c.JSON(http.StatusOK, order)
}

// addDocument takes a multipart form with one PDF, PNG or JPG in "file".
func (h *orderHandlers) addDocument(c *gin.Context) {
	id, ok := pathParamID(c, "id")
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, files.MaxDocumentBytes+(64<<10))
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

	doc, err := h.svc.AddDocument(c.Request.Context(), CurrentUser(c).ID, id, header.Filename, src)
	if err != nil {
		failUpload(c, err)
		return
	}
	c.JSON(http.StatusCreated, doc)
}

func (h *orderHandlers) deleteDocument(c *gin.Context) {
	id, ok := pathParamID(c, "id")
	if !ok {
		return
	}
	docID, ok := pathParamID(c, "docId")
	if !ok {
		return
	}
	if err := h.svc.DeleteDocument(c.Request.Context(), id, docID); err != nil {
		Fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *orderHandlers) addRemark(c *gin.Context) {
	id, ok := pathParamID(c, "id")
	if !ok {
		return
	}
	var in orders.RemarkInput
	if !bindJSON(c, &in) {
		return
	}
	remark, err := h.svc.AddRemark(c.Request.Context(), CurrentUser(c).ID, id, in)
	if err != nil {
		Fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, remark)
}

func (h *orderHandlers) deleteRemark(c *gin.Context) {
	id, ok := pathParamID(c, "id")
	if !ok {
		return
	}
	remarkID, ok := pathParamID(c, "remarkId")
	if !ok {
		return
	}
	if err := h.svc.DeleteRemark(c.Request.Context(), id, remarkID); err != nil {
		Fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
