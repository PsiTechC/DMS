package services

import (
	"bytes"
	"mime/multipart"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"dms/backend/internal/config"
	"dms/backend/internal/models"

	"github.com/gin-gonic/gin"
)

func uploadFixture(t *testing.T, filename string, content []byte) (*gin.Context, *multipart.FileHeader) {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/upload", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req
	fh, err := c.FormFile("file")
	if err != nil {
		t.Fatal(err)
	}
	return c, fh
}

func TestSaveUploadRejectsExtensionMimeMismatch(t *testing.T) {
	previous := config.C
	config.C = &config.Config{UploadDir: t.TempDir(), MaxUploadMB: 100}
	t.Cleanup(func() { config.C = previous })
	c, fh := uploadFixture(t, "fake.png", []byte("this is plain text, not an image"))

	if _, err := SaveUpload(c, fh, models.MediaImage); err == nil {
		t.Fatal("expected a fake PNG to be rejected")
	}
}

func TestSaveUploadCannotTraverseAndUsesRandomStoredName(t *testing.T) {
	previous := config.C
	uploadRoot := t.TempDir()
	config.C = &config.Config{UploadDir: uploadRoot, MaxUploadMB: 100}
	t.Cleanup(func() { config.C = previous })
	c, fh := uploadFixture(t, "../../attacker.png", []byte("\x89PNG\r\n\x1a\nminimal"))

	saved, err := SaveUpload(c, fh, models.MediaImage)
	if err != nil {
		t.Fatalf("expected valid image signature to be saved: %v", err)
	}
	resolvedRoot, _ := filepath.Abs(uploadRoot)
	resolvedFile, _ := filepath.Abs(saved.FilePath)
	if !strings.HasPrefix(resolvedFile, resolvedRoot+string(filepath.Separator)) {
		t.Fatalf("stored file escaped upload root: %s", resolvedFile)
	}
	if strings.Contains(filepath.Base(saved.FilePath), "attacker") || saved.FileName != "attacker.png" {
		t.Fatalf("unsafe client filename handling: stored=%q display=%q", saved.FilePath, saved.FileName)
	}
}
