package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/services"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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
	Headline       string              `json:"headline"`
	Description    string              `json:"description"`
	Specifications string              `json:"specifications"`
	Features       string              `json:"features"`
	UsageSteps     string              `json:"usage_steps"`
}

// validate enforces the required fields with clear messages. The struct's
// binding tags catch the two names; these are the fields required by policy
// rather than by shape, so they are checked here after trimming.
func (f *deviceForm) validate() error {
	f.DeviceNumber = strings.TrimSpace(f.DeviceNumber)
	f.DeviceName = strings.TrimSpace(f.DeviceName)
	f.AssignedEmployee = strings.TrimSpace(f.AssignedEmployee)
	f.Location = strings.TrimSpace(f.Location)

	if f.DeviceNumber == "" {
		return errors.New("Device Number is required")
	}
	if f.DeviceName == "" {
		return errors.New("Device Name is required")
	}
	if strings.TrimSpace(f.AssignedEmployee) == "" {
		return errors.New("Assigned Employee / User Name is required")
	}
	if strings.TrimSpace(f.Location) == "" {
		return errors.New("Location is required")
	}

	for _, field := range []struct {
		name  string
		value string
		max   int
	}{
		{"Device Number", f.DeviceNumber, 80}, {"Device Name", f.DeviceName, 160},
		{"Category", f.Category, 80}, {"Brand", f.Brand, 80}, {"Model", f.Model, 120},
		{"Serial Number", f.SerialNumber, 120}, {"Department", f.Department, 120},
		{"Company", f.Company, 120}, {"Project", f.Project, 120},
		{"Assigned Employee", f.AssignedEmployee, 160}, {"Location", f.Location, 200},
		{"Vendor", f.Vendor, 160}, {"Condition", f.Condition, 40}, {"Headline", f.Headline, 250},
	} {
		if utf8.RuneCountInString(strings.TrimSpace(field.value)) > field.max {
			return fmt.Errorf("%s cannot exceed %d characters", field.name, field.max)
		}
	}

	purchase, err := parseDeviceDate("Purchase Date", f.PurchaseDate)
	if err != nil {
		return err
	}
	warranty, err := parseDeviceDate("Warranty Expiry", f.WarrantyExpiry)
	if err != nil {
		return err
	}
	if purchase != nil && warranty != nil && warranty.Before(*purchase) {
		return errors.New("Warranty Expiry cannot be before Purchase Date")
	}

	validStatus := map[models.DeviceStatus]bool{
		"": true, models.DeviceActive: true, models.DeviceMaintenance: true,
		models.DeviceFaulty: true, models.DeviceStored: true, models.DeviceRetired: true,
	}
	if !validStatus[f.Status] {
		return errors.New("Status must be active, maintenance, faulty, in_storage, or retired")
	}
	validCondition := map[string]bool{
		"": true, "excellent": true, "good": true, "fair": true, "poor": true, "damaged": true,
	}
	if !validCondition[strings.ToLower(strings.TrimSpace(f.Condition))] {
		return errors.New("Condition must be excellent, good, fair, poor, or damaged")
	}

	for _, field := range []struct{ name, value string }{
		{"Specifications", f.Specifications}, {"Features", f.Features}, {"Usage Steps", f.UsageSteps},
	} {
		if strings.TrimSpace(field.value) == "" {
			if field.name == "Usage Steps" {
				continue
			}
			return fmt.Errorf("%s is required", field.name)
		}
		var items []map[string]interface{}
		if err := json.Unmarshal([]byte(field.value), &items); err != nil {
			return fmt.Errorf("%s must contain at least one item", field.name)
		}
		if len(items) == 0 {
			if field.name == "Usage Steps" {
				continue
			}
			return fmt.Errorf("%s must contain at least one item", field.name)
		}
		keys := []string{"title", "detail"}
		if field.name == "Specifications" {
			keys = []string{"key"}
		}
		for _, item := range items {
			if field.name == "Features" {
				title, _ := item["title"].(string)
				detail, _ := item["detail"].(string)
				if strings.TrimSpace(title) == "" && strings.TrimSpace(detail) == "" {
					return errors.New("every Features item must include a title or description")
				}
				continue
			}
			for _, key := range keys {
				value, ok := item[key].(string)
				if !ok || strings.TrimSpace(value) == "" {
					return fmt.Errorf("every %s item must include %s", field.name, strings.Join(keys, " and "))
				}
			}
		}
	}
	return nil
}

