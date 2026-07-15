package handlers

import (
	"strings"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func auditListQuery(c *gin.Context) *gorm.DB {
	q := database.DB.Model(&models.AuditLog{})

	if s := strings.TrimSpace(c.Query("search")); s != "" {
		like := "%" + strings.ToLower(s) + "%"
		q = q.Where(`LOWER(user_name) LIKE ? OR LOWER(action) LIKE ? OR
		             LOWER(entity_id) LIKE ? OR LOWER(details) LIKE ? OR ip_address LIKE ?`,
			like, like, like, like, like)
	}
	if v := c.Query("action"); v != "" && v != "all" {
		q = q.Where("action = ?", v)
	}
	if v := c.Query("entity_type"); v != "" && v != "all" {
		q = q.Where("entity_type = ?", v)
	}
	if v := c.Query("user_id"); v != "" {
		q = q.Where("user_id = ?", v)
	}
	if d := utils.ParseDate(c.Query("from")); d != nil {
		q = q.Where("created_at >= ?", *d)
	}
	if d := utils.ParseDate(c.Query("to")); d != nil {
		q = q.Where("created_at <= ?", d.AddDate(0, 0, 1))
	}
	return q
}

// ListAuditLogs returns the audit trail. Admin only.
func ListAuditLogs(c *gin.Context) {
	page, limit, offset := utils.Pagination(c)

	var total int64
	if err := auditListQuery(c).Count(&total).Error; err != nil {
		utils.ServerError(c, "Could not load audit logs")
		return
	}

	var logs []models.AuditLog
	sortable := map[string]bool{"created_at": true, "action": true, "user_name": true}
	if err := auditListQuery(c).
		Order(utils.SafeSort(c, sortable, "created_at desc")).
		Limit(limit).Offset(offset).Find(&logs).Error; err != nil {
		utils.ServerError(c, "Could not load audit logs")
		return
	}

	utils.Paginated(c, logs, utils.Meta{
		Page: page, Limit: limit, Total: total,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	})
}

// AuditActions lists the distinct actions present, for the filter dropdown.
func AuditActions(c *gin.Context) {
	var actions []string
	database.DB.Model(&models.AuditLog{}).Distinct().Order("action asc").Pluck("action", &actions)

	var entities []string
	database.DB.Model(&models.AuditLog{}).Distinct().
		Where("entity_type <> ''").Order("entity_type asc").Pluck("entity_type", &entities)

	utils.OK(c, gin.H{"actions": actions, "entity_types": entities})
}

// ListScans returns the raw QR scan log. Admin only.
func ListScans(c *gin.Context) {
	page, limit, offset := utils.Pagination(c)

	build := func() *gorm.DB {
		q := database.DB.Model(&models.Scan{})
		if s := strings.TrimSpace(c.Query("search")); s != "" {
			q = q.Where("UPPER(asset_id) LIKE ?", "%"+strings.ToUpper(s)+"%")
		}
		if d := utils.ParseDate(c.Query("from")); d != nil {
			q = q.Where("created_at >= ?", *d)
		}
		if d := utils.ParseDate(c.Query("to")); d != nil {
			q = q.Where("created_at <= ?", d.AddDate(0, 0, 1))
		}
		return q
	}

	var total int64
	build().Count(&total)

	var scans []models.Scan
	if err := build().Order("created_at desc").Limit(limit).Offset(offset).Find(&scans).Error; err != nil {
		utils.ServerError(c, "Could not load scan history")
		return
	}

	utils.Paginated(c, scans, utils.Meta{
		Page: page, Limit: limit, Total: total,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	})
}
