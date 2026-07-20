package handlers

import (
	"time"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
)

type kpis struct {
	TotalDevices         int64 `json:"total_devices"`
	TotalQRCodes         int64 `json:"total_qr_codes"`
	AvailableQRCodes     int64 `json:"available_qr_codes"`
	MappedQRCodes        int64 `json:"mapped_qr_codes"`
	ActiveDevices        int64 `json:"active_devices"`
	MaintenanceDevices   int64 `json:"maintenance_devices"`
	WarrantyExpiringSoon int64 `json:"warranty_expiring_soon"`
	WarrantyExpired      int64 `json:"warranty_expired"`
	OpenQueries          int64 `json:"open_queries"`
	InProgressQueries    int64 `json:"in_progress_queries"`
	ClosedQueries        int64 `json:"closed_queries"`
	TodayScans           int64 `json:"today_scans"`
	TodayQueries         int64 `json:"today_queries"`
	MonthlyQueries       int64 `json:"monthly_queries"`
	DepartmentDevices    int64 `json:"department_devices"`
	CompanyDevices       int64 `json:"company_devices"`
	TotalUsers           int64 `json:"total_users"`
}

type nameValue struct {
	Name  string `json:"name"`
	Value int64  `json:"value"`
}

// count runs a scoped COUNT against a model.
func count(model interface{}, where string, args ...interface{}) int64 {
	var n int64
	q := database.DB.Model(model)
	if where != "" {
		q = q.Where(where, args...)
	}
	q.Count(&n)
	return n
}

// groupCount returns the top N distinct values of a column with their counts.
func groupCount(model interface{}, column string, limit int, where string, args ...interface{}) []nameValue {
	var out []nameValue
	q := database.DB.Model(model).
		Select(column + " AS name, COUNT(*) AS value").
		Where(column + " <> ''")
	if where != "" {
		q = q.Where(where, args...)
	}
	q.Group(column).Order("value DESC").Limit(limit).Scan(&out)
	return out
}

// DashboardStats returns every KPI card value in one round trip.
func DashboardStats(c *gin.Context) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	in30Days := now.AddDate(0, 0, 30)

	// Users count only their own tickets; admins and clients count all.
	scopeQueries := func(where string, args ...interface{}) int64 {
		q := database.DB.Model(&models.Query{}).Where(where, args...)
		if !utils.SeesAllQueries(c) {
			q = q.Where("user_id = ?", utils.CurrentUserID(c))
		}
		var n int64
		q.Count(&n)
		return n
	}

	stats := kpis{
		TotalDevices:     count(&models.Device{}, ""),
		TotalQRCodes:     count(&models.QRCode{}, ""),
		AvailableQRCodes: count(&models.QRCode{}, "status = ?", models.QRAvailable),
		MappedQRCodes:    count(&models.QRCode{}, "status = ?", models.QRMapped),

		ActiveDevices:      count(&models.Device{}, "status = ?", models.DeviceActive),
		MaintenanceDevices: count(&models.Device{}, "status = ?", models.DeviceMaintenance),

		WarrantyExpiringSoon: count(&models.Device{},
			"warranty_expiry IS NOT NULL AND warranty_expiry BETWEEN ? AND ?", now, in30Days),
		WarrantyExpired: count(&models.Device{},
			"warranty_expiry IS NOT NULL AND warranty_expiry < ?", now),

		OpenQueries:       scopeQueries("status = ?", models.QueryOpen),
		InProgressQueries: scopeQueries("status = ?", models.QueryInProgress),
		ClosedQueries:     scopeQueries("status = ?", models.QueryClosed),

		TodayScans:     count(&models.Scan{}, "created_at >= ?", todayStart),
		TodayQueries:   scopeQueries("created_at >= ?", todayStart),
		MonthlyQueries: scopeQueries("created_at >= ?", monthStart),

		DepartmentDevices: count(&models.Device{}, "department <> ''"),
		CompanyDevices:    count(&models.Device{}, "company <> ''"),

		TotalUsers: count(&models.User{}, ""),
	}

	utils.OK(c, stats)
}

