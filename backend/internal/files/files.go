// Package files stores uploaded logos and Delivery Order documents on disk and
// hands out short-lived signed download links.
//
// Files are only ever addressed by a relative path of the form
// "logos/<company id>/<name>" or "documents/<order id>/<name>"; anything else
// is refused, so a request cannot reach outside the storage directory.
package files

import (
	"bufio"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	MaxLogoBytes     = 1 << 20 // 1 MB
	MaxDocumentBytes = 5 << 20 // 5 MB
)

var (
	ErrInvalidPath     = errors.New("invalid file path")
	ErrNotFound        = errors.New("file not found")
	ErrTooLarge        = errors.New("file is too large")
	ErrUnsupportedType = errors.New("unsupported file type")
	ErrBadSignature    = errors.New("invalid or expired link")
)

// Allowed content types by kind of upload.
var (
	LogoTypes     = []string{"image/png", "image/jpeg"}
	DocumentTypes = []string{"application/pdf", "image/png", "image/jpeg"}
)

var pathPattern = regexp.MustCompile(`^(logos|documents)/[0-9]+/[A-Za-z0-9._-]{1,120}$`)

var nameCleaner = regexp.MustCompile(`[^A-Za-z0-9_-]+`)

// Store is a directory plus the secret that signs download links.
type Store struct {
	root   string
	secret []byte
	now    func() time.Time
}

func New(root, signingSecret string) (*Store, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o750); err != nil {
		return nil, fmt.Errorf("create files directory: %w", err)
	}
	return &Store{root: abs, secret: []byte(signingSecret), now: time.Now}, nil
}

// ValidPath reports whether rel is an acceptable storage path.
func ValidPath(rel string) bool {
	return pathPattern.MatchString(rel) && !strings.Contains(rel, "..")
}

// resolve turns a relative path into an absolute one inside the root.
func (s *Store) resolve(rel string) (string, error) {
	if !ValidPath(rel) {
		return "", ErrInvalidPath
	}
	abs := filepath.Join(s.root, filepath.FromSlash(rel))
	if inside, err := filepath.Rel(s.root, abs); err != nil || strings.HasPrefix(inside, "..") {
		return "", ErrInvalidPath
	}
	return abs, nil
}

// Detect identifies a file by its first bytes (never by its name or the
// client's Content-Type) and returns the MIME type and a file extension.
func Detect(head []byte) (mime, ext string, ok bool) {
	switch {
	case len(head) >= 8 && string(head[:8]) == "\x89PNG\r\n\x1a\n":
		return "image/png", "png", true
	case len(head) >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF:
		return "image/jpeg", "jpg", true
	case len(head) >= 5 && string(head[:5]) == "%PDF-":
		return "application/pdf", "pdf", true
	}
	return "", "", false
}

// ContentType is the type to serve a stored path as (decided by the extension
// we chose at upload time).
func ContentType(rel string) string {
	switch strings.ToLower(path.Ext(rel)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".pdf":
		return "application/pdf"
	}
	return "application/octet-stream"
}

// SafeName builds the stored file name for an upload: "<unix ms>-<clean name>.<ext>".
func SafeName(original, ext string, now time.Time) string {
	base := strings.TrimSuffix(original, path.Ext(original))
	base = strings.Trim(nameCleaner.ReplaceAllString(base, "_"), "_")
	if len(base) > 60 {
		base = base[:60]
	}
	if base == "" {
		base = "file"
	}
	return fmt.Sprintf("%d-%s.%s", now.UnixMilli(), base, ext)
}

// Saved describes a stored upload.
type Saved struct {
	Size int64
	Mime string
	Ext  string
}

// Peek reads the start of r, checks the type and size limit and returns the
// detected type together with a reader that still yields the whole content.
func Peek(r io.Reader, allowed []string, max int64) (Saved, io.Reader, error) {
	br := bufio.NewReaderSize(io.LimitReader(r, max+1), 4096)
	head, err := br.Peek(16)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, bufio.ErrBufferFull) {
		return Saved{}, nil, err
	}
	mime, ext, ok := Detect(head)
	if !ok {
		return Saved{}, nil, ErrUnsupportedType
	}
	for _, a := range allowed {
		if a == mime {
			return Saved{Mime: mime, Ext: ext}, br, nil
		}
	}
	return Saved{}, nil, ErrUnsupportedType
}

// Save stores the upload under dir ("logos/12", "documents/7"). The type is
// detected from the bytes and must be in allowed, the size at most max; the file
// name comes from makeName so its extension always matches the real type.
// The write is atomic (temp file, then rename). It returns the relative path.
func (s *Store) Save(dir string, makeName func(Saved) string, r io.Reader, allowed []string, max int64) (string, Saved, error) {
	info, body, err := Peek(r, allowed, max)
	if err != nil {
		return "", Saved{}, err
	}
	rel := dir + "/" + makeName(info)
	abs, err := s.resolve(rel)
	if err != nil {
		return "", Saved{}, err
	}

	parent := filepath.Dir(abs)
	if err := os.MkdirAll(parent, 0o750); err != nil {
		return "", Saved{}, err
	}
	tmp, err := os.CreateTemp(parent, ".upload-*")
	if err != nil {
		return "", Saved{}, err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }() // a no-op after a successful rename

	n, err := io.Copy(tmp, body)
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return "", Saved{}, err
	}
	if n > max {
		return "", Saved{}, ErrTooLarge
	}
	if err := os.Rename(tmpName, abs); err != nil {
		return "", Saved{}, err
	}
	info.Size = n
	return rel, info, nil
}

// Open returns the file for reading.
func (s *Store) Open(rel string) (*os.File, os.FileInfo, error) {
	abs, err := s.resolve(rel)
	if err != nil {
		return nil, nil, err
	}
	f, err := os.Open(abs)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		_ = f.Close()
		return nil, nil, ErrNotFound
	}
	return f, fi, nil
}

func (s *Store) Exists(rel string) bool {
	f, _, err := s.Open(rel)
	if err != nil {
		return false
	}
	_ = f.Close()
	return true
}

// Remove deletes a file; a file that is already gone is not an error.
func (s *Store) Remove(rel string) error {
	abs, err := s.resolve(rel)
	if err != nil {
		return err
	}
	if err := os.Remove(abs); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *Store) sign(rel string, exp int64) string {
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte(rel + "\n" + strconv.FormatInt(exp, 10)))
	return hex.EncodeToString(m.Sum(nil))
}

// SignedURL returns a download URL (path and query only) that works without a
// login until it expires.
func (s *Store) SignedURL(rel string, ttl time.Duration) (string, time.Time, error) {
	if !ValidPath(rel) {
		return "", time.Time{}, ErrInvalidPath
	}
	exp := s.now().Add(ttl)
	return fmt.Sprintf("/api/v1/files/%s?exp=%d&sig=%s", rel, exp.Unix(), s.sign(rel, exp.Unix())), exp, nil
}

// Verify checks a download link's signature and expiry.
func (s *Store) Verify(rel string, exp int64, sig string) error {
	if !ValidPath(rel) {
		return ErrInvalidPath
	}
	if s.now().Unix() > exp {
		return ErrBadSignature
	}
	if !hmac.Equal([]byte(sig), []byte(s.sign(rel, exp))) {
		return ErrBadSignature
	}
	return nil
}
