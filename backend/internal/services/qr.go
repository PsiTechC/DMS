package services

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"strings"

	"dms/backend/internal/models"

	"github.com/go-pdf/fpdf"
	"github.com/skip2/go-qrcode"
)

// GenerateQRPNG renders the QR payload URL as a PNG at the given pixel size.
func GenerateQRPNG(content string, size int) ([]byte, error) {
	return generateQRPNG(content, "", size)
}

// GenerateProductQRPNG adds the product abbreviation to the QR centre while
// using high error correction so the code remains reliably scannable.
func GenerateProductQRPNG(content, mark string, size int) ([]byte, error) {
	return generateQRPNG(content, strings.ToUpper(strings.TrimSpace(mark)), size)
}

func generateQRPNG(content, mark string, size int) ([]byte, error) {
	if size <= 0 {
		size = 512
	}
	if size > 2048 {
		return nil, fmt.Errorf("QR image size cannot exceed 2048 pixels")
	}
	pngBytes, err := qrcode.Encode(content, qrcode.High, size)
	if err != nil {
		return nil, fmt.Errorf("encode qr: %w", err)
	}
	if mark == "" {
		return pngBytes, nil
	}
	return addQRMark(pngBytes, mark)
}

// ProductMark returns the centre label encoded by the category-specific ID.
func ProductMark(assetID string) string {
	assetID = strings.ToUpper(strings.TrimSpace(assetID))
	switch {
	case strings.HasPrefix(assetID, "FMS"):
		return "FMS"
	case strings.HasPrefix(assetID, "BBM"):
		return "BBM"
	case strings.HasPrefix(assetID, "BB"):
		return "BB"
	case strings.HasPrefix(assetID, "PW"):
		return "PW"
	default:
		return ""
	}
}

var qrGlyphs = map[rune][]string{
	'F': {"11111", "10000", "11110", "10000", "10000", "10000", "10000"},
	'M': {"10001", "11011", "10101", "10101", "10001", "10001", "10001"},
	'S': {"01111", "10000", "10000", "01110", "00001", "00001", "11110"},
	'P': {"11110", "10001", "10001", "11110", "10000", "10000", "10000"},
	'W': {"10001", "10001", "10001", "10101", "10101", "11011", "10001"},
	'B': {"11110", "10001", "10001", "11110", "10001", "10001", "11110"},
}

func addQRMark(source []byte, mark string) ([]byte, error) {
	decoded, err := png.Decode(bytes.NewReader(source))
	if err != nil {
		return nil, fmt.Errorf("decode qr for branding: %w", err)
	}
	bounds := decoded.Bounds()
	canvas := image.NewRGBA(bounds)
	draw.Draw(canvas, bounds, decoded, bounds.Min, draw.Src)

	scale := bounds.Dx() / 100
	if scale < 1 {
		scale = 1
	}
	textWidth := (len(mark)*5 + len(mark) - 1) * scale
	textHeight := 7 * scale
	padding := 2 * scale
	left := bounds.Min.X + (bounds.Dx()-textWidth)/2
	top := bounds.Min.Y + (bounds.Dy()-textHeight)/2
	draw.Draw(canvas, image.Rect(left-padding, top-padding, left+textWidth+padding, top+textHeight+padding), &image.Uniform{C: color.White}, image.Point{}, draw.Src)

	blue := color.RGBA{R: 29, G: 78, B: 216, A: 255}
	x := left
	for _, char := range mark {
		glyph, ok := qrGlyphs[char]
		if !ok {
			continue
		}
		for row, line := range glyph {
			for col, bit := range line {
				if bit == '1' {
					rect := image.Rect(x+col*scale, top+row*scale, x+(col+1)*scale, top+(row+1)*scale)
					draw.Draw(canvas, rect, &image.Uniform{C: blue}, image.Point{}, draw.Src)
				}
			}
		}
		x += 6 * scale
	}

	var output bytes.Buffer
	if err := png.Encode(&output, canvas); err != nil {
		return nil, fmt.Errorf("encode branded qr: %w", err)
	}
	return output.Bytes(), nil
}

// ─── Label sheet PDF ──────────────────────────────────────────────────────

// Label sheet geometry (A4, millimetres).
const (
	pageW     = 210.0
	pageH     = 297.0
	marginX   = 10.0
	marginTop = 14.0
	cols      = 4
	rows      = 7
	labelW    = (pageW - 2*marginX) / cols // 47.5mm
	labelH    = 36.0
	perPage   = cols * rows
	qrSizeMM  = 22.0
	labelPadY = 2.5
)

