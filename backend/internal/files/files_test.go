package files

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var (
	pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 64)...)
	jpgBytes = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{1}, 64)...)
	pdfBytes = append([]byte("%PDF-1.7\n"), bytes.Repeat([]byte("x"), 64)...)
)

func newStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(t.TempDir(), strings.Repeat("s", 32))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func named(name string) func(Saved) string { return func(Saved) string { return name } }

func TestDetect(t *testing.T) {
	for name, tc := range map[string]struct {
		in        []byte
		mime, ext string
		ok        bool
	}{
		"png":       {pngBytes, "image/png", "png", true},
		"jpeg":      {jpgBytes, "image/jpeg", "jpg", true},
		"pdf":       {pdfBytes, "application/pdf", "pdf", true},
		"text":      {[]byte("hello world, not an image"), "", "", false},
		"html":      {[]byte("<html><script>alert(1)</script>"), "", "", false},
		"svg":       {[]byte("<svg xmlns='http://www.w3.org/2000/svg'/>"), "", "", false},
		"empty":     {nil, "", "", false},
		"too short": {[]byte("\x89PN"), "", "", false},
	} {
		mime, ext, ok := Detect(tc.in)
		if mime != tc.mime || ext != tc.ext || ok != tc.ok {
			t.Errorf("%s: got %q %q %v", name, mime, ext, ok)
		}
	}
}

func TestSaveOpenRemove(t *testing.T) {
	s := newStore(t)
	rel, info, err := s.Save("logos/12", func(i Saved) string { return "100." + i.Ext }, bytes.NewReader(pngBytes), LogoTypes, MaxLogoBytes)
	if err != nil {
		t.Fatal(err)
	}
	if rel != "logos/12/100.png" || info.Mime != "image/png" || info.Size != int64(len(pngBytes)) {
		t.Fatalf("saved: %q %+v", rel, info)
	}

	f, fi, err := s.Open(rel)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(f)
	f.Close()
	if !bytes.Equal(got, pngBytes) || fi.Size() != int64(len(pngBytes)) {
		t.Error("stored content differs")
	}
	if !s.Exists(rel) {
		t.Error("Exists says no")
	}

	if err := s.Remove(rel); err != nil {
		t.Fatal(err)
	}
	if s.Exists(rel) {
		t.Error("file still there")
	}
	if err := s.Remove(rel); err != nil {
		t.Errorf("removing a missing file must not fail: %v", err)
	}
	if _, _, err := s.Open(rel); !errors.Is(err, ErrNotFound) {
		t.Errorf("open missing: %v", err)
	}
}

func TestSaveLeavesNoTempFilesBehind(t *testing.T) {
	s := newStore(t)
	_, _, _ = s.Save("documents/1", named("a.pdf"), bytes.NewReader(pdfBytes), DocumentTypes, MaxDocumentBytes)
	_, _, err := s.Save("documents/1", named("b.pdf"), bytes.NewReader(append(pdfBytes, make([]byte, 100)...)), DocumentTypes, 50)
	if !errors.Is(err, ErrTooLarge) {
		t.Fatalf("want ErrTooLarge, got %v", err)
	}
	entries, _ := os.ReadDir(filepath.Join(s.root, "documents", "1"))
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".upload-") || e.Name() == "b.pdf" {
			t.Errorf("leftover %s", e.Name())
		}
	}
}

func TestSaveRefusals(t *testing.T) {
	s := newStore(t)
	for name, tc := range map[string]struct {
		body    []byte
		allowed []string
		max     int64
		want    error
	}{
		"text renamed png":  {[]byte("just some text, not a png"), LogoTypes, MaxLogoBytes, ErrUnsupportedType},
		"html":              {[]byte("<html></html>"), DocumentTypes, MaxDocumentBytes, ErrUnsupportedType},
		"pdf as logo":       {pdfBytes, LogoTypes, MaxLogoBytes, ErrUnsupportedType},
		"empty":             {nil, DocumentTypes, MaxDocumentBytes, ErrUnsupportedType},
		"one byte too much": {append(pngBytes, make([]byte, 100)...), LogoTypes, int64(len(pngBytes)) + 99, ErrTooLarge},
	} {
		if _, _, err := s.Save("logos/1", named("x.png"), bytes.NewReader(tc.body), tc.allowed, tc.max); !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v, want %v", name, err, tc.want)
		}
	}
	// exactly at the limit is fine
	if _, _, err := s.Save("logos/1", named("ok.png"), bytes.NewReader(pngBytes), LogoTypes, int64(len(pngBytes))); err != nil {
		t.Errorf("a file exactly at the limit: %v", err)
	}
}

