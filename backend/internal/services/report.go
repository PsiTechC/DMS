package services

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/xuri/excelize/v2"
)

// Table is a generic rectangular dataset ready for export.
type Table struct {
	Title   string
	Headers []string
	Rows    [][]string
}

// ToCSV renders the table as CSV bytes.
func (t *Table) ToCSV() ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)

	if err := w.Write(t.Headers); err != nil {
		return nil, fmt.Errorf("write csv header: %w", err)
	}
	for _, row := range t.Rows {
		if err := w.Write(row); err != nil {
			return nil, fmt.Errorf("write csv row: %w", err)
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("flush csv: %w", err)
	}
	return buf.Bytes(), nil
}

// ToExcel renders the table as a styled .xlsx workbook.
func (t *Table) ToExcel() ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	sheet := "Report"
	idx, err := f.NewSheet(sheet)
	if err != nil {
		return nil, fmt.Errorf("create sheet: %w", err)
	}
	f.SetActiveSheet(idx)
	f.DeleteSheet("Sheet1")

	// Title row.
	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 14, Color: "1E3A8A"},
	})
	f.SetCellValue(sheet, "A1", t.Title)
	f.SetCellStyle(sheet, "A1", "A1", titleStyle)
	f.SetCellValue(sheet, "A2", "Generated: "+time.Now().Format("02 Jan 2006, 03:04 PM"))

	// Header row.
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"1E3A8A"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center"},
	})

	const headerRow = 4
	for i, h := range t.Headers {
		cell, err := excelize.CoordinatesToCellName(i+1, headerRow)
		if err != nil {
			return nil, err
		}
		f.SetCellValue(sheet, cell, h)
		f.SetCellStyle(sheet, cell, cell, headerStyle)

		col, _ := excelize.ColumnNumberToName(i + 1)
		f.SetColWidth(sheet, col, col, columnWidth(h, t.Rows, i))
	}
	f.SetRowHeight(sheet, headerRow, 22)

	// Data rows.
	for r, row := range t.Rows {
		for cIdx, val := range row {
			cell, err := excelize.CoordinatesToCellName(cIdx+1, headerRow+1+r)
			if err != nil {
				return nil, err
			}
			f.SetCellValue(sheet, cell, val)
		}
	}

	// Freeze the header and enable autofilter for usable large exports.
	lastCol, _ := excelize.ColumnNumberToName(len(t.Headers))
	f.SetPanes(sheet, &excelize.Panes{
		Freeze: true, Split: false, XSplit: 0, YSplit: headerRow,
		TopLeftCell: "A" + fmt.Sprint(headerRow+1), ActivePane: "bottomLeft",
	})
	f.AutoFilter(sheet, fmt.Sprintf("A%d:%s%d", headerRow, lastCol, headerRow+len(t.Rows)), nil)

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write xlsx: %w", err)
	}
	return buf.Bytes(), nil
}

// ToPDF renders the table as a landscape A4 PDF.
func (t *Table) ToPDF() ([]byte, error) {
	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetTitle(t.Title, true)
	pdf.SetAutoPageBreak(true, 12)

	const usableW = 297.0 - 20.0 // landscape A4 minus margins
	colW := usableW / float64(len(t.Headers))

	drawHeader := func() {
		pdf.SetFont("Helvetica", "B", 7.5)
		pdf.SetFillColor(30, 58, 138)
		pdf.SetTextColor(255, 255, 255)
		for _, h := range t.Headers {
			pdf.CellFormat(colW, 7, truncate(h, maxChars(colW, 7.5)), "1", 0, "L", true, 0, "")
		}
		pdf.Ln(-1)
	}

	pdf.SetHeaderFunc(func() {
		pdf.SetY(8)
		pdf.SetFont("Helvetica", "B", 12)
		pdf.SetTextColor(30, 41, 59)
		pdf.CellFormat(0, 6, t.Title, "", 1, "L", false, 0, "")
		pdf.SetFont("Helvetica", "", 7)
		pdf.SetTextColor(120, 120, 120)
		pdf.CellFormat(0, 4, "Generated "+time.Now().Format("02 Jan 2006, 03:04 PM"), "", 1, "L", false, 0, "")
		pdf.Ln(2)
		drawHeader()
	})

	pdf.SetFooterFunc(func() {
		pdf.SetY(-12)
		pdf.SetFont("Helvetica", "", 7)
		pdf.SetTextColor(150, 150, 150)
		pdf.CellFormat(0, 6, fmt.Sprintf("Page %d", pdf.PageNo()), "", 0, "C", false, 0, "")
	})

	pdf.AddPage()

	pdf.SetFont("Helvetica", "", 7)
	pdf.SetTextColor(30, 30, 30)
	pdf.SetDrawColor(220, 220, 220)

	for i, row := range t.Rows {
		// Zebra striping keeps wide tables readable.
		if i%2 == 1 {
			pdf.SetFillColor(245, 247, 250)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}
		for _, val := range row {
			pdf.CellFormat(colW, 6, truncate(val, maxChars(colW, 7)), "1", 0, "L", true, 0, "")
		}
		pdf.Ln(-1)
	}

	if len(t.Rows) == 0 {
		pdf.SetFont("Helvetica", "I", 9)
		pdf.SetTextColor(140, 140, 140)
		pdf.CellFormat(0, 10, "No records matched this report's filters.", "", 1, "C", false, 0, "")
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("write pdf: %w", err)
	}
	return buf.Bytes(), nil
}

// maxChars estimates how many glyphs fit in a cell of the given width.
func maxChars(widthMM, fontPt float64) int {
	approxCharW := fontPt * 0.38 // rough Helvetica average advance in mm
	n := int(widthMM / approxCharW)
	if n < 4 {
		return 4
	}
	return n
}

// columnWidth sizes an Excel column to its widest value, within bounds.
func columnWidth(header string, rows [][]string, idx int) float64 {
	w := len(header)
	for _, r := range rows {
		if idx < len(r) && len(r[idx]) > w {
			w = len(r[idx])
		}
	}
	width := float64(w) + 3
	if width < 10 {
		width = 10
	}
	if width > 45 {
		width = 45
	}
	return width
}
