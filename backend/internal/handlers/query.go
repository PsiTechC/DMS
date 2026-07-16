package handlers

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/services"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ticketNumber renders "DMS-2026-000245".
func ticketNumber(year int, seq int64) string {
	return fmt.Sprintf("DMS-%d-%06d", year, seq)
}

// ─── Raise a query ────────────────────────────────────────────────────────

type queryForm struct {
	DeviceID    uint            `json:"device_id"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Priority    models.Priority `json:"priority"`
}

// readQueryForm accepts either JSON or multipart (when an attachment is sent).
func readQueryForm(c *gin.Context) (*queryForm, error) {
	f := &queryForm{}

	if strings.HasPrefix(c.ContentType(), "multipart/form-data") {
		id, err := strconv.ParseUint(c.PostForm("device_id"), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("a valid device must be selected")
		}
		f.DeviceID = uint(id)
		f.Title = c.PostForm("title")
		f.Description = c.PostForm("description")
		f.Priority = models.Priority(c.PostForm("priority"))
	} else if err := c.ShouldBindJSON(f); err != nil {
		return nil, fmt.Errorf("invalid request body")
	}

	f.Title = strings.TrimSpace(f.Title)
	f.Description = strings.TrimSpace(f.Description)

	if f.DeviceID == 0 {
		return nil, fmt.Errorf("a device must be selected")
	}
	if len(f.Title) < 3 {
		return nil, fmt.Errorf("please enter an issue title of at least 3 characters")
	}
	if len(f.Description) < 10 {
		return nil, fmt.Errorf("please describe the issue in at least 10 characters")
	}
	switch f.Priority {
	case models.PriorityLow, models.PriorityMedium, models.PriorityHigh:
	case "":
		f.Priority = models.PriorityMedium
	default:
		return nil, fmt.Errorf("priority must be low, medium, or high")
	}
	return f, nil
}

// CreateQuery raises a ticket against a device. Every device and reporter
// field is copied from the database — the client only sends title,
// description, priority, and an optional attachment.
func CreateQuery(c *gin.Context) {
	form, err := readQueryForm(c)
	if err != nil {
		utils.BadRequest(c, capitalise(err.Error()))
		return
	}

	user, err := utils.CurrentUser(c)
	if err != nil {
		utils.Unauthorized(c, "Please login to raise a query.")
		return
	}

	var device models.Device
	if err := database.DB.Preload("QRCode").First(&device, form.DeviceID).Error; err != nil {
		utils.NotFound(c, "That device no longer exists")
		return
	}

	q := models.Query{
		DeviceID:    device.ID,
		UserID:      user.ID,
		Title:       form.Title,
		Description: form.Description,
		Priority:    form.Priority,
		Status:      models.QueryOpen,

		// Snapshot — device
		DeviceNumber:     device.DeviceNumber,
		DeviceName:       device.DeviceName,
		Brand:            device.Brand,
		Model:            device.Model,
		SerialNumber:     device.SerialNumber,
		AssignedEmployee: device.AssignedEmployee,
		Department:       device.Department,
		Company:          device.Company,
		Project:          device.Project,
		Location:         device.Location,

		// Snapshot — reporter
		ReportedByName:  user.Name,
		ReportedByEmpID: user.EmployeeID,
		ReportedByEmail: user.Email,
	}
	if device.QRCode != nil {
		q.QRNumber = device.QRCode.AssetID
	}

	// Optional attachment.
	if fh, err := c.FormFile("attachment"); err == nil && fh != nil {
		saved, err := services.SaveAttachment(c, fh)
		if err != nil {
			utils.BadRequest(c, "Attachment rejected — "+err.Error())
			return
		}
		q.AttachmentPath = saved.FilePath
		q.AttachmentURL = saved.URL
	}

	// Ticket number and insert share one transaction so a failed insert never
	// burns a ticket number.
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		year := time.Now().Year()
		seq, err := database.NextSequence(tx, fmt.Sprintf("ticket_%d", year), 1)
		if err != nil {
			return err
		}
		q.TicketNumber = ticketNumber(year, seq)
		return tx.Create(&q).Error
	})
	if err != nil {
		_ = services.DeleteFile(q.AttachmentPath)
		utils.ServerError(c, "Could not submit your query. Please try again.")
		return
	}

	utils.Audit(c, models.ActionQuerySubmit, "query", q.TicketNumber, gin.H{
		"device":   q.DeviceNumber,
		"priority": q.Priority,
	})

	// Notify the admin out of band — a slow or broken SMTP server must never
	// make the user think their query failed. It is already saved.
	notifyAdmin(&q)

	utils.Created(c, gin.H{
		"ticket_number": q.TicketNumber,
		"message":       fmt.Sprintf("Query submitted successfully. Your ticket number is %s.", q.TicketNumber),
		"query":         q,
	})
}

// notifyAdmin fires email + WhatsApp notifications in the background.
func notifyAdmin(q *models.Query) {
	// Copy the struct: the caller's request context ends before these run.
	snapshot := *q

	go func() {
		if err := services.SendQueryEmail(&snapshot); err != nil {
			log.Printf("notify: email for %s failed: %v", snapshot.TicketNumber, err)
		}
	}()
	go func() {
		if err := services.SendQueryWhatsApp(&snapshot); err != nil {
			log.Printf("notify: whatsapp for %s failed: %v", snapshot.TicketNumber, err)
		}
	}()
}

// ─── Listing ──────────────────────────────────────────────────────────────

var querySortable = map[string]bool{
	"ticket_number": true, "priority": true, "status": true, "created_at": true, "device_name": true,
}

func queryListQuery(c *gin.Context) *gorm.DB {
	q := database.DB.Model(&models.Query{})

	// Users see only the tickets they raised; admins and clients see all.
	if !utils.SeesAllQueries(c) {
		q = q.Where("user_id = ?", utils.CurrentUserID(c))
	}

	if s := strings.TrimSpace(c.Query("search")); s != "" {
		like := "%" + strings.ToLower(s) + "%"
		q = q.Where(`
			LOWER(ticket_number) LIKE ? OR LOWER(title) LIKE ? OR
			LOWER(device_name) LIKE ? OR LOWER(device_number) LIKE ? OR
			LOWER(qr_number) LIKE ? OR LOWER(reported_by_name) LIKE ?`,
			like, like, like, like, like, like)
	}

	for param, column := range map[string]string{
		"status":     "status",
		"priority":   "priority",
		"department": "department",
		"company":    "company",
	} {
		if v := c.Query(param); v != "" && v != "all" {
			q = q.Where(column+" = ?", v)
		}
	}

	if v := c.Query("device_id"); v != "" {
		q = q.Where("device_id = ?", v)
	}
	if d := utils.ParseDate(c.Query("from")); d != nil {
		q = q.Where("created_at >= ?", *d)
	}
	if d := utils.ParseDate(c.Query("to")); d != nil {
		q = q.Where("created_at <= ?", d.AddDate(0, 0, 1))
	}

	return q
}

// ListQueries returns tickets — all of them for admins, own-only otherwise.
func ListQueries(c *gin.Context) {
	page, limit, offset := utils.Pagination(c)

	var total int64
	if err := queryListQuery(c).Count(&total).Error; err != nil {
		utils.ServerError(c, "Could not load queries")
		return
	}

	var queries []models.Query
	err := queryListQuery(c).
		Order(utils.SafeSort(c, querySortable, "created_at desc")).
		Limit(limit).Offset(offset).
		Find(&queries).Error
	if err != nil {
		utils.ServerError(c, "Could not load queries")
		return
	}

	utils.Paginated(c, queries, utils.Meta{
		Page: page, Limit: limit, Total: total,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	})
}

// GetQuery returns one ticket. Non-admins may only read their own.
func GetQuery(c *gin.Context) {
	var q models.Query
	if err := database.DB.Preload("Device").Preload("User").First(&q, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Query not found")
		return
	}

	if !utils.SeesAllQueries(c) && q.UserID != utils.CurrentUserID(c) {
		utils.Forbidden(c, "You can only view queries you raised")
		return
	}

	utils.OK(c, q)
}

// ─── Status changes (admin) ───────────────────────────────────────────────

type queryStatusRequest struct {
	Status       models.QueryStatus `json:"status" binding:"required"`
	AdminRemarks string             `json:"admin_remarks"`
}

// UpdateQueryStatus moves a ticket through its lifecycle. Admin only.
func UpdateQueryStatus(c *gin.Context) {
	var req queryStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "A status is required")
		return
	}

	valid := map[models.QueryStatus]bool{
		models.QueryOpen: true, models.QueryInProgress: true,
		models.QueryClosed: true, models.QueryRejected: true,
	}
	if !valid[req.Status] {
		utils.BadRequest(c, "Status must be one of: open, in_progress, closed, rejected")
		return
	}

	var q models.Query
	if err := database.DB.First(&q, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Query not found")
		return
	}

	old := q.Status
	updates := map[string]interface{}{"status": req.Status}
	if req.AdminRemarks != "" {
		updates["admin_remarks"] = req.AdminRemarks
	}
	if req.Status == models.QueryClosed || req.Status == models.QueryRejected {
		now := time.Now()
		updates["resolved_at"] = now
	} else {
		updates["resolved_at"] = nil
	}

	if err := database.DB.Model(&q).Updates(updates).Error; err != nil {
		utils.ServerError(c, "Could not update the query status")
		return
	}

	database.DB.First(&q, q.ID)

	utils.Audit(c, models.ActionQueryStatus, "query", q.TicketNumber, gin.H{"from": old, "to": req.Status})

	// Tell the reporter, best-effort.
	snapshot := q
	go func() {
		if err := services.SendQueryStatusEmail(&snapshot, old); err != nil {
			log.Printf("notify: status email for %s failed: %v", snapshot.TicketNumber, err)
		}
	}()

	utils.OKMessage(c, fmt.Sprintf("%s is now %s", q.TicketNumber, req.Status), q)
}

func capitalise(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// ─── SMTP test (admin) ────────────────────────────────────────────────────

// TestEmail lets an admin verify SMTP settings from the UI.
func TestEmail(c *gin.Context) {
	var body struct {
		To string `json:"to"`
	}
	_ = c.ShouldBindJSON(&body)

	if err := services.TestSMTP(body.To); err != nil {
		utils.BadRequest(c, "Test email failed: "+err.Error())
		return
	}
	utils.OKMessage(c, "Test email sent successfully. Check the inbox.", nil)
}
