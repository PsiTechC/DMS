package handlers

import (
	"fmt"
	"net/http"
	"time"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/services"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
)

func fmtDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

// ExportReport builds one of the supported reports and streams it back in the
// requested format.
//
//	GET /api/reports/:type?format=excel|csv|pdf  (+ the same filters as the list endpoints)
//	type: devices | qr_codes | queries | warranty | inventory | department_assets | audit
func ExportReport(c *gin.Context) {
	reportType := c.Param("type")
	format := c.DefaultQuery("format", "excel")

	var table *services.Table
	var err error

	switch reportType {
	case "devices":
		table, err = deviceReport(c)
	case "qr_codes":
		table, err = qrReport(c)
	case "queries":
		table, err = queryReport(c)
	case "warranty":
		table, err = warrantyReport(c)
	case "inventory":
		table, err = inventoryReport(c)
	case "department_assets":
		table, err = departmentReport(c)
	case "audit":
		table, err = auditReport(c)
	default:
		utils.BadRequest(c, "Unknown report. Choose one of: devices, qr_codes, queries, warranty, inventory, department_assets, audit")
		return
	}

	if err != nil {
		utils.ServerError(c, "Could not build the report: "+err.Error())
		return
	}

	var data []byte
	var contentType, ext string

	switch format {
	case "csv":
		data, err = table.ToCSV()
		contentType, ext = "text/csv", "csv"
	case "pdf":
		data, err = table.ToPDF()
		contentType, ext = "application/pdf", "pdf"
	case "excel", "xlsx":
		data, err = table.ToExcel()
		contentType, ext = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
	default:
		utils.BadRequest(c, "Format must be excel, csv, or pdf")
		return
	}

	if err != nil {
		utils.ServerError(c, "Could not render the report: "+err.Error())
		return
	}

	utils.Audit(c, models.ActionReportExport, "report", reportType, gin.H{"format": format, "rows": len(table.Rows)})

	filename := fmt.Sprintf("%s-report-%s.%s", reportType, time.Now().Format("20060102-150405"), ext)
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, contentType, data)
}

// ─── Report builders ──────────────────────────────────────────────────────

func deviceReport(c *gin.Context) (*services.Table, error) {
	var devices []models.Device
	if err := deviceListQuery(c).Preload("QRCode").Order("devices.device_number asc").Find(&devices).Error; err != nil {
		return nil, err
	}

	t := &services.Table{
		Title: "Device Report",
		Headers: []string{
			"Device Number", "QR Number", "Device Name", "Category", "Brand", "Model",
			"Serial Number", "Purchase Date", "Warranty Expiry", "Company", "Project",
			"Department", "Assigned Employee", "Location", "Vendor", "Status", "Condition",
		},
	}

	for _, d := range devices {
		qr := ""
		if d.QRCode != nil {
			qr = d.QRCode.AssetID
		}
		t.Rows = append(t.Rows, []string{
			d.DeviceNumber, qr, d.DeviceName, d.Category, d.Brand, d.Model,
			d.SerialNumber, fmtDate(d.PurchaseDate), fmtDate(d.WarrantyExpiry),
			d.Company, d.Project, d.Department, d.AssignedEmployee, d.Location,
			d.Vendor, string(d.Status), d.Condition,
		})
	}
	return t, nil
}

func qrReport(c *gin.Context) (*services.Table, error) {
	var codes []models.QRCode
	if err := qrListQuery(c).Preload("Device").Order("asset_id asc").Find(&codes).Error; err != nil {
		return nil, err
	}

	t := &services.Table{
		Title:   "QR Code Report",
		Headers: []string{"QR Number", "Status", "Batch", "Mapped Device", "Device Number", "Scans", "Mapped On", "Generated On", "URL"},
	}

	for _, q := range codes {
		name, number := "", ""
		if q.Device != nil {
			name, number = q.Device.DeviceName, q.Device.DeviceNumber
		}
		t.Rows = append(t.Rows, []string{
			q.AssetID, string(q.Status), q.BatchID, name, number,
			fmt.Sprint(q.ScanCount), fmtDate(q.MappedAt),
			q.CreatedAt.Format("2006-01-02"), q.URL,
		})
	}
	return t, nil
}

func queryReport(c *gin.Context) (*services.Table, error) {
	var queries []models.Query
	if err := queryListQuery(c).Order("created_at desc").Find(&queries).Error; err != nil {
		return nil, err
	}

	t := &services.Table{
		Title: "Query / Ticket Report",
		Headers: []string{
			"Ticket Number", "Date", "Status", "Priority", "Issue Title",
			"Device Number", "QR Number", "Device Name", "Brand", "Model", "Serial Number",
			"Company", "Project", "Department", "Location",
			"Reported By", "Employee ID", "Email", "Resolved On",
		},
	}

	for _, q := range queries {
		t.Rows = append(t.Rows, []string{
			q.TicketNumber, q.CreatedAt.Format("2006-01-02 15:04"), string(q.Status), string(q.Priority), q.Title,
			q.DeviceNumber, q.QRNumber, q.DeviceName, q.Brand, q.Model, q.SerialNumber,
			q.Company, q.Project, q.Department, q.Location,
			q.ReportedByName, q.ReportedByEmpID, q.ReportedByEmail, fmtDate(q.ResolvedAt),
		})
	}
	return t, nil
}

