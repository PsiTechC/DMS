package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"dms/backend/internal/config"
	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/services"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const qrSequenceName = "qr_asset_id"

// assetID renders sequence 1 -> "DMS000001".
func assetID(n int64) string {
	return fmt.Sprintf("DMS%06d", n)
}

func qrURL(asset string) string {
	return fmt.Sprintf("%s/device/%s", strings.TrimRight(config.C.PublicBaseURL, "/"), asset)
}

// ─── Bulk generation ──────────────────────────────────────────────────────

type generateQRRequest struct {
	Quantity int    `json:"quantity" binding:"required,min=1,max=5000"`
	Notes    string `json:"notes"`
}

// GenerateQRCodes creates a contiguous block of unique QR codes in one
// transaction. Admin only.
func GenerateQRCodes(c *gin.Context) {
	var req generateQRRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Quantity must be a number between 1 and 5000")
		return
	}

	batchID := "BATCH-" + time.Now().Format("20060102-150405") + "-" + uuid.NewString()[:6]
	createdBy := utils.CurrentUserID(c)

	var codes []models.QRCode

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		// Reserve the whole block atomically so parallel admins never collide.
		last, err := database.NextSequence(tx, qrSequenceName, int64(req.Quantity))
		if err != nil {
			return err
		}
		start := last - int64(req.Quantity) + 1

		codes = make([]models.QRCode, 0, req.Quantity)
		for i := int64(0); i < int64(req.Quantity); i++ {
			id := assetID(start + i)
			codes = append(codes, models.QRCode{
				AssetID:   id,
				URL:       qrURL(id),
				Status:    models.QRAvailable,
				BatchID:   batchID,
				Notes:     req.Notes,
				CreatedBy: createdBy,
			})
		}

		// Batched insert keeps 1000+ rows to a handful of round trips.
		return tx.CreateInBatches(&codes, 500).Error
	})

	if err != nil {
		utils.ServerError(c, "Could not generate QR codes: "+err.Error())
		return
	}

	utils.Audit(c, models.ActionQRGenerated, "qr_batch", batchID, gin.H{
		"quantity": req.Quantity,
		"from":     codes[0].AssetID,
		"to":       codes[len(codes)-1].AssetID,
	})

	utils.Created(c, gin.H{
		"batch_id": batchID,
		"quantity": len(codes),
		"from":     codes[0].AssetID,
		"to":       codes[len(codes)-1].AssetID,
		"codes":    codes,
	})
}

// ─── Listing ──────────────────────────────────────────────────────────────

var qrSortable = map[string]bool{
	"asset_id": true, "status": true, "created_at": true, "scan_count": true, "mapped_at": true,
}

func qrListQuery(c *gin.Context) *gorm.DB {
	q := database.DB.Model(&models.QRCode{})

	if s := strings.TrimSpace(c.Query("search")); s != "" {
		like := "%" + strings.ToUpper(s) + "%"
		q = q.Where("UPPER(asset_id) LIKE ? OR UPPER(batch_id) LIKE ?", like, like)
	}
	if s := c.Query("status"); s != "" && s != "all" {
		q = q.Where("status = ?", s)
	}
	if s := c.Query("batch_id"); s != "" {
		q = q.Where("batch_id = ?", s)
	}
	return q
}

// ListQRCodes returns a filtered, paginated page of QR codes.
func ListQRCodes(c *gin.Context) {
	page, limit, offset := utils.Pagination(c)

	var total int64
	if err := qrListQuery(c).Count(&total).Error; err != nil {
		utils.ServerError(c, "Could not load QR codes")
		return
	}

	var codes []models.QRCode
	err := qrListQuery(c).
		Preload("Device").
		Order(utils.SafeSort(c, qrSortable, "asset_id asc")).
		Limit(limit).Offset(offset).
		Find(&codes).Error
	if err != nil {
		utils.ServerError(c, "Could not load QR codes")
		return
	}

	utils.Paginated(c, codes, utils.Meta{
		Page: page, Limit: limit, Total: total,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	})
}

// ListQRBatches summarises each generated batch for the print screen.
func ListQRBatches(c *gin.Context) {
	type batch struct {
		BatchID   string    `json:"batch_id"`
		Quantity  int64     `json:"quantity"`
		Mapped    int64     `json:"mapped"`
		FromAsset string    `json:"from_asset"`
		ToAsset   string    `json:"to_asset"`
		CreatedAt time.Time `json:"created_at"`
	}

	var out []batch
	err := database.DB.Model(&models.QRCode{}).
		Select(`batch_id,
		        COUNT(*) AS quantity,
		        COUNT(*) FILTER (WHERE status = 'mapped') AS mapped,
		        MIN(asset_id) AS from_asset,
		        MAX(asset_id) AS to_asset,
		        MIN(created_at) AS created_at`).
		Where("batch_id <> ''").
		Group("batch_id").
		Order("created_at DESC").
		Limit(100).
		Scan(&out).Error
	if err != nil {
		utils.ServerError(c, "Could not load QR batches")
		return
	}
	utils.OK(c, out)
}

