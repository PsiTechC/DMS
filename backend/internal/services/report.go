package services

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"
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

// PDF layout constants, in millimetres.
const (
	pdfMarginX = 8.0
	pdfMarginT = 8.0
	pdfMarginB = 12.0
	cellPadX   = 1.2
	cellPadY   = 0.8
	minColW    = 11.0 // below this even a wrapped word is unreadable
	maxColW    = 46.0 // stops a long description from starving every other column
	maxCellLns = 4    // a runaway cell must not create a page-tall row
)

// pageSize picks the sheet from how many columns must fit. A4 landscape gives
// 281mm of usable width; past ~16 columns that leaves too little per column for
// real values like "DMS-2026-000001", so the sheet steps up to A3 rather than
// shrinking the text into illegibility.
func pageSize(cols int) (string, float64) {
	if cols >= 16 {
		return "A3", 420.0
	}
	return "A4", 297.0
}

// fontSize shrinks with column count, within readable limits.
func fontSize(cols int) float64 {
	switch {
	case cols >= 16:
		return 6.6
	case cols >= 12:
		return 7.0
	case cols >= 9:
		return 7.5
	default:
		return 8.5
	}
}

// ToPDF renders the table as a landscape PDF.
//
// Columns are sized to their actual content — measured with the real font
// metrics, not guessed from a character count — and cells wrap onto extra
// lines instead of being cut off. Every value stays readable.
func (t *Table) ToPDF() ([]byte, error) {
	cols := len(t.Headers)
	if cols == 0 {
		return nil, fmt.Errorf("report has no columns")
	}

	size, pageWidth := pageSize(cols)
	pdf := fpdf.New("L", "mm", size, "")
	pdf.SetTitle(t.Title, true)
	pdf.SetMargins(pdfMarginX, pdfMarginT, pdfMarginX)
	pdf.SetAutoPageBreak(false, pdfMarginB) // rows are placed by hand, see below

	usableW := pageWidth - 2*pdfMarginX
	fs := fontSize(cols)
	lineH := fs * 0.42 // mm per text line at this point size
	if lineH < 2.6 {
		lineH = 2.6
	}

	// A page is needed before GetStringWidth will measure anything.
	pdf.AddPage()
	pdf.SetFont("Helvetica", "", fs)

	// fpdf's SplitLines quietly subtracts its own cell margin (~2mm) from the
	// width it is handed, so a column sized to fit a word exactly would still
	// break that word. Zero it and do the padding ourselves — every cell here
	// is positioned by hand anyway.
	pdf.SetCellMargin(0)

	widths := t.measureColumns(pdf, fs, usableW)

	// ─── Drawing helpers ──────────────────────────────────────────────
	_, pageHeight := pdf.GetPageSize()
	bottom := pageHeight - pdfMarginB

	// wrap splits a value into the lines that fit its column.
	wrap := func(text string, w float64) []string {
		if strings.TrimSpace(text) == "" {
			return []string{""}
		}
		raw := pdf.SplitLines([]byte(text), w-2*cellPadX)
		if len(raw) == 0 {
			return []string{""}
		}
		out := make([]string, 0, len(raw))
		for i, b := range raw {
			if i == maxCellLns {
				// Mark the truncation rather than dropping content silently.
				// ASCII "..." not "…": core fonts are cp1252-encoded.
				last := out[len(out)-1]
				if len(last) > 3 {
					out[len(out)-1] = last[:len(last)-3] + "..."
				}
				break
			}
			out = append(out, string(b))
		}
		return out
	}

	drawTitle := func() {
		pdf.SetXY(pdfMarginX, pdfMarginT)
		pdf.SetFont("Helvetica", "B", 13)
		pdf.SetTextColor(15, 23, 42)
		pdf.CellFormat(0, 6, t.Title, "", 1, "L", false, 0, "")
		pdf.SetFont("Helvetica", "", 7.5)
		pdf.SetTextColor(120, 130, 145)
		// ASCII only here: fpdf writes core fonts in cp1252, so a UTF-8 middot
		// or en-dash comes out as mojibake ("Â·") rather than the glyph.
		pdf.CellFormat(0, 4, fmt.Sprintf("Generated %s  |  %d record%s",
			time.Now().Format("02 Jan 2006, 03:04 PM"), len(t.Rows), plural(len(t.Rows))),
			"", 1, "L", false, 0, "")
	}

	// drawHeaderRow returns the y just below the header it drew.
	drawHeaderRow := func(y float64) float64 {
		pdf.SetFont("Helvetica", "B", fs)

		// Headers wrap too, so "Assigned Employee" survives a narrow column.
		cells := make([][]string, cols)
		maxLines := 1
		for i, h := range t.Headers {
			cells[i] = wrap(h, widths[i])
			if len(cells[i]) > maxLines {
				maxLines = len(cells[i])
			}
		}
		h := float64(maxLines)*lineH + 2*cellPadY + 1

		pdf.SetFillColor(30, 58, 138)
		pdf.SetTextColor(255, 255, 255)
		pdf.SetDrawColor(30, 58, 138)
		pdf.SetLineWidth(0.1)

		x := pdfMarginX
		for i := range t.Headers {
			pdf.Rect(x, y, widths[i], h, "FD")
			for j, line := range cells[i] {
				pdf.SetXY(x+cellPadX, y+cellPadY+float64(j)*lineH)
				pdf.CellFormat(widths[i]-2*cellPadX, lineH, line, "", 0, "L", false, 0, "")
			}
			x += widths[i]
		}
		return y + h
	}

	// ─── Body ─────────────────────────────────────────────────────────
	drawTitle()
	y := pdfMarginT + 13
	y = drawHeaderRow(y)

	pdf.SetFont("Helvetica", "", fs)

	for i, row := range t.Rows {
		// Measure the row before committing to it, so a tall wrapped row is
		// never split across a page break.
		cells := make([][]string, cols)
		maxLines := 1
		for c := 0; c < cols; c++ {
			val := ""
			if c < len(row) {
				val = row[c]
			}
			cells[c] = wrap(val, widths[c])
			if len(cells[c]) > maxLines {
				maxLines = len(cells[c])
			}
		}
		rowH := float64(maxLines)*lineH + 2*cellPadY

		if y+rowH > bottom {
			pdf.AddPage()
			pdf.SetFont("Helvetica", "", fs)
			drawTitle()
			y = pdfMarginT + 13
			y = drawHeaderRow(y)
			pdf.SetFont("Helvetica", "", fs)
		}

		if i%2 == 1 {
			pdf.SetFillColor(244, 247, 251)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}
		pdf.SetDrawColor(214, 222, 232)
		pdf.SetTextColor(28, 35, 48)
		pdf.SetLineWidth(0.1)

		x := pdfMarginX
		for c := 0; c < cols; c++ {
			pdf.Rect(x, y, widths[c], rowH, "FD")
			for j, line := range cells[c] {
				pdf.SetXY(x+cellPadX, y+cellPadY+float64(j)*lineH)
				pdf.CellFormat(widths[c]-2*cellPadX, lineH, line, "", 0, "L", false, 0, "")
			}
			x += widths[c]
		}
		y += rowH
	}

	if len(t.Rows) == 0 {
		pdf.SetXY(pdfMarginX, y+6)
		pdf.SetFont("Helvetica", "I", 9)
		pdf.SetTextColor(140, 150, 165)
		pdf.CellFormat(usableW, 8, "No records matched this report's filters.", "", 1, "C", false, 0, "")
	}

	// Footers are stamped at the end, once the page count is known.
	total := pdf.PageCount()
	for p := 1; p <= total; p++ {
		pdf.SetPage(p)
		pdf.SetXY(pdfMarginX, pageHeight-pdfMarginB+3)
		pdf.SetFont("Helvetica", "", 7)
		pdf.SetTextColor(150, 158, 170)
		pdf.CellFormat(usableW, 5, fmt.Sprintf("%s  |  Page %d of %d", t.Title, p, total), "", 0, "C", false, 0, "")
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("write pdf: %w", err)
	}
	return buf.Bytes(), nil
}

