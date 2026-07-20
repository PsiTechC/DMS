package handlers

import (
	"errors"
	"strings"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ─── Read ─────────────────────────────────────────────────────────────────

// ListDeviceFAQs returns a device's FAQs. Public, like the device page itself
// — anyone who can scan the sticker can read the answers. Unpublished entries
// are admin-only, so an admin can draft one before it goes live.
func ListDeviceFAQs(c *gin.Context) {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Device not found")
		return
	}

	q := database.DB.Where("device_id = ?", device.ID)
	if utils.CurrentRole(c) != models.RoleAdmin {
		q = q.Where("is_published = ?", true)
	}

	var faqs []models.FAQ
	if err := q.Order("sort_order asc, created_at asc").Find(&faqs).Error; err != nil {
		utils.ServerError(c, "Could not load the FAQs")
		return
	}

	utils.OK(c, faqs)
}

// ViewFAQ bumps the read counter, so an admin can see which answers people
// actually need. Fire-and-forget: a failed count must not break the page.
func ViewFAQ(c *gin.Context) {
	result := database.DB.Model(&models.FAQ{}).
		Where("id = ?", c.Param("faqId")).
		UpdateColumn("view_count", gorm.Expr("view_count + 1"))
	if result.Error != nil {
		utils.ServerError(c, "Could not record the FAQ view")
		return
	}
	if result.RowsAffected == 0 {
		utils.NotFound(c, "FAQ not found")
		return
	}
	utils.OK(c, nil)
}

// ─── Write (admin) ────────────────────────────────────────────────────────

type faqForm struct {
	Question    string `json:"question" binding:"required"`
	Answer      string `json:"answer" binding:"required"`
	SortOrder   int    `json:"sort_order"`
	IsPublished *bool  `json:"is_published"`
}

func (f *faqForm) validate() error {
	f.Question = strings.TrimSpace(f.Question)
	f.Answer = strings.TrimSpace(f.Answer)

	if len(f.Question) < 5 {
		return errors.New("please enter a question of at least 5 characters")
	}
	if len([]rune(f.Question)) > 400 {
		return errors.New("question cannot exceed 400 characters")
	}
	if len(f.Answer) < 5 {
		return errors.New("please enter an answer of at least 5 characters")
	}
	if len([]rune(f.Answer)) > 20000 {
		return errors.New("answer cannot exceed 20000 characters")
	}
	return nil
}

// CreateFAQ adds an FAQ to a device.
func CreateFAQ(c *gin.Context) {
	var device models.Device
	if err := database.DB.First(&device, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Device not found")
		return
	}

	var form faqForm
	if err := c.ShouldBindJSON(&form); err != nil {
		utils.BadRequest(c, "A question and an answer are both required")
		return
	}
	if err := form.validate(); err != nil {
		utils.BadRequest(c, capitalise(err.Error()))
		return
	}

	published := true
	if form.IsPublished != nil {
		published = *form.IsPublished
	}

	// Default to the end of the list so a new entry never jumps the queue.
	order := form.SortOrder
	if order == 0 {
		var max int
		database.DB.Model(&models.FAQ{}).
			Where("device_id = ?", device.ID).
			Select("COALESCE(MAX(sort_order), 0)").Scan(&max)
		order = max + 1
	}

	faq := models.FAQ{
		DeviceID:      device.ID,
		Question:      form.Question,
		Answer:        form.Answer,
		SortOrder:     order,
		IsPublished:   published,
		CreatedBy:     utils.CurrentUserID(c),
		CreatedByName: utils.CurrentUserName(c),
	}

	if err := database.DB.Create(&faq).Error; err != nil {
		utils.ServerError(c, "Could not save the FAQ")
		return
	}

	utils.Audit(c, models.ActionFAQCreated, "faq", device.DeviceNumber, gin.H{"question": faq.Question})
	utils.Created(c, faq)
}