// ─── Public scan ──────────────────────────────────────────────────────────

type scanResponse struct {
	AssetID  string         `json:"asset_id"`
	Mapped   bool           `json:"mapped"`
	Status   models.QRStatus `json:"status"`
	Message  string         `json:"message"`
	DeviceID uint           `json:"device_id,omitempty"`
	Device   *models.Device `json:"device,omitempty"`
}

// ScanQR is the public endpoint the QR sticker points at. It never requires
// auth: an unmapped code returns mapped=false so the frontend can show the
// "not assigned — log in as admin to map it" screen.
func ScanQR(c *gin.Context) {
	asset := strings.ToUpper(strings.TrimSpace(c.Param("assetId")))

	var code models.QRCode
	err := database.DB.Where("asset_id = ?", asset).First(&code).Error
	if err != nil {
		utils.NotFound(c, fmt.Sprintf("QR code %s does not exist in this system.", asset))
		return
	}

	// Record the scan regardless of mapping state — this feeds "Today's Scans".
	scan := models.Scan{
		QRCodeID:  code.ID,
		AssetID:   code.AssetID,
		WasMapped: code.Status == models.QRMapped,
		IPAddress: utils.ClientIP(c),
		UserAgent: c.Request.UserAgent(),
	}
	if uid := utils.CurrentUserID(c); uid != 0 {
		scan.UserID = &uid
	}
	database.DB.Create(&scan)
	database.DB.Model(&code).UpdateColumn("scan_count", gorm.Expr("scan_count + 1"))

	if code.Status == models.QRLost || code.Status == models.QRInactive || code.Status == models.QRReplaced {
		utils.OK(c, scanResponse{
			AssetID: code.AssetID,
			Mapped:  false,
			Status:  code.Status,
			Message: fmt.Sprintf("This QR code is marked as %s and is not in active use.", code.Status),
		})
		return
	}

	var device models.Device
	err = database.DB.Where("qr_code_id = ?", code.ID).
		Preload("Media").
		Preload("QRCode").
		Preload("ServiceHistory").
		First(&device).Error

	if err != nil {
		// Unmapped: this is the first-scan path.
		utils.OK(c, scanResponse{
			AssetID: code.AssetID,
			Mapped:  false,
			Status:  code.Status,
			Message: "This QR is not assigned to any device. Please login as Admin.",
		})
		return
	}

	utils.OK(c, scanResponse{
		AssetID:  code.AssetID,
		Mapped:   true,
		Status:   code.Status,
		DeviceID: device.ID,
		Device:   &device,
	})
}

// ─── QR images & PDFs ─────────────────────────────────────────────────────

// GetQRImage streams a PNG for a single asset.
func GetQRImage(c *gin.Context) {
	asset := strings.ToUpper(strings.TrimSpace(c.Param("assetId")))

	var code models.QRCode
	if err := database.DB.Where("asset_id = ?", asset).First(&code).Error; err != nil {
		utils.NotFound(c, "QR code not found")
		return
	}

	png, err := services.GenerateQRPNG(code.URL, utils.QueryInt(c, "size", 400))
	if err != nil {
		utils.ServerError(c, "Could not render QR image")
		return
	}

	c.Header("Cache-Control", "public, max-age=86400")
	c.Data(http.StatusOK, "image/png", png)
}

type printRequest struct {
	BatchID  string   `json:"batch_id"`
	AssetIDs []string `json:"asset_ids"`
	Status   string   `json:"status"`
	Limit    int      `json:"limit"`
}