func warrantyReport(c *gin.Context) (*services.Table, error) {
	var devices []models.Device
	err := database.DB.Preload("QRCode").
		Where("warranty_expiry IS NOT NULL").
		Order("warranty_expiry asc").
		Find(&devices).Error
	if err != nil {
		return nil, err
	}

	t := &services.Table{
		Title:   "Warranty Expiry Report",
		Headers: []string{"Device Number", "QR Number", "Device Name", "Brand", "Model", "Serial Number", "Purchase Date", "Warranty Expiry", "Days Remaining", "Warranty State", "Department", "Company", "Location", "Vendor"},
	}

	now := time.Now()
	for _, d := range devices {
		days := int(d.WarrantyExpiry.Sub(now).Hours() / 24)

		state := "Active"
		switch {
		case days < 0:
			state = "Expired"
		case days <= 30:
			state = "Expiring Soon"
		case days <= 90:
			state = "Expiring in 90 Days"
		}

		qr := ""
		if d.QRCode != nil {
			qr = d.QRCode.AssetID
		}

		t.Rows = append(t.Rows, []string{
			d.DeviceNumber, qr, d.DeviceName, d.Brand, d.Model, d.SerialNumber,
			fmtDate(d.PurchaseDate), fmtDate(d.WarrantyExpiry),
			fmt.Sprint(days), state, d.Department, d.Company, d.Location, d.Vendor,
		})
	}
	return t, nil
}

func inventoryReport(c *gin.Context) (*services.Table, error) {
	type row struct {
		Category string
		Brand    string
		Total    int64
		Active   int64
		Maint    int64
		Retired  int64
	}

	var rows []row
	err := database.DB.Model(&models.Device{}).
		Select(`category, brand,
		        COUNT(*) AS total,
		        COUNT(*) FILTER (WHERE status = 'active') AS active,
		        COUNT(*) FILTER (WHERE status = 'maintenance') AS maint,
		        COUNT(*) FILTER (WHERE status = 'retired') AS retired`).
		Group("category, brand").
		Order("total DESC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	t := &services.Table{
		Title:   "Device Inventory Summary",
		Headers: []string{"Category", "Brand", "Total", "Active", "Under Maintenance", "Retired"},
	}
	for _, r := range rows {
		t.Rows = append(t.Rows, []string{
			orDash(r.Category), orDash(r.Brand),
			fmt.Sprint(r.Total), fmt.Sprint(r.Active), fmt.Sprint(r.Maint), fmt.Sprint(r.Retired),
		})
	}
	return t, nil
}

func departmentReport(c *gin.Context) (*services.Table, error) {
	type row struct {
		Department string
		Company    string
		Total      int64
		Active     int64
		Maint      int64
		Employees  int64
	}

	var rows []row
	err := database.DB.Model(&models.Device{}).
		Select(`department, company,
		        COUNT(*) AS total,
		        COUNT(*) FILTER (WHERE status = 'active') AS active,
		        COUNT(*) FILTER (WHERE status = 'maintenance') AS maint,
		        COUNT(DISTINCT assigned_employee) FILTER (WHERE assigned_employee <> '') AS employees`).
		Group("department, company").
		Order("total DESC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	t := &services.Table{
		Title:   "Department-wise Asset Report",
		Headers: []string{"Department", "Company", "Total Devices", "Active", "Under Maintenance", "Assigned Employees"},
	}
	for _, r := range rows {
		t.Rows = append(t.Rows, []string{
			orDash(r.Department), orDash(r.Company),
			fmt.Sprint(r.Total), fmt.Sprint(r.Active), fmt.Sprint(r.Maint), fmt.Sprint(r.Employees),
		})
	}
	return t, nil
}

func auditReport(c *gin.Context) (*services.Table, error) {
	var logs []models.AuditLog
	if err := auditListQuery(c).Order("created_at desc").Limit(10000).Find(&logs).Error; err != nil {
		return nil, err
	}

	t := &services.Table{
		Title:   "Audit Log Report",
		Headers: []string{"Date", "Time", "User", "Role", "Action", "Entity", "Reference", "IP Address", "Details"},
	}
	for _, l := range logs {
		t.Rows = append(t.Rows, []string{
			l.CreatedAt.Format("2006-01-02"), l.CreatedAt.Format("15:04:05"),
			l.UserName, l.UserRole, l.Action, l.EntityType, l.EntityID, l.IPAddress, l.Details,
		})
	}
	return t, nil
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}