func parseDeviceDate(name, value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	d, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, fmt.Errorf("%s must use YYYY-MM-DD format", name)
	}
	return &d, nil
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
	d.Headline = strings.TrimSpace(f.Headline)
	d.Description = strings.TrimSpace(f.Description)
	d.Specifications = strings.TrimSpace(f.Specifications)
	d.Features = strings.TrimSpace(f.Features)
	d.UsageSteps = strings.TrimSpace(f.UsageSteps)

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

// resolveProductCategory looks up a product line by name. Categories are
// admin-managed rows (see ListProductCategories/CreateProductCategory), not a
// hardcoded list, so new hardware lines can be added without a code change.
func resolveProductCategory(value string) (models.ProductCategory, bool) {
	name := strings.TrimSpace(value)
	if name == "" {
		return models.ProductCategory{}, false
	}
	var cat models.ProductCategory
	if err := database.DB.Where("LOWER(name) = LOWER(?)", name).First(&cat).Error; err != nil {
		return models.ProductCategory{}, false
	}
	return cat, true
}

func productID(category models.ProductCategory, serial int64) string {
	return fmt.Sprintf("%s%04d", category.ProductPrefix, serial)
}

func productDeviceID(category models.ProductCategory, serial int64) string {
	return fmt.Sprintf("%s%04d", category.DevicePrefix, serial)
}

// ─── Product categories ────────────────────────────────────────────────────

type productCategoryForm struct {
	Name          string `json:"name" binding:"required"`
	ProductPrefix string `json:"product_prefix" binding:"required"`
	DevicePrefix  string `json:"device_prefix" binding:"required"`
	ProductStart  int64  `json:"product_start"`
	DeviceStart   int64  `json:"device_start"`
}

func (form *productCategoryForm) normalizeAndValidate() error {
	form.Name = strings.TrimSpace(form.Name)
	form.ProductPrefix = strings.ToUpper(strings.TrimSpace(form.ProductPrefix))
	form.DevicePrefix = strings.TrimSpace(form.DevicePrefix)

	if form.Name == "" || form.ProductPrefix == "" || form.DevicePrefix == "" {
		return errors.New("Name, product prefix, and device prefix are required")
	}
	if utf8.RuneCountInString(form.Name) > 80 || utf8.RuneCountInString(form.ProductPrefix) > 20 || utf8.RuneCountInString(form.DevicePrefix) > 20 {
		return errors.New("Name is limited to 80 characters, prefixes to 20")
	}
	if form.ProductStart < 0 || form.DeviceStart < 0 {
		return errors.New("Start serials cannot be negative")
	}
	if form.ProductStart == 0 {
		form.ProductStart = 1
	}
	if form.DeviceStart == 0 {
		form.DeviceStart = 1
	}
	return nil
}

// ListProductCategories returns every product line the Products page and the
// device-first mapping form can create devices for.
func ListProductCategories(c *gin.Context) {
	var cats []models.ProductCategory
	if err := database.DB.Order("name asc").Find(&cats).Error; err != nil {
		utils.ServerError(c, "Could not load product categories")
		return
	}
	utils.OK(c, cats)
}

// CreateProductCategory adds a new hardware product line. Admin only — the
// prefix chosen here seeds a brand-new counter, so changing it later would
// fork the numbering away from anything already generated under it.
func CreateProductCategory(c *gin.Context) {
	var form productCategoryForm
	if err := c.ShouldBindJSON(&form); err != nil {
		utils.BadRequest(c, "Name, product prefix, and device prefix are required")
		return
	}
	if err := form.normalizeAndValidate(); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	cat := models.ProductCategory{
		Name: form.Name, ProductPrefix: form.ProductPrefix, DevicePrefix: form.DevicePrefix,
		ProductStart: form.ProductStart, DeviceStart: form.DeviceStart,
		CreatedBy: utils.CurrentUserID(c),
	}
	if err := database.DB.Create(&cat).Error; err != nil {
		if isUniqueViolation(err) {
			utils.Conflict(c, "A product category with this name or prefix already exists")
			return
		}
		utils.ServerError(c, "Could not create product category")
		return
	}

	utils.Audit(c, models.ActionCategoryAdded, "product_category", cat.Name, gin.H{
		"product_prefix": cat.ProductPrefix, "device_prefix": cat.DevicePrefix,
	})
	utils.Created(c, cat)
}