// PrintQRLabels builds a print-ready A4 label sheet PDF for a batch, an
// explicit list of assets, or a status filter.
func PrintQRLabels(c *gin.Context) {
	var req printRequest
	_ = c.ShouldBindJSON(&req)

	q := database.DB.Model(&models.QRCode{})
	title := "QR Labels"

	switch {
	case len(req.AssetIDs) > 0:
		q = q.Where("asset_id IN ?", req.AssetIDs)
		title = fmt.Sprintf("QR Labels — %d selected", len(req.AssetIDs))
	case req.BatchID != "":
		q = q.Where("batch_id = ?", req.BatchID)
		title = "QR Labels — " + req.BatchID
	case req.Status != "" && req.Status != "all":
		q = q.Where("status = ?", req.Status)
		title = "QR Labels — " + req.Status
	default:
		utils.BadRequest(c, "Select a batch, a status, or specific QR codes to print")
		return
	}

	limit := req.Limit
	if limit <= 0 || limit > 2000 {
		limit = 2000
	}

	var codes []models.QRCode
	if err := q.Order("asset_id asc").Limit(limit).Find(&codes).Error; err != nil {
		utils.ServerError(c, "Could not load QR codes")
		return
	}
	if len(codes) == 0 {
		utils.NotFound(c, "No QR codes matched your selection")
		return
	}

	pdf, err := services.BuildLabelPDF(codes, title)
	if err != nil {
		utils.ServerError(c, "Could not build the label sheet: "+err.Error())
		return
	}

	filename := fmt.Sprintf("qr-labels-%s.pdf", time.Now().Format("20060102-150405"))
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/pdf", pdf)
}

// DownloadSingleQRPDF renders one QR large on its own page.
func DownloadSingleQRPDF(c *gin.Context) {
	asset := strings.ToUpper(strings.TrimSpace(c.Param("assetId")))

	var code models.QRCode
	if err := database.DB.Where("asset_id = ?", asset).First(&code).Error; err != nil {
		utils.NotFound(c, "QR code not found")
		return
	}

	pdf, err := services.BuildSingleQRPDF(code)
	if err != nil {
		utils.ServerError(c, "Could not build the PDF")
		return
	}

	c.Header("Content-Disposition", `attachment; filename="`+code.AssetID+`.pdf"`)
	c.Data(http.StatusOK, "application/pdf", pdf)
}

// ─── Status management ────────────────────────────────────────────────────

type qrStatusRequest struct {
	Status models.QRStatus `json:"status" binding:"required"`
	Notes  string          `json:"notes"`
}

// UpdateQRStatus changes a QR lifecycle status (available/inactive/lost/replaced).
func UpdateQRStatus(c *gin.Context) {
	var req qrStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "A status is required")
		return
	}

	valid := map[models.QRStatus]bool{
		models.QRAvailable: true, models.QRInactive: true,
		models.QRLost: true, models.QRReplaced: true, models.QRMapped: true,
	}
	if !valid[req.Status] {
		utils.BadRequest(c, "Status must be one of: available, mapped, inactive, lost, replaced")
		return
	}

	var code models.QRCode
	if err := database.DB.Where("asset_id = ?", strings.ToUpper(c.Param("assetId"))).First(&code).Error; err != nil {
		utils.NotFound(c, "QR code not found")
		return
	}

	// Guard the invariant: "mapped" is owned by the mapping flow, and a mapped
	// code cannot be silently freed while a device still points at it.
	var deviceCount int64
	database.DB.Model(&models.Device{}).Where("qr_code_id = ?", code.ID).Count(&deviceCount)

	if req.Status == models.QRMapped && deviceCount == 0 {
		utils.BadRequest(c, "This QR has no device mapped to it. Map a device instead of setting this status.")
		return
	}
	if req.Status == models.QRAvailable && deviceCount > 0 {
		utils.Conflict(c, "This QR is mapped to a device. Unmap the device before marking it available.")
		return
	}

	old := code.Status
	updates := map[string]interface{}{"status": req.Status}
	if req.Notes != "" {
		updates["notes"] = req.Notes
	}

	if err := database.DB.Model(&code).Updates(updates).Error; err != nil {
		utils.ServerError(c, "Could not update the QR status")
		return
	}

	utils.Audit(c, models.ActionQRStatus, "qr_code", code.AssetID, gin.H{"from": old, "to": req.Status})
	utils.OKMessage(c, fmt.Sprintf("%s is now marked %s", code.AssetID, req.Status), code)
}

// DeleteQRCode removes an unmapped QR code.
func DeleteQRCode(c *gin.Context) {
	var code models.QRCode
	if err := database.DB.Where("asset_id = ?", strings.ToUpper(c.Param("assetId"))).First(&code).Error; err != nil {
		utils.NotFound(c, "QR code not found")
		return
	}

	var deviceCount int64
	database.DB.Model(&models.Device{}).Where("qr_code_id = ?", code.ID).Count(&deviceCount)
	if deviceCount > 0 {
		utils.Conflict(c, "This QR is mapped to a device. Delete or unmap the device first.")
		return
	}

	if err := database.DB.Delete(&code).Error; err != nil {
		utils.ServerError(c, "Could not delete the QR code")
		return
	}

	utils.Audit(c, models.ActionQRStatus, "qr_code", code.AssetID, "deleted")
	utils.OKMessage(c, code.AssetID+" deleted", nil)
}
