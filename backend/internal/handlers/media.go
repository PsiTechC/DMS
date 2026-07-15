package handlers

import (
	"fmt"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/services"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
)

// UploadDeviceMedia accepts one or more files for a device.
// POST /api/devices/:id/media?type=image|video|manual  (multipart field: "files")
func UploadDeviceMedia(c *gin.Context) {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Device not found")
		return
	}

	kind := models.MediaType(c.DefaultQuery("type", "image"))
	switch kind {
	case models.MediaImage, models.MediaVideo, models.MediaManual:
	default:
		utils.BadRequest(c, "type must be one of: image, video, manual")
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		utils.BadRequest(c, "Could not read the upload. Make sure you attached a file.")
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		utils.BadRequest(c, "No files were attached")
		return
	}

	// Only the first image ever uploaded becomes the default primary.
	var existingImages int64
	if kind == models.MediaImage {
		database.DB.Model(&models.Media{}).
			Where("device_id = ? AND type = ?", device.ID, models.MediaImage).
			Count(&existingImages)
	}

	var saved []models.Media
	var failures []string

	for i, fh := range files {
		file, err := services.SaveUpload(c, fh, kind)
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: %s", fh.Filename, err.Error()))
			continue
		}

		m := models.Media{
			DeviceID:   device.ID,
			Type:       kind,
			FileName:   file.FileName,
			FilePath:   file.FilePath,
			URL:        file.URL,
			MimeType:   file.MimeType,
			SizeBytes:  file.SizeBytes,
			IsPrimary:  kind == models.MediaImage && existingImages == 0 && i == 0,
			UploadedBy: utils.CurrentUserID(c),
		}
		if err := database.DB.Create(&m).Error; err != nil {
			_ = services.DeleteFile(file.FilePath) // don't orphan the file
			failures = append(failures, fmt.Sprintf("%s: could not be saved", fh.Filename))
			continue
		}
		saved = append(saved, m)
	}

	if len(saved) == 0 {
		utils.BadRequest(c, "No files were uploaded. "+joinLines(failures))
		return
	}

	utils.Audit(c, models.ActionMediaUploaded, "device", device.DeviceNumber, gin.H{
		"type": kind, "count": len(saved),
	})

	msg := fmt.Sprintf("%d file(s) uploaded", len(saved))
	if len(failures) > 0 {
		msg += fmt.Sprintf(" — %d skipped: %s", len(failures), joinLines(failures))
	}
	utils.OKMessage(c, msg, saved)
}

// DeleteMedia removes one media item and its file.
func DeleteMedia(c *gin.Context) {
	var m models.Media
	if err := database.DB.First(&m, c.Param("mediaId")).Error; err != nil {
		utils.NotFound(c, "File not found")
		return
	}

	if err := database.DB.Delete(&m).Error; err != nil {
		utils.ServerError(c, "Could not delete the file")
		return
	}
	_ = services.DeleteFile(m.FilePath)

	// If we just deleted the primary image, promote the next one so the device
	// card never loses its thumbnail.
	if m.IsPrimary && m.Type == models.MediaImage {
		var next models.Media
		if err := database.DB.Where("device_id = ? AND type = ?", m.DeviceID, models.MediaImage).
			Order("created_at asc").First(&next).Error; err == nil {
			database.DB.Model(&next).Update("is_primary", true)
		}
	}

	utils.Audit(c, models.ActionMediaDeleted, "media", m.FileName, gin.H{"device_id": m.DeviceID})
	utils.OKMessage(c, "File deleted", nil)
}

// SetPrimaryImage marks one image as the device's cover photo.
func SetPrimaryImage(c *gin.Context) {
	var m models.Media
	if err := database.DB.First(&m, c.Param("mediaId")).Error; err != nil {
		utils.NotFound(c, "Image not found")
		return
	}
	if m.Type != models.MediaImage {
		utils.BadRequest(c, "Only images can be set as the primary photo")
		return
	}

	// Clear the old primary first so exactly one stays flagged.
	database.DB.Model(&models.Media{}).
		Where("device_id = ? AND type = ?", m.DeviceID, models.MediaImage).
		Update("is_primary", false)

	if err := database.DB.Model(&m).Update("is_primary", true).Error; err != nil {
		utils.ServerError(c, "Could not set the primary image")
		return
	}

	utils.OKMessage(c, "Primary image updated", m)
}

func joinLines(list []string) string {
	out := ""
	for i, s := range list {
		if i > 0 {
			out += "; "
		}
		out += s
	}
	return out
}
