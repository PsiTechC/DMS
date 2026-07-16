package handlers

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/services"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// deviceForm is the QR mapping / device edit payload. Everything the admin
// fills in on the mapping screen lands here.
type deviceForm struct {
	DeviceNumber string `json:"device_number" binding:"required"`
	DeviceName   string `json:"device_name" binding:"required"`
	Category     string `json:"category"`
	Brand        string `json:"brand"`
	Model        string `json:"model"`
	SerialNumber string `json:"serial_number"`

	PurchaseDate   string `json:"purchase_date"`   // YYYY-MM-DD
	WarrantyExpiry string `json:"warranty_expiry"` // YYYY-MM-DD

	Department       string `json:"department"`
	Company          string `json:"company"`
	Project          string `json:"project"`
	AssignedEmployee string `json:"assigned_employee"`
	Location         string `json:"location"`
	Vendor           string `json:"vendor"`

	Status         models.DeviceStatus `json:"status"`
	Condition      string              `json:"condition"`
	Description    string              `json:"description"`
	Specifications string              `json:"specifications"`
}

// validate enforces the required fields with clear messages. The struct's
// binding tags catch the two names; these are the fields required by policy
// rather than by shape, so they are checked here after trimming.
func (f *deviceForm) validate() error {
	if strings.TrimSpace(f.AssignedEmployee) == "" {
		return errors.New("Assigned Employee / User Name is required")
	}
	if strings.TrimSpace(f.Location) == "" {
		return errors.New("Location is required")
	}
	return nil
}

func (f *deviceForm) apply(d *models.Device) {
	d.DeviceNumber = strings.TrimSpace(f.DeviceNumber)
	d.DeviceName = strings.TrimSpace(f.DeviceName)
	d.Category = strings.TrimSpace(f.Category)
	d.Brand = strings.TrimSpace(f.Brand)
	d.Model = strings.TrimSpace(f.Model)
	d.SerialNumber = strings.TrimSpace(f.SerialNumber)
	d.PurchaseDate = utils.ParseDate(f.PurchaseDate)
	d.WarrantyExpiry = utils.ParseDate(f.WarrantyExpiry)
	d.Department = strings.TrimSpace(f.Department)
	d.Company = strings.TrimSpace(f.Company)
	d.Project = strings.TrimSpace(f.Project)
	d.AssignedEmployee = strings.TrimSpace(f.AssignedEmployee)
	d.Location = strings.TrimSpace(f.Location)
	d.Vendor = strings.TrimSpace(f.Vendor)
	d.Condition = strings.TrimSpace(f.Condition)
	d.Description = strings.TrimSpace(f.Description)
	d.Specifications = strings.TrimSpace(f.Specifications)

	if f.Status != "" {
		d.Status = f.Status
	} else if d.Status == "" {
		d.Status = models.DeviceActive
	}
	if d.Condition == "" {
		d.Condition = "good"
	}
}

// ─── QR mapping ───────────────────────────────────────────────────────────

// MapQRToDevice attaches a device to a previously-unmapped QR code. This is
// the "first scan -> admin logs in -> fills the form" destination.
// Admin only, and only once per QR unless the admin explicitly remaps.
func MapQRToDevice(c *gin.Context) {
	asset := strings.ToUpper(strings.TrimSpace(c.Param("assetId")))

	var form deviceForm
	if err := c.ShouldBindJSON(&form); err != nil {
		utils.BadRequest(c, "Device Number and Device Name are required")
		return
	}
	if err := form.validate(); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var code models.QRCode
	if err := database.DB.Where("asset_id = ?", asset).First(&code).Error; err != nil {
		utils.NotFound(c, "QR code "+asset+" does not exist")
		return
	}

	if code.Status == models.QRLost || code.Status == models.QRInactive || code.Status == models.QRReplaced {
		utils.BadRequest(c, fmt.Sprintf("This QR is marked %s and cannot be mapped. Set it back to available first.", code.Status))
		return
	}

	// One device per QR — enforce before we try to insert.
	var existing models.Device
	err := database.DB.Where("qr_code_id = ?", code.ID).First(&existing).Error
	if err == nil {
		utils.Conflict(c, fmt.Sprintf(
			"%s is already mapped to %s (%s). Use Remap to change it.",
			asset, existing.DeviceName, existing.DeviceNumber))
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		utils.ServerError(c, "Could not check the QR mapping")
		return
	}

	device := models.Device{QRCodeID: code.ID, CreatedBy: utils.CurrentUserID(c)}
	form.apply(&device)

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&device).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&models.QRCode{}).Where("id = ?", code.ID).
			Updates(map[string]interface{}{"status": models.QRMapped, "mapped_at": now}).Error
	}); err != nil {
		if isUniqueViolation(err) {
			utils.Conflict(c, "A device with this Device Number already exists")
			return
		}
		utils.ServerError(c, "Could not map the device: "+err.Error())
		return
	}

	utils.Audit(c, models.ActionQRMapped, "qr_code", asset, gin.H{
		"device_number": device.DeviceNumber,
		"device_name":   device.DeviceName,
	})
	utils.Audit(c, models.ActionDeviceCreated, "device", device.DeviceNumber, gin.H{"qr": asset})

	database.DB.Preload("QRCode").First(&device, device.ID)
	utils.Created(c, device)
}