// BuildLabelPDF produces a print-ready sheet of QR labels — one label per QR
// code, laid out 4x7 on A4 with cut guides.
func BuildLabelPDF(codes []models.QRCode, title string) ([]byte, error) {
	if len(codes) == 0 {
		return nil, fmt.Errorf("no QR codes to print")
	}

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetTitle(title, true)
	pdf.SetAutoPageBreak(false, 0)

	for i, code := range codes {
		if i%perPage == 0 {
			pdf.AddPage()
			drawSheetHeader(pdf, title, i/perPage+1, (len(codes)+perPage-1)/perPage)
		}

		idx := i % perPage
		col := idx % cols
		row := idx / cols

		x := marginX + float64(col)*labelW
		y := marginTop + float64(row)*labelH

		if err := drawLabel(pdf, code, x, y); err != nil {
			return nil, err
		}
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("write pdf: %w", err)
	}
	return buf.Bytes(), nil
}

func drawSheetHeader(pdf *fpdf.Fpdf, title string, page, total int) {
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetTextColor(60, 60, 60)
	pdf.SetXY(marginX, 6)
	pdf.CellFormat(100, 5, title, "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(140, 140, 140)
	pdf.SetXY(pageW-marginX-50, 6)
	pdf.CellFormat(50, 5, fmt.Sprintf("Page %d of %d", page, total), "", 0, "R", false, 0, "")
}

func drawLabel(pdf *fpdf.Fpdf, code models.QRCode, x, y float64) error {
	// Cut guide.
	pdf.SetDrawColor(210, 210, 210)
	pdf.SetLineWidth(0.15)
	pdf.Rect(x, y, labelW, labelH, "D")

	// QR image, centred horizontally in the upper part of the label.
	png, err := GenerateProductQRPNG(code.URL, ProductMark(code.AssetID), 400)
	if err != nil {
		return fmt.Errorf("label %s: %w", code.AssetID, err)
	}

	imgName := "qr_" + code.AssetID
	pdf.RegisterImageOptionsReader(imgName, fpdf.ImageOptions{ImageType: "PNG"}, io.Reader(bytes.NewReader(png)))

	qrX := x + (labelW-qrSizeMM)/2
	qrY := y + labelPadY
	pdf.ImageOptions(imgName, qrX, qrY, qrSizeMM, qrSizeMM, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")

	// Asset ID under the QR.
	pdf.SetFont("Helvetica", "B", 9)
	pdf.SetTextColor(20, 20, 20)
	pdf.SetXY(x, qrY+qrSizeMM+0.8)
	pdf.CellFormat(labelW, 4, code.AssetID, "", 0, "C", false, 0, "")

	// Scan hint.
	pdf.SetFont("Helvetica", "", 5.5)
	pdf.SetTextColor(130, 130, 130)
	pdf.SetXY(x, qrY+qrSizeMM+4.6)
	pdf.CellFormat(labelW, 3, "SCAN FOR DEVICE INFO", "", 0, "C", false, 0, "")

	return nil
}

// BuildSingleQRPDF renders one large QR on its own page — handy for reprinting
// a damaged sticker.
func BuildSingleQRPDF(code models.QRCode) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetTitle(code.AssetID, true)
	pdf.AddPage()

	png, err := GenerateProductQRPNG(code.URL, ProductMark(code.AssetID), 800)
	if err != nil {
		return nil, err
	}

	const size = 100.0
	x := (pageW - size) / 2

	imgName := "qr_single_" + code.AssetID
	pdf.RegisterImageOptionsReader(imgName, fpdf.ImageOptions{ImageType: "PNG"}, io.Reader(bytes.NewReader(png)))
	pdf.ImageOptions(imgName, x, 50, size, size, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")

	pdf.SetFont("Helvetica", "B", 22)
	pdf.SetTextColor(15, 23, 42)
	pdf.SetXY(0, 158)
	pdf.CellFormat(pageW, 10, code.AssetID, "", 0, "C", false, 0, "")

	pdf.SetFont("Helvetica", "", 10)
	pdf.SetTextColor(100, 116, 139)
	pdf.SetXY(0, 170)
	pdf.CellFormat(pageW, 6, code.URL, "", 0, "C", false, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("write pdf: %w", err)
	}
	return buf.Bytes(), nil
}