// UpdateFAQ edits an existing entry.
func UpdateFAQ(c *gin.Context) {
	var faq models.FAQ
	if err := database.DB.First(&faq, c.Param("faqId")).Error; err != nil {
		utils.NotFound(c, "FAQ not found")
		return
	}

	var form faqForm
	if err := c.ShouldBindJSON(&form); err != nil {
		utils.BadRequest(c, "A question and an answer are both required")
		return
	}
	if err := form.validate(); err != nil {
		utils.BadRequest(c, capitalise(err.Error()))
		return
	}

	updates := map[string]interface{}{
		"question":   form.Question,
		"answer":     form.Answer,
		"sort_order": form.SortOrder,
	}
	if form.IsPublished != nil {
		updates["is_published"] = *form.IsPublished
	}

	if err := database.DB.Model(&faq).Updates(updates).Error; err != nil {
		utils.ServerError(c, "Could not update the FAQ")
		return
	}

	database.DB.First(&faq, faq.ID)
	utils.Audit(c, models.ActionFAQUpdated, "faq", faq.Question, nil)
	utils.OKMessage(c, "FAQ updated", faq)
}

// DeleteFAQ removes an entry.
func DeleteFAQ(c *gin.Context) {
	var faq models.FAQ
	if err := database.DB.First(&faq, c.Param("faqId")).Error; err != nil {
		utils.NotFound(c, "FAQ not found")
		return
	}

	if err := database.DB.Delete(&faq).Error; err != nil {
		utils.ServerError(c, "Could not delete the FAQ")
		return
	}

	utils.Audit(c, models.ActionFAQDeleted, "faq", faq.Question, nil)
	utils.OKMessage(c, "FAQ deleted", nil)
}

// ─── Promote a ticket ─────────────────────────────────────────────────────

type promoteForm struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

// PromoteQueryToFAQ turns a resolved ticket into an FAQ on its device. This is
// where most FAQs come from: a real question someone asked, with the answer
// that actually resolved it.
func PromoteQueryToFAQ(c *gin.Context) {
	var q models.Query
	if err := database.DB.First(&q, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "Query not found")
		return
	}
	if q.DeviceID == 0 {
		utils.BadRequest(c, "This ticket is not attached to a device, so it cannot become an FAQ")
		return
	}

	// One FAQ per ticket — re-promoting would quietly duplicate the entry.
	var existing int64
	database.DB.Model(&models.FAQ{}).Where("source_query_id = ?", q.ID).Count(&existing)
	if existing > 0 {
		utils.Conflict(c, q.TicketNumber+" has already been added to this device's FAQ")
		return
	}

	var form promoteForm
	_ = c.ShouldBindJSON(&form)

	// Fall back to the ticket's own wording when the admin doesn't rewrite it.
	question := strings.TrimSpace(form.Question)
	if question == "" {
		question = q.Title
	}
	answer := strings.TrimSpace(form.Answer)
	if answer == "" {
		answer = strings.TrimSpace(q.AdminRemarks)
	}
	if answer == "" {
		utils.BadRequest(c, "This ticket has no admin remarks to use as the answer. Add remarks first, or type an answer here.")
		return
	}
	validated := faqForm{Question: question, Answer: answer}
	if err := validated.validate(); err != nil {
		utils.BadRequest(c, capitalise(err.Error()))
		return
	}
	question, answer = validated.Question, validated.Answer

	var max int
	database.DB.Model(&models.FAQ{}).
		Where("device_id = ?", q.DeviceID).
		Select("COALESCE(MAX(sort_order), 0)").Scan(&max)

	faq := models.FAQ{
		DeviceID:      q.DeviceID,
		Question:      question,
		Answer:        answer,
		SourceQueryID: &q.ID,
		SourceTicket:  q.TicketNumber,
		SortOrder:     max + 1,
		IsPublished:   true,
		CreatedBy:     utils.CurrentUserID(c),
		CreatedByName: utils.CurrentUserName(c),
	}

	if err := database.DB.Create(&faq).Error; err != nil {
		if isUniqueViolation(err) {
			utils.Conflict(c, q.TicketNumber+" has already been added to this device's FAQ")
			return
		}
		utils.ServerError(c, "Could not add this ticket to the FAQ")
		return
	}

	utils.Audit(c, models.ActionFAQCreated, "faq", q.TicketNumber, gin.H{"promoted_from_query": q.ID})
	utils.Created(c, gin.H{
		"message": "Added to this device's FAQ",
		"faq":     faq,
	})
}