// UpdateProductCategory edits an existing hardware product line. Renaming a
// category also renames the category value on its devices so filters and
// counts remain consistent. Numbering fields become immutable after the first
// device is generated because changing them would split an existing sequence.
func UpdateProductCategory(c *gin.Context) {
	var form productCategoryForm
	if err := c.ShouldBindJSON(&form); err != nil {
		utils.BadRequest(c, "Name, product prefix, and device prefix are required")
		return
	}
	if err := form.normalizeAndValidate(); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		utils.ServerError(c, "Could not update product category")
		return
	}
	defer tx.Rollback()

	var cat models.ProductCategory
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&cat, c.Param("id")).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			utils.NotFound(c, "Product category not found")
			return
		}
		utils.ServerError(c, "Could not load product category")
		return
	}

	var deviceCount int64
	if err := tx.Model(&models.Device{}).Where("category = ?", cat.Name).Count(&deviceCount).Error; err != nil {
		utils.ServerError(c, "Could not check product category usage")
		return
	}
	numberingChanged := form.ProductPrefix != cat.ProductPrefix || form.DevicePrefix != cat.DevicePrefix ||
		form.ProductStart != cat.ProductStart || form.DeviceStart != cat.DeviceStart
	if deviceCount > 0 && numberingChanged {
		utils.BadRequest(c, "ID prefixes and start serials cannot be changed after devices have been generated")
		return
	}

	oldName := cat.Name
	updates := map[string]interface{}{
		"name": form.Name, "product_prefix": form.ProductPrefix, "device_prefix": form.DevicePrefix,
		"product_start": form.ProductStart, "device_start": form.DeviceStart,
	}
	if err := tx.Model(&cat).Updates(updates).Error; err != nil {
		if isUniqueViolation(err) {
			utils.Conflict(c, "A product category with this name or prefix already exists")
			return
		}
		utils.ServerError(c, "Could not update product category")
		return
	}
	if oldName != form.Name {
		if err := tx.Model(&models.Device{}).Where("category = ?", oldName).Update("category", form.Name).Error; err != nil {
			utils.ServerError(c, "Could not rename category devices")
			return
		}
	}
	if err := tx.Commit().Error; err != nil {
		utils.ServerError(c, "Could not update product category")
		return
	}

	database.DB.First(&cat, cat.ID)
	utils.Audit(c, models.ActionCategoryUpdated, "product_category", cat.Name, gin.H{
		"old_name": oldName, "product_prefix": cat.ProductPrefix, "device_prefix": cat.DevicePrefix,
	})
	utils.OK(c, cat)
}

// DeleteProductCategory removes a hardware product line. Refused once any
// device already carries this category — deleting it would strand those
// devices with a category that no longer resolves to prefixes/counters.
func DeleteProductCategory(c *gin.Context) {
	var cat models.ProductCategory
	if err := database.DB.First(&cat, c.Param("id")).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			utils.NotFound(c, "Product category not found")
			return
		}
		utils.ServerError(c, "Could not load product category")
		return
	}

	var deviceCount int64
	if err := database.DB.Model(&models.Device{}).Where("category = ?", cat.Name).Count(&deviceCount).Error; err != nil {
		utils.ServerError(c, "Could not check product category usage")
		return
	}
	if deviceCount > 0 {
		utils.BadRequest(c, fmt.Sprintf("Cannot delete %s — %d device(s) still use this category", cat.Name, deviceCount))
		return
	}

	if err := database.DB.Delete(&cat).Error; err != nil {
		utils.ServerError(c, "Could not delete product category")
		return
	}

	utils.Audit(c, models.ActionCategoryDeleted, "product_category", cat.Name, gin.H{
		"product_prefix": cat.ProductPrefix, "device_prefix": cat.DevicePrefix,
	})
	utils.OK(c, gin.H{"deleted": true})
}

type serialBlock struct {
	Start int64
	End   int64
}

func reserveSerialBlock(tx *gorm.DB, name string, quantity int, requestedStart int64, defaultStart int64) (serialBlock, error) {
	if defaultStart <= 0 {
		defaultStart = 1
	}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).
		Create(&models.Counter{Name: name, Value: defaultStart - 1}).Error; err != nil {
		return serialBlock{}, fmt.Errorf("init counter %s: %w", name, err)
	}

	var counter models.Counter
	if err := tx.Raw(`SELECT name, value FROM counters WHERE name = ? FOR UPDATE`, name).Scan(&counter).Error; err != nil {
		return serialBlock{}, fmt.Errorf("lock counter %s: %w", name, err)
	}

	start := counter.Value + 1
	if requestedStart > 0 {
		start = requestedStart
		if requestedStart <= counter.Value {
			return serialBlock{}, fmt.Errorf("serial %04d has already been used for this product", requestedStart)
		}
	}
	end := start + int64(quantity) - 1
	if err := tx.Model(&models.Counter{}).Where("name = ?", name).Update("value", end).Error; err != nil {
		return serialBlock{}, fmt.Errorf("update counter %s: %w", name, err)
	}
	return serialBlock{Start: start, End: end}, nil
}

