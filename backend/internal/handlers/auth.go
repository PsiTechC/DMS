package handlers

import (
	"errors"
	"strings"
	"time"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type authResponse struct {
	Token     string       `json:"token"`
	ExpiresAt time.Time    `json:"expires_at"`
	User      *models.User `json:"user"`
}

// Login issues a JWT for valid credentials.
func Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Please provide a valid email and a password of at least 6 characters")
		return
	}

	var user models.User
	err := database.DB.Where("email = ?", strings.ToLower(strings.TrimSpace(req.Email))).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Same message for unknown email and wrong password — do not reveal
			// which accounts exist.
			utils.Unauthorized(c, "Invalid email or password")
			return
		}
		utils.ServerError(c, "Could not sign you in. Please try again.")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		utils.Unauthorized(c, "Invalid email or password")
		return
	}

	if !user.IsActive {
		utils.Forbidden(c, "Your account has been deactivated. Please contact an administrator.")
		return
	}

	token, expiry, err := utils.GenerateToken(&user)
	if err != nil {
		utils.ServerError(c, "Could not create your session. Please try again.")
		return
	}

	now := time.Now()
	database.DB.Model(&user).UpdateColumn("last_login_at", now)
	user.LastLoginAt = &now

	// Populate context so the audit row carries the identity.
	c.Set("user_id", user.ID)
	c.Set("user_role", user.Role)
	c.Set("user_name", user.Name)
	utils.Audit(c, models.ActionUserLogin, "user", user.Email, gin.H{"role": user.Role})

	utils.OK(c, authResponse{Token: token, ExpiresAt: expiry, User: &user})
}

// Me returns the currently authenticated user.
func Me(c *gin.Context) {
	user, err := utils.CurrentUser(c)
	if err != nil {
		utils.NotFound(c, "User not found")
		return
	}
	utils.OK(c, user)
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

// ChangePassword updates the caller's own password.
func ChangePassword(c *gin.Context) {
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Your new password must be at least 8 characters")
		return
	}

	user, err := utils.CurrentUser(c)
	if err != nil {
		utils.NotFound(c, "User not found")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		utils.BadRequest(c, "Your current password is incorrect")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		utils.ServerError(c, "Could not update your password")
		return
	}

	if err := database.DB.Model(user).Update("password_hash", string(hash)).Error; err != nil {
		utils.ServerError(c, "Could not update your password")
		return
	}

	utils.Audit(c, models.ActionUserUpdated, "user", user.Email, "password changed")
	utils.OKMessage(c, "Password updated successfully", nil)
}

type updateProfileRequest struct {
	Name     string `json:"name"`
	Phone    string `json:"phone"`
	Location string `json:"location"`
}

// UpdateProfile lets any role edit their own non-privileged fields.
func UpdateProfile(c *gin.Context) {
	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid profile data")
		return
	}

	user, err := utils.CurrentUser(c)
	if err != nil {
		utils.NotFound(c, "User not found")
		return
	}

	updates := map[string]interface{}{}
	if n := strings.TrimSpace(req.Name); n != "" {
		updates["name"] = n
	}
	updates["phone"] = strings.TrimSpace(req.Phone)
	updates["location"] = strings.TrimSpace(req.Location)

	if err := database.DB.Model(user).Updates(updates).Error; err != nil {
		utils.ServerError(c, "Could not update your profile")
		return
	}

	database.DB.First(user, user.ID)
	utils.OKMessage(c, "Profile updated", user)
}
