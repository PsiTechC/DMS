package services

import (
	"bytes"
	"image/png"
	"testing"
)

func TestGenerateQRPNGRejectsExcessiveSize(t *testing.T) {
	if _, err := GenerateQRPNG("https://dms.acme.test/device/DMS000001", 2049); err == nil {
		t.Fatal("expected an excessive QR image size to be rejected")
	}
}

func TestGenerateProductQRPNGAddsCategoryMark(t *testing.T) {
	plain, err := GenerateQRPNG("https://dms.test/device/FMS0001", 400)
	if err != nil {
		t.Fatal(err)
	}
	branded, err := GenerateProductQRPNG("https://dms.test/device/FMS0001", "FMS", 400)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(plain, branded) {
		t.Fatal("expected the category mark to change the QR artwork")
	}
	if _, err := png.Decode(bytes.NewReader(branded)); err != nil {
		t.Fatalf("expected valid branded PNG output: %v", err)
	}
	if got := ProductMark("FMS0001"); got != "FMS" {
		t.Fatalf("expected FMS mark, got %q", got)
	}
	if got := ProductMark("PW0042"); got != "PW" {
		t.Fatalf("expected PW mark, got %q", got)
	}
	if got := ProductMark("BBM0012"); got != "BBM" {
		t.Fatalf("expected BBM mark, got %q", got)
	}
	if got := ProductMark("BB0001"); got != "BB" {
		t.Fatalf("expected BB mark, got %q", got)
	}
}

func TestGenerateQRPNGAllowsNormalSize(t *testing.T) {
	png, err := GenerateQRPNG("https://dms.acme.test/device/DMS000001", 400)
	if err != nil {
		t.Fatalf("expected a normal QR image: %v", err)
	}
	if len(png) < 8 || string(png[:8]) != "\x89PNG\r\n\x1a\n" {
		t.Fatal("expected PNG output")
	}
}
