package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/files"
)

var timeNow = time.Now

const signedURLTTL = time.Hour

// registerFiles mounts the file endpoints:
//
//	GET /file-url?path=...   (signed in) -> a download link valid for an hour
//	GET /files/<path>?exp&sig (the link)  -> the file itself
//
// The download itself carries no Authorization header because <img>, <iframe>
// and PDF viewers cannot send one; the signature is what authorizes it.
func registerFiles(g *gin.RouterGroup, authSvc *auth.Service, store *files.Store) {
	g.GET("/file-url", Authenticate(authSvc), func(c *gin.Context) {
		rel := c.Query("path")
		if !files.ValidPath(rel) {
			Fail(c, NewError(http.StatusBadRequest, "invalid_path", "Invalid file path"))
			return
		}
		if !store.Exists(rel) {
			Fail(c, ErrNotFound)
			return
		}
		url, exp, err := store.SignedURL(rel, signedURLTTL)
		if err != nil {
			Fail(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"url": url, "expires_at": exp.UTC()})
	})

	g.GET("/files/*filepath", func(c *gin.Context) {
		rel := strings.TrimPrefix(c.Param("filepath"), "/")
		exp, err := strconv.ParseInt(c.Query("exp"), 10, 64)
		if err != nil {
			Fail(c, NewError(http.StatusForbidden, "invalid_link", "This link is invalid or has expired"))
			return
		}
		if err := store.Verify(rel, exp, c.Query("sig")); err != nil {
			Fail(c, NewError(http.StatusForbidden, "invalid_link", "This link is invalid or has expired"))
			return
		}
		f, info, err := store.Open(rel)
		if errors.Is(err, files.ErrNotFound) || errors.Is(err, files.ErrInvalidPath) {
			Fail(c, ErrNotFound)
			return
		}
		if err != nil {
			Fail(c, err)
			return
		}
		defer f.Close()

		c.Header("Content-Type", files.ContentType(rel))
		c.Header("Cache-Control", "private, max-age=300")
		http.ServeContent(c.Writer, c.Request, "", info.ModTime(), f)
	})
}