type bulkProductRequest struct {
	Category           string `json:"category" binding:"required"`
	Quantity           int    `json:"quantity" binding:"required,min=1,max=5000"`
	ProductStartSerial int64  `json:"product_start_serial"`
	DeviceStartSerial  int64  `json:"device_start_serial"`
}

// BulkCreateProductDevices is the product-first workflow. Admin chooses a
// product and quantity; the system creates mapped product QR codes and device
// IDs from the product's configured series.
func BulkCreateProductDevices(c *gin.Context) {
	var req bulkProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Choose a product and enter a quantity between 1 and 5000")
		return
	}
	category, ok := resolveProductCategory(req.Category)
	if !ok {
		utils.BadRequest(c, "Choose a valid product category")
		return
	}
	if req.ProductStartSerial < 0 || req.DeviceStartSerial < 0 {
		utils.BadRequest(c, "Start serials cannot be negative")
		return
	}

	batchID := "PRODUCT-" + category.ProductPrefix + "-" + time.Now().Format("20060102-150405")
	createdBy := utils.CurrentUserID(c)
	now := time.Now()
	var codes []models.QRCode
	var devices []models.Device
	var productBlock, deviceBlock serialBlock

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		productBlock, err = reserveSerialBlock(tx, "product_id_"+strings.ToLower(category.ProductPrefix), req.Quantity, req.ProductStartSerial, category.ProductStart)
		if err != nil {
			return err
		}
		deviceBlock, err = reserveSerialBlock(tx, "device_id_"+strings.ToLower(category.ProductPrefix), req.Quantity, req.DeviceStartSerial, category.DeviceStart)
		if err != nil {
			return err
		}

		productIDs := make([]string, 0, req.Quantity)
		deviceNumbers := make([]string, 0, req.Quantity)
		for i := int64(0); i < int64(req.Quantity); i++ {
			productIDs = append(productIDs, productID(category, productBlock.Start+i))
			deviceNumbers = append(deviceNumbers, productDeviceID(category, deviceBlock.Start+i))
		}

		var existingQR int64
		if err := tx.Model(&models.QRCode{}).Where("asset_id IN ?", productIDs).Count(&existingQR).Error; err != nil {
			return err
		}
		if existingQR > 0 {
			return fmt.Errorf("one or more product IDs in this range already exist")
		}
		var existingDevice int64
		if err := tx.Model(&models.Device{}).Where("device_number IN ?", deviceNumbers).Count(&existingDevice).Error; err != nil {
			return err
		}
		if existingDevice > 0 {
			return fmt.Errorf("one or more device IDs in this range already exist")
		}

		codes = make([]models.QRCode, 0, req.Quantity)
		for _, id := range productIDs {
			codes = append(codes, models.QRCode{
				AssetID: id, URL: qrURL(id), Status: models.QRMapped,
				BatchID: batchID, Notes: category.Name, MappedAt: &now, CreatedBy: createdBy,
			})
		}
		if err := tx.CreateInBatches(&codes, 500).Error; err != nil {
			return err
		}

		devices = make([]models.Device, 0, req.Quantity)
		for i := range codes {
			devices = append(devices, models.Device{
				QRCodeID:         codes[i].ID,
				DeviceNumber:     deviceNumbers[i],
				DeviceName:       category.Name,
				Category:         category.Name,
				Status:           models.DeviceActive,
				Condition:        "good",
				AssignedEmployee: "Unassigned",
				Location:         "Inventory",
				Specifications:   `[{"key":"To be updated","value":""}]`,
				Features:         `[{"title":"To be updated","detail":""}]`,
				UsageSteps:       `[]`,
				CreatedBy:        createdBy,
			})
		}
		return tx.CreateInBatches(&devices, 500).Error
	})
	if err != nil {
		if isUniqueViolation(err) || strings.Contains(strings.ToLower(err.Error()), "already") || strings.Contains(strings.ToLower(err.Error()), "used") {
			utils.Conflict(c, "This product/device series already exists. Choose the next available serial or let the system continue automatically.")
			return
		}
		utils.ServerError(c, "Could not generate product devices: "+err.Error())
		return
	}

	utils.Audit(c, models.ActionQRGenerated, "product_batch", batchID, gin.H{
		"category":     category.Name,
		"quantity":     req.Quantity,
		"product_from": productID(category, productBlock.Start),
		"product_to":   productID(category, productBlock.End),
		"device_from":  productDeviceID(category, deviceBlock.Start),
		"device_to":    productDeviceID(category, deviceBlock.End),
	})
	utils.Created(c, gin.H{
		"batch_id":     batchID,
		"category":     category.Name,
		"quantity":     req.Quantity,
		"product_from": productID(category, productBlock.Start),
		"product_to":   productID(category, productBlock.End),
		"device_from":  productDeviceID(category, deviceBlock.Start),
		"device_to":    productDeviceID(category, deviceBlock.End),
		"qr_codes":     codes,
		"devices":      devices,
	})
}