// DashboardCharts returns every chart series.
func DashboardCharts(c *gin.Context) {
	now := time.Now()

	// Monthly queries — last 12 months, zero-filled so the line has no gaps.
	type monthRow struct {
		Month  string `json:"month"`
		Total  int64  `json:"total"`
		Open   int64  `json:"open"`
		Closed int64  `json:"closed"`
	}

	var rawMonths []struct {
		Bucket time.Time
		Total  int64
		Open   int64
		Closed int64
	}
	database.DB.Model(&models.Query{}).
		Select(`DATE_TRUNC('month', created_at) AS bucket,
		        COUNT(*) AS total,
		        COUNT(*) FILTER (WHERE status IN ('open','in_progress')) AS open,
		        COUNT(*) FILTER (WHERE status = 'closed') AS closed`).
		Where("created_at >= ?", now.AddDate(0, -11, 0)).
		Group("bucket").Order("bucket ASC").
		Scan(&rawMonths)

	byMonth := map[string]monthRow{}
	for _, r := range rawMonths {
		key := r.Bucket.Format("2006-01")
		byMonth[key] = monthRow{Month: r.Bucket.Format("Jan 2006"), Total: r.Total, Open: r.Open, Closed: r.Closed}
	}

	monthly := make([]monthRow, 0, 12)
	for i := 11; i >= 0; i-- {
		m := now.AddDate(0, -i, 0)
		key := m.Format("2006-01")
		if row, ok := byMonth[key]; ok {
			monthly = append(monthly, row)
		} else {
			monthly = append(monthly, monthRow{Month: m.Format("Jan 2006")})
		}
	}

	// Warranty expiry timeline — next 6 months plus an "expired" bucket.
	type warrantyBucket struct {
		Label string `json:"label"`
		Count int64  `json:"count"`
	}
	warranty := []warrantyBucket{
		{"Expired", count(&models.Device{}, "warranty_expiry IS NOT NULL AND warranty_expiry < ?", now)},
	}
	for i := 0; i < 6; i++ {
		start := now.AddDate(0, i, 0)
		end := now.AddDate(0, i+1, 0)
		warranty = append(warranty, warrantyBucket{
			Label: start.Format("Jan 06"),
			Count: count(&models.Device{}, "warranty_expiry BETWEEN ? AND ?", start, end),
		})
	}

	// Scans — last 14 days, zero-filled.
	type dayRow struct {
		Day   string `json:"day"`
		Count int64  `json:"count"`
	}
	var rawScans []struct {
		Bucket time.Time
		Count  int64
	}
	database.DB.Model(&models.Scan{}).
		Select("DATE_TRUNC('day', created_at) AS bucket, COUNT(*) AS count").
		Where("created_at >= ?", now.AddDate(0, 0, -13)).
		Group("bucket").Order("bucket ASC").
		Scan(&rawScans)

	scanByDay := map[string]int64{}
	for _, r := range rawScans {
		scanByDay[r.Bucket.Format("2006-01-02")] = r.Count
	}
	scans := make([]dayRow, 0, 14)
	for i := 13; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		scans = append(scans, dayRow{Day: d.Format("02 Jan"), Count: scanByDay[d.Format("2006-01-02")]})
	}

	utils.OK(c, gin.H{
		"category_distribution":   groupCount(&models.Device{}, "category", 10, ""),
		"brand_distribution":      groupCount(&models.Device{}, "brand", 10, ""),
		"department_distribution": groupCount(&models.Device{}, "department", 10, ""),
		"company_distribution":    groupCount(&models.Device{}, "company", 10, ""),
		"location_distribution":   groupCount(&models.Device{}, "location", 8, ""),
		"device_status":           groupCount(&models.Device{}, "status", 10, ""),
		"qr_status":               groupCount(&models.QRCode{}, "status", 10, ""),
		"query_priority":          groupCount(&models.Query{}, "priority", 5, ""),
		"monthly_queries":         monthly,
		"warranty_timeline":       warranty,
		"scans_daily":             scans,
	})
}

// DashboardRecent returns the activity feed panels.
func DashboardRecent(c *gin.Context) {
	isAdmin := utils.CurrentRole(c) == models.RoleAdmin

	var recentQueries []models.Query
	q := database.DB.Model(&models.Query{})
	if !utils.SeesAllQueries(c) {
		q = q.Where("user_id = ?", utils.CurrentUserID(c))
	}
	q.Order("created_at DESC").Limit(8).Find(&recentQueries)

	var recentDevices []models.Device
	database.DB.Preload("QRCode").Order("created_at DESC").Limit(8).Find(&recentDevices)

	out := gin.H{
		"recent_queries": recentQueries,
		"recent_devices": recentDevices,
	}

	// The audit feed is admin-only.
	if isAdmin {
		var recentActivity []models.AuditLog
		database.DB.Order("created_at DESC").Limit(10).Find(&recentActivity)
		out["recent_activity"] = recentActivity

		var expiring []models.Device
		database.DB.Preload("QRCode").
			Where("warranty_expiry IS NOT NULL AND warranty_expiry BETWEEN ? AND ?",
				time.Now(), time.Now().AddDate(0, 0, 30)).
			Order("warranty_expiry ASC").Limit(8).Find(&expiring)
		out["warranty_expiring"] = expiring
	}

	utils.OK(c, out)
}
