// Package vessels syncs the vessel list from the company SMS API into the
// vessels table.
package vessels

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	maxPages     = 50
	pageTimeout  = 20 * time.Second
	maxBodyBytes = 10 << 20 // one page of ships is nowhere near this
)

// UpstreamError is a problem with the SMS API (or its configuration).
type UpstreamError struct {
	Code          string
	Message       string
	NotConfigured bool
}

func (e *UpstreamError) Error() string { return e.Code + ": " + e.Message }

func upstream(code, msg string) error { return &UpstreamError{Code: code, Message: msg} }

// Client fetches ships from the SMS API.
type Client struct {
	url   string
	token string
	http  *http.Client
}

func NewClient(apiURL, token string) *Client {
	return &Client{url: apiURL, token: token, http: &http.Client{Timeout: pageTimeout}}
}

// Fetch downloads every page and returns the ships as generic JSON objects
// (the sync decides which entries are usable) and the number of pages read.
func (c *Client) Fetch(ctx context.Context) ([]map[string]any, int, error) {
	if c.token == "" {
		return nil, 0, &UpstreamError{Code: "vessel_api_not_configured", Message: "The vessel API token is not configured", NotConfigured: true}
	}
	base, err := url.Parse(c.url)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return nil, 0, &UpstreamError{Code: "vessel_api_not_configured", Message: "The vessel API URL is not configured", NotConfigured: true}
	}

	var ships []map[string]any
	next := c.url
	pages := 0
	for next != "" && pages < maxPages {
		// The token must never go anywhere but the SMS host.
		target, err := url.Parse(next)
		if err != nil || target.Scheme != base.Scheme || target.Host != base.Host {
			return nil, pages, upstream("vessel_api_bad_link", "The vessel API returned an unexpected page link")
		}
		rows, body, err := c.page(ctx, next)
		if err != nil {
			return nil, pages, err
		}
		ships = append(ships, rows...)
		pages++
		next = nextPageURL(body, pages, c.url)
	}
	return ships, pages, nil
}

func (c *Client) page(ctx context.Context, pageURL string) ([]map[string]any, map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return nil, nil, upstream("vessel_api_unreachable", "Could not reach the vessel API")
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, nil, ctx.Err()
		}
		slog.Error("vessel API request failed", "error", redact(err, c.token))
		return nil, nil, upstream("vessel_api_unreachable", "Could not reach the vessel API")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		slog.Error("vessel API answered with an error", "status", resp.StatusCode)
		return nil, nil, upstream("vessel_api_status", fmt.Sprintf("The vessel API answered with HTTP %d", resp.StatusCode))
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return nil, nil, upstream("vessel_api_unreachable", "Could not reach the vessel API")
	}

	var top any
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, nil, upstream("vessel_api_unexpected_response", "Unexpected response from the vessel API")
	}
	var list []any
	var body map[string]any
	switch v := top.(type) {
	case []any:
		list = v
	case map[string]any:
		body = v
		l, ok := v["data"].([]any)
		if !ok {
			return nil, nil, upstream("vessel_api_unexpected_response", "Unexpected response from the vessel API")
		}
		list = l
	default:
		return nil, nil, upstream("vessel_api_unexpected_response", "Unexpected response from the vessel API")
	}

	rows := make([]map[string]any, 0, len(list))
	for _, item := range list {
		// Entries that are not objects are kept as nil so the sync counts them as skipped.
		m, _ := item.(map[string]any)
		rows = append(rows, m)
	}
	return rows, body, nil
}

// nextPageURL follows the pagination shapes seen on this kind of API: a
// links.next, next_page_url or next URL, or meta.current_page / last_page.
func nextPageURL(body map[string]any, page int, apiURL string) string {
	if body == nil {
		return ""
	}
	if links, ok := body["links"].(map[string]any); ok {
		if s, ok := links["next"].(string); ok && s != "" {
			return s
		}
	}
	for _, key := range []string{"next_page_url", "next"} {
		if s, ok := body[key].(string); ok && s != "" {
			return s
		}
	}
	if meta, ok := body["meta"].(map[string]any); ok {
		current := toInt(meta["current_page"], page)
		last := toInt(meta["last_page"], 0)
		if last > current {
			return fmt.Sprintf("%s?page=%d", strings.SplitN(apiURL, "?", 2)[0], current+1)
		}
	}
	return ""
}

func toInt(v any, def int) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case string:
		var i int
		if _, err := fmt.Sscanf(n, "%d", &i); err == nil {
			return i
		}
	}
	return def
}

// redact removes the token from an error before it is logged.
func redact(err error, token string) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if len(token) >= 8 { // a very short value would mangle every message
		msg = strings.ReplaceAll(msg, token, "[token]")
	}
	return msg
}

var _ = errors.New