// CreateProductDevice is the device-first hardware workflow. It atomically
// allocates a category-specific QR (FMS0001/PW0001/BBM0001), creates the
// device, and maps the two so no unassigned new QR can be produced.
func CreateProductDevice(c *gin.Context) {
	var form deviceForm
	if err := c.ShouldBindJSON(&form); err != nil {
		utils.BadRequest(c, "Device details and a product category are required")
		return
	}
	category, ok := resolveProductCategory(form.Category)
	if !ok {
		utils.BadRequest(c, "Choose a valid product category")
		return
	}
	form.Category = category.Name
	if err := form.validate(); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var code models.QRCode
	var device models.Device
	now := time.Now()
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		sequence, err := database.NextSequence(tx, "product_qr_"+strings.ToLower(category.ProductPrefix), 1)
		if err != nil {
			return err
		}
		asset := productID(category, sequence)
		code = models.QRCode{
			AssetID: asset, URL: qrURL(asset), Status: models.QRMapped,
			BatchID: "PRODUCT-" + category.ProductPrefix, Notes: category.Name,
			MappedAt: &now, CreatedBy: utils.CurrentUserID(c),
		}
		if err := tx.Create(&code).Error; err != nil {
			return err
		}
		device = models.Device{QRCodeID: code.ID, CreatedBy: utils.CurrentUserID(c)}
		form.apply(&device)
		return tx.Create(&device).Error
	})
	if err != nil {
		utils.ServerError(c, "Could not create the product device: "+err.Error())
		return
	}

	device.QRCode = &code
	utils.Audit(c, models.ActionQRGenerated, "product_device", code.AssetID, gin.H{
		"category": category.Name, "device_number": device.DeviceNumber,
	})
	c.JSON(201, gin.H{
		"success": true,
		"message": category.Name + " device created and mapped to " + code.AssetID,
		"data":    gin.H{"device": device, "qr_code": code},
	})
}

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
	if err := database.DB.Preload("Media").Where("qr_code_id = ?", code.ID).First(&device).Error; err != nil {
		utils.BadRequest(c, "This QR is not mapped to any device")
		return
	}

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
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
		return tx.Model(&models.QRCode{}).Where("id = ?", code.ID).
			Updates(map[string]interface{}{"status": models.QRAvailable, "mapped_at": nil}).Error
	}); err != nil {
		utils.ServerError(c, "Could not unmap the QR code")
		return
	}
	for _, media := range device.Media {
		if err := services.DeleteFile(media.FilePath); err != nil {
			// Database state is already consistent; leave an actionable trace for
			// operators to remove the orphaned physical file.
			log.Printf("unmap: could not remove media file %s: %v", media.FilePath, err)
		}
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
			Order(col+" asc").
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

func (f *serviceForm) validate() error {
	f.Title = strings.TrimSpace(f.Title)
	f.Description = strings.TrimSpace(f.Description)
	f.PerformedBy = strings.TrimSpace(f.PerformedBy)
	if f.Title == "" {
		return errors.New("Title is required")
	}
	if utf8.RuneCountInString(f.Title) > 200 {
		return errors.New("Title cannot exceed 200 characters")
	}
	if utf8.RuneCountInString(f.PerformedBy) > 160 {
		return errors.New("Performed By cannot exceed 160 characters")
	}
	if utf8.RuneCountInString(f.Description) > 20000 {
		return errors.New("Description cannot exceed 20000 characters")
	}
	if f.Cost < 0 || math.IsNaN(f.Cost) || math.IsInf(f.Cost, 0) {
		return errors.New("Cost must be a finite non-negative number")
	}
	if _, err := parseDeviceDate("Service Date", f.ServiceDate); err != nil {
		return err
	}
	return nil
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
	if err := form.validate(); err != nil {
		utils.BadRequest(c, err.Error())
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
	result := database.DB.Where("id = ? AND device_id = ?", c.Param("recordId"), c.Param("id")).Delete(&models.ServiceRecord{})
	if result.Error != nil {
		utils.ServerError(c, "Could not delete the service record")
		return
	}
	if result.RowsAffected == 0 {
		utils.NotFound(c, "Service record not found for this device")
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
