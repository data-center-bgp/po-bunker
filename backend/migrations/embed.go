// Package migrations embeds the SQL migrations so the binary carries them.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