// measureColumns sizes each column from the width its content actually needs,
// then fits the total to the page.
//
// The important part is the floor. A column's minimum is the width of its
// widest single WORD, not an arbitrary constant — text only wraps at spaces,
// so a column narrower than its longest word gets broken mid-word, turning
// "DMS-2026-000001" into "DMS-2026-00000" / "7". Atomic values (IDs, dates,
// statuses, emails) are single words, so this floor keeps them intact and
// pushes all the shrinking onto prose columns, which wrap cleanly.
func (t *Table) measureColumns(pdf *fpdf.Fpdf, fs, usableW float64) []float64 {
	cols := len(t.Headers)
	natural := make([]float64, cols)
	minimum := make([]float64, cols)

	// widestWord measures the longest unbreakable run in a string.
	widestWord := func(s string) float64 {
		w := 0.0
		for _, word := range strings.Fields(s) {
			if ww := pdf.GetStringWidth(word); ww > w {
				w = ww
			}
		}
		return w
	}

	// Sampling caps the cost on a 10k-row export; the widest of the first 400
	// rows is a good enough proxy for the column's real demand.
	limit := len(t.Rows)
	if limit > 400 {
		limit = 400
	}

	for i := 0; i < cols; i++ {
		pdf.SetFont("Helvetica", "B", fs)
		full := pdf.GetStringWidth(t.Headers[i])
		word := widestWord(t.Headers[i])

		pdf.SetFont("Helvetica", "", fs)
		for r := 0; r < limit; r++ {
			if i >= len(t.Rows[r]) {
				continue
			}
			cell := t.Rows[r][i]
			if cw := pdf.GetStringWidth(cell); cw > full {
				full = cw
			}
			if ww := widestWord(cell); ww > word {
				word = ww
			}
		}

		pad := 2*cellPadX + 1.2

		n := full + pad
		if n > maxColW {
			n = maxColW // long prose wraps rather than hogging the sheet
		}

		m := word + pad
		if m < minColW {
			m = minColW
		}
		// A pathologically long single token (a 60-char URL) must not be
		// allowed to starve every other column; let that one break instead.
		if m > maxColW {
			m = maxColW
		}
		if n < m {
			n = m
		}

		natural[i], minimum[i] = n, m
	}

	totalNat, totalMin := 0.0, 0.0
	for i := range natural {
		totalNat += natural[i]
		totalMin += minimum[i]
	}

	widths := make([]float64, cols)

	switch {
	case totalNat <= usableW:
		// Everything fits: spread the slack so the table fills the sheet
		// rather than leaving a ragged gap down the right-hand side.
		scale := usableW / totalNat
		for i := range natural {
			widths[i] = natural[i] * scale
		}

	case totalMin <= usableW:
		// The usual case. Every column keeps its longest word intact, and the
		// leftover space is shared out in proportion to how much each column
		// still wants — so prose columns absorb the squeeze, not the IDs.
		slack := usableW - totalMin
		flex := totalNat - totalMin
		for i := range natural {
			if flex <= 0 {
				widths[i] = minimum[i]
				continue
			}
			widths[i] = minimum[i] + (natural[i]-minimum[i])*(slack/flex)
		}

	default:
		// Even the longest words cannot all fit. Nothing can prevent breaking
		// here, so shrink evenly and let wrapping do what it can.
		scale := usableW / totalMin
		for i := range minimum {
			widths[i] = minimum[i] * scale
		}
	}

	return widths
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
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