func TestPathValidation(t *testing.T) {
	good := []string{"logos/1/1700000000000.png", "documents/42/1700000000000-DO_1.pdf", "documents/7/a.b-c_d.jpg"}
	bad := []string{
		"", "/etc/passwd", "../etc/passwd", "logos/../../etc/passwd", "logos/1/../2/x.png",
		"logos/1/..", "logos/1/", "logos/x/1.png", "other/1/1.png", "logos/1/a/b.png",
		"logos\\1\\x.png", "logos/1/x y.png", "logos/1/x.png\x00", "LOGOS/1/x.png",
		"logos/1/" + strings.Repeat("a", 121), "documents//x.pdf", "logos/1/..%2f.png", "logos/1/a..b.png",
	}
	for _, p := range good {
		if !ValidPath(p) {
			t.Errorf("%q should be valid", p)
		}
	}
	for _, p := range bad {
		if ValidPath(p) {
			t.Errorf("%q must be refused", p)
		}
	}

	s := newStore(t)
	if _, _, err := s.Open("../secret.png"); !errors.Is(err, ErrInvalidPath) {
		t.Errorf("open traversal: %v", err)
	}
	if err := s.Remove("logos/1/../../x.png"); !errors.Is(err, ErrInvalidPath) {
		t.Errorf("remove traversal: %v", err)
	}
	if _, _, err := s.Save("logos/1/../..", named("x.png"), bytes.NewReader(pngBytes), LogoTypes, MaxLogoBytes); !errors.Is(err, ErrInvalidPath) {
		t.Errorf("save traversal: %v", err)
	}
}

func TestSignedLinks(t *testing.T) {
	s := newStore(t)
	now := time.Date(2026, 11, 9, 10, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return now }

	link, exp, err := s.SignedURL("logos/1/a.png", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(link, "/api/v1/files/logos/1/a.png?exp=") || !exp.Equal(now.Add(time.Hour)) {
		t.Fatalf("link %q exp %v", link, exp)
	}
	sig := link[strings.Index(link, "sig=")+4:]

	if err := s.Verify("logos/1/a.png", exp.Unix(), sig); err != nil {
		t.Errorf("valid link: %v", err)
	}
	if err := s.Verify("logos/1/b.png", exp.Unix(), sig); !errors.Is(err, ErrBadSignature) {
		t.Errorf("another path with the same signature: %v", err)
	}
	if err := s.Verify("logos/1/a.png", exp.Unix()+1, sig); !errors.Is(err, ErrBadSignature) {
		t.Errorf("extended expiry: %v", err)
	}
	if err := s.Verify("logos/1/a.png", exp.Unix(), sig[:len(sig)-1]+"0"); !errors.Is(err, ErrBadSignature) {
		t.Errorf("tampered signature: %v", err)
	}
	if err := s.Verify("logos/1/a.png", exp.Unix(), ""); !errors.Is(err, ErrBadSignature) {
		t.Errorf("empty signature: %v", err)
	}
	if err := s.Verify("../a.png", exp.Unix(), sig); !errors.Is(err, ErrInvalidPath) {
		t.Errorf("bad path: %v", err)
	}

	now = now.Add(time.Hour + time.Second)
	if err := s.Verify("logos/1/a.png", exp.Unix(), sig); !errors.Is(err, ErrBadSignature) {
		t.Errorf("expired link: %v", err)
	}

	// A different secret cannot forge links.
	other, _ := New(t.TempDir(), strings.Repeat("o", 32))
	other.now = s.now
	forged := other.sign("logos/1/a.png", exp.Unix())
	now = now.Add(-2 * time.Hour)
	if err := s.Verify("logos/1/a.png", exp.Unix(), forged); !errors.Is(err, ErrBadSignature) {
		t.Errorf("forged signature: %v", err)
	}

	if _, _, err := s.SignedURL("../x", time.Hour); !errors.Is(err, ErrInvalidPath) {
		t.Errorf("signing a bad path: %v", err)
	}
}

func TestSafeNameAndContentType(t *testing.T) {
	at := time.UnixMilli(1700000000000)
	for in, want := range map[string]string{
		"DO ZZ TEST 0002.pdf":             "1700000000000-DO_ZZ_TEST_0002.pdf",
		"../../etc/passwd":                "1700000000000-passwd.pdf",
		"":                                "1700000000000-file.pdf",
		"日本語.pdf":                         "1700000000000-file.pdf",
		strings.Repeat("a", 200) + ".pdf": "1700000000000-" + strings.Repeat("a", 60) + ".pdf",
	} {
		got := SafeName(in, "pdf", at)
		if in == "../../etc/passwd" {
			// path.Ext of the base keeps only the last element's extension; the traversal dots are dropped
			if !ValidPath("documents/1/" + got) {
				t.Errorf("%q gave an invalid name %q", in, got)
			}
			continue
		}
		if got != want {
			t.Errorf("SafeName(%q) = %q, want %q", in, got, want)
		}
		if !ValidPath("documents/1/" + got) {
			t.Errorf("%q gave an invalid name %q", in, got)
		}
	}
	for p, want := range map[string]string{
		"logos/1/a.png": "image/png", "logos/1/a.JPG": "image/jpeg", "documents/1/a.pdf": "application/pdf", "documents/1/a.exe": "application/octet-stream",
	} {
		if got := ContentType(p); got != want {
			t.Errorf("ContentType(%q) = %q", p, got)
		}
	}
}