// UnmapQR detaches the device from a QR and frees the code for reuse.
func UnmapQR(c *gin.Context) {
	asset := strings.ToUpper(strings.TrimSpace(c.Param("assetId")))

	var code models.QRCode
	if err := database.DB.Where("asset_id = ?", asset).First(&code).Error; err != nil {
		utils.NotFound(c, "QR code not found")
		return
	}

	var device models.Device
	if err := database.DB.Where("qr_code_id = ?", code.ID).First(&device).Error; err != nil {
		utils.BadRequest(c, "This QR is not mapped to any device")
		return
	}

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&device).Error; err != nil {
			return err
		}
		return tx.Model(&models.QRCode{}).Where("id = ?", code.ID).
			Updates(map[string]interface{}{"status": models.QRAvailable, "mapped_at": nil}).Error
	}); err != nil {
		utils.ServerError(c, "Could not unmap the QR code")
		return
	}

	utils.Audit(c, models.ActionQRUnmapped, "qr_code", asset, gin.H{"device_number": device.DeviceNumber})
	utils.OKMessage(c, asset+" is now available for mapping", nil)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

var deviceSortable = map[string]bool{
	"device_number": true, "device_name": true, "category": true, "brand": true,
	"status": true, "warranty_expiry": true, "created_at": true, "location": true,
	"department": true, "company": true,
}

// deviceListQuery applies every supported search/filter param.
func deviceListQuery(c *gin.Context) *gorm.DB {
	q := database.DB.Model(&models.Device{}).
		Joins("LEFT JOIN qr_codes ON qr_codes.id = devices.qr_code_id")

	if s := strings.TrimSpace(c.Query("search")); s != "" {
		like := "%" + strings.ToLower(s) + "%"
		q = q.Where(`
			LOWER(devices.device_number) LIKE ? OR
			LOWER(devices.device_name) LIKE ? OR
			LOWER(devices.serial_number) LIKE ? OR
			LOWER(devices.assigned_employee) LIKE ? OR
			LOWER(devices.brand) LIKE ? OR
			LOWER(devices.model) LIKE ? OR
			LOWER(devices.location) LIKE ? OR
			LOWER(qr_codes.asset_id) LIKE ?`,
			like, like, like, like, like, like, like, like)
	}

	// Exact-match filters, all optional.
	for param, column := range map[string]string{
		"category":   "devices.category",
		"brand":      "devices.brand",
		"status":     "devices.status",
		"department": "devices.department",
		"company":    "devices.company",
		"project":    "devices.project",
		"location":   "devices.location",
		"condition":  "devices.condition",
	} {
		if v := c.Query(param); v != "" && v != "all" {
			q = q.Where(column+" = ?", v)
		}
	}

	if v := c.Query("employee"); v != "" {
		q = q.Where("LOWER(devices.assigned_employee) LIKE ?", "%"+strings.ToLower(v)+"%")
	}

	// Warranty expiring within N days.
	if days := utils.QueryInt(c, "warranty_days", 0); days > 0 {
		cutoff := time.Now().AddDate(0, 0, days)
		q = q.Where("devices.warranty_expiry IS NOT NULL AND devices.warranty_expiry BETWEEN ? AND ?", time.Now(), cutoff)
	}
	if c.Query("warranty_expired") == "true" {
		q = q.Where("devices.warranty_expiry IS NOT NULL AND devices.warranty_expiry < ?", time.Now())
	}

	return q
}

// ListDevices returns a filtered, sorted, paginated device page.
func ListDevices(c *gin.Context) {
	page, limit, offset := utils.Pagination(c)

	var total int64
	if err := deviceListQuery(c).Count(&total).Error; err != nil {
		utils.ServerError(c, "Could not load devices")
		return
	}

	sort := utils.SafeSort(c, deviceSortable, "created_at desc")

	var devices []models.Device
	err := deviceListQuery(c).
		Preload("QRCode").
		Preload("Media", "type = ? AND is_primary = ?", models.MediaImage, true).
		Order("devices." + sort).
		Limit(limit).Offset(offset).
		Find(&devices).Error
	if err != nil {
		utils.ServerError(c, "Could not load devices")
		return
	}

	utils.Paginated(c, devices, utils.Meta{
		Page: page, Limit: limit, Total: total,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	})
}

// GetDevice returns one device with all its media and history.
func GetDevice(c *gin.Context) {
	var device models.Device
	err := database.DB.
		Preload("QRCode").
		Preload("Media").
		Preload("ServiceHistory", func(db *gorm.DB) *gorm.DB {
			return db.Order("service_date DESC")
		}).
		Preload("FAQs", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, created_at ASC")
		}).
		First(&device, c.Param("id")).Error
	if err != nil {
		utils.NotFound(c, "Device not found")
		return
	}
	utils.OK(c, device)
}

