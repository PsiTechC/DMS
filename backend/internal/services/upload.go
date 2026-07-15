package services

import (
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"dms/backend/internal/config"
	"dms/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Allowed extensions per media kind. Extension AND sniffed content type must
// both pass before a file is written to disk.
var allowedExt = map[models.MediaType]map[string]bool{
	models.MediaImage:  {".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true},
	models.MediaVideo:  {".mp4": true, ".webm": true, ".mov": true, ".avi": true, ".mkv": true},
	models.MediaManual: {".pdf": true},
}

var allowedMime = map[models.MediaType][]string{
	models.MediaImage:  {"image/"},
	models.MediaVideo:  {"video/"},
	models.MediaManual: {"application/pdf"},
}

// Per-kind size ceilings in megabytes.
var maxMB = map[models.MediaType]int64{
	models.MediaImage:  10,
	models.MediaVideo:  200,
	models.MediaManual: 50,
}

var subdir = map[models.MediaType]string{
	models.MediaImage:  "images",
	models.MediaVideo:  "videos",
	models.MediaManual: "manuals",
}

type SavedFile struct {
	FileName  string
	FilePath  string
	URL       string
	MimeType  string
	SizeBytes int64
}

// SaveUpload validates and persists one uploaded file, returning its metadata.
func SaveUpload(c *gin.Context, fh *multipart.FileHeader, kind models.MediaType) (*SavedFile, error) {
	cfg := config.C

	ext := strings.ToLower(filepath.Ext(fh.Filename))
	exts, ok := allowedExt[kind]
	if !ok {
		return nil, fmt.Errorf("unsupported media type %q", kind)
	}
	if !exts[ext] {
		return nil, fmt.Errorf("%q is not an allowed %s file (allowed: %s)", ext, kind, strings.Join(keys(exts), ", "))
	}

	limit := maxMB[kind]
	if limit > cfg.MaxUploadMB {
		limit = cfg.MaxUploadMB
	}
	if fh.Size > limit*1024*1024 {
		return nil, fmt.Errorf("file is %.1f MB — the limit for %ss is %d MB", float64(fh.Size)/(1024*1024), kind, limit)
	}
	if fh.Size == 0 {
		return nil, fmt.Errorf("file is empty")
	}

	mime, err := sniffMime(fh)
	if err != nil {
		return nil, err
	}
	if !mimeAllowed(mime, kind) {
		return nil, fmt.Errorf("file content is %q which does not match an expected %s", mime, kind)
	}

	dir := filepath.Join(cfg.UploadDir, subdir[kind])
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}

	// Random stored name — never trust the client-supplied filename on disk.
	stored := uuid.NewString() + ext
	dest := filepath.Join(dir, stored)

	if err := c.SaveUploadedFile(fh, dest); err != nil {
		return nil, fmt.Errorf("save file: %w", err)
	}

	return &SavedFile{
		FileName:  filepath.Base(fh.Filename),
		FilePath:  dest,
		URL:       fmt.Sprintf("/uploads/%s/%s", subdir[kind], stored),
		MimeType:  mime,
		SizeBytes: fh.Size,
	}, nil
}

// SaveAttachment stores a query attachment (images or PDF).
func SaveAttachment(c *gin.Context, fh *multipart.FileHeader) (*SavedFile, error) {
	cfg := config.C

	ext := strings.ToLower(filepath.Ext(fh.Filename))
	ok := allowedExt[models.MediaImage][ext] || ext == ".pdf"
	if !ok {
		return nil, fmt.Errorf("attachments must be an image or PDF")
	}
	if fh.Size > 20*1024*1024 {
		return nil, fmt.Errorf("attachment must be under 20 MB")
	}

	mime, err := sniffMime(fh)
	if err != nil {
		return nil, err
	}
	if !strings.HasPrefix(mime, "image/") && mime != "application/pdf" {
		return nil, fmt.Errorf("attachment content is %q — only images and PDFs are accepted", mime)
	}

	dir := filepath.Join(cfg.UploadDir, "attachments")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}

	stored := uuid.NewString() + ext
	dest := filepath.Join(dir, stored)
	if err := c.SaveUploadedFile(fh, dest); err != nil {
		return nil, fmt.Errorf("save attachment: %w", err)
	}

	return &SavedFile{
		FileName:  filepath.Base(fh.Filename),
		FilePath:  dest,
		URL:       "/uploads/attachments/" + stored,
		MimeType:  mime,
		SizeBytes: fh.Size,
	}, nil
}

// DeleteFile removes a stored file, ignoring "already gone".
func DeleteFile(path string) error {
	if path == "" {
		return nil
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// sniffMime reads the first 512 bytes and detects the real content type,
// so a .png that is actually a script gets rejected.
func sniffMime(fh *multipart.FileHeader) (string, error) {
	f, err := fh.Open()
	if err != nil {
		return "", fmt.Errorf("open upload: %w", err)
	}
	defer f.Close()

	buf := make([]byte, 512)
	n, err := f.Read(buf)
	if err != nil && n == 0 {
		return "", fmt.Errorf("read upload: %w", err)
	}
	return http.DetectContentType(buf[:n]), nil
}

func mimeAllowed(mime string, kind models.MediaType) bool {
	for _, prefix := range allowedMime[kind] {
		if strings.HasPrefix(mime, prefix) {
			return true
		}
	}
	// Some browsers report .mov/.mkv as octet-stream; extension already passed.
	if kind == models.MediaVideo && mime == "application/octet-stream" {
		return true
	}
	return false
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