// UpdateDevice edits an existing device. Admin only.
func UpdateDevice(c *gin.Context) {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Device not found")
		return
	}

	var form deviceForm
	if err := c.ShouldBindJSON(&form); err != nil {
		utils.BadRequest(c, "Device Number and Device Name are required")
		return
	}
	if err := form.validate(); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	before := gin.H{
		"status": device.Status, "location": device.Location,
		"assigned_employee": device.AssignedEmployee, "condition": device.Condition,
	}

	form.apply(&device)

	if err := database.DB.Save(&device).Error; err != nil {
		if isUniqueViolation(err) {
			utils.Conflict(c, "Another device already uses this Device Number")
			return
		}
		utils.ServerError(c, "Could not update the device")
		return
	}

	utils.Audit(c, models.ActionDeviceUpdated, "device", device.DeviceNumber, gin.H{
		"before": before,
		"after": gin.H{
			"status": device.Status, "location": device.Location,
			"assigned_employee": device.AssignedEmployee, "condition": device.Condition,
		},
	})

	database.DB.Preload("QRCode").Preload("Media").First(&device, device.ID)
	utils.OKMessage(c, "Device updated", device)
}

// DeleteDevice removes a device, its media files, and frees its QR code.
func DeleteDevice(c *gin.Context) {
	var device models.Device
	if err := database.DB.Preload("Media").First(&device, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Device not found")
		return
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("device_id = ?", device.ID).Delete(&models.Media{}).Error; err != nil {
			return err
		}
		if err := tx.Where("device_id = ?", device.ID).Delete(&models.ServiceRecord{}).Error; err != nil {
			return err
		}
		if err := tx.Where("device_id = ?", device.ID).Delete(&models.FAQ{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&device).Error; err != nil {
			return err
		}
		return tx.Model(&models.QRCode{}).Where("id = ?", device.QRCodeID).
			Updates(map[string]interface{}{"status": models.QRAvailable, "mapped_at": nil}).Error
	})
	if err != nil {
		utils.ServerError(c, "Could not delete the device")
		return
	}

	// Files are removed only after the transaction commits, so a rolled-back
	// delete never leaves the DB pointing at missing files.
	for _, m := range device.Media {
		_ = services.DeleteFile(m.FilePath)
	}

	utils.Audit(c, models.ActionDeviceDeleted, "device", device.DeviceNumber, gin.H{"media_removed": len(device.Media)})
	utils.OKMessage(c, "Device deleted and its QR code is available again", nil)
}

// ─── Filter option lists (populate the dropdowns) ─────────────────────────

// DeviceFilterOptions returns the distinct values in use for each filterable
// column so the UI can build dropdowns without hardcoding.
func DeviceFilterOptions(c *gin.Context) {
	columns := []string{"category", "brand", "department", "company", "project", "location", "vendor"}
	out := gin.H{}

	for _, col := range columns {
		var values []string
		database.DB.Model(&models.Device{}).
			Distinct().
			Where(col+" <> ''").
			Order(col + " asc").
			Pluck(col, &values)
		out[col] = values
	}

	out["status"] = []models.DeviceStatus{
		models.DeviceActive, models.DeviceMaintenance,
		models.DeviceFaulty, models.DeviceStored, models.DeviceRetired,
	}
	out["condition"] = []string{"excellent", "good", "fair", "poor", "damaged"}

	utils.OK(c, out)
}

// ─── Service history ──────────────────────────────────────────────────────

type serviceForm struct {
	ServiceDate string  `json:"service_date"`
	Title       string  `json:"title" binding:"required"`
	Description string  `json:"description"`
	PerformedBy string  `json:"performed_by"`
	Cost        float64 `json:"cost"`
}

// AddServiceRecord appends a maintenance entry to a device.
func AddServiceRecord(c *gin.Context) {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Device not found")
		return
	}

	var form serviceForm
	if err := c.ShouldBindJSON(&form); err != nil {
		utils.BadRequest(c, "A title is required for a service record")
		return
	}

	date := time.Now()
	if d := utils.ParseDate(form.ServiceDate); d != nil {
		date = *d
	}

	rec := models.ServiceRecord{
		DeviceID:    device.ID,
		ServiceDate: date,
		Title:       form.Title,
		Description: form.Description,
		PerformedBy: form.PerformedBy,
		Cost:        form.Cost,
		CreatedBy:   utils.CurrentUserID(c),
	}
	if err := database.DB.Create(&rec).Error; err != nil {
		utils.ServerError(c, "Could not save the service record")
		return
	}

	utils.Audit(c, models.ActionDeviceUpdated, "device", device.DeviceNumber, gin.H{"service_added": form.Title})
	utils.Created(c, rec)
}

// DeleteServiceRecord removes a maintenance entry.
func DeleteServiceRecord(c *gin.Context) {
	if err := database.DB.Delete(&models.ServiceRecord{}, c.Param("recordId")).Error; err != nil {
		utils.ServerError(c, "Could not delete the service record")
		return
	}
	utils.OKMessage(c, "Service record deleted", nil)
}

// isUniqueViolation detects a Postgres 23505 regardless of driver wrapping.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "23505") ||
		strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique constraint")
}
