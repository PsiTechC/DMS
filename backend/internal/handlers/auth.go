package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"dms/backend/internal/config"
	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/services"
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

// ─── Passwordless email verification for QR visitors ────────────────────

const emailLoginCodeTTL = 10 * time.Minute

type emailCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type emailCodeVerifyRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6,numeric"`
}

// RequestEmailLoginCode sends a six-digit, single-use sign-in code. Password
// accounts at privileged roles cannot use this path to bypass their password.
func RequestEmailLoginCode(c *gin.Context) {
	var req emailCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Please enter a valid email address")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	var existing models.User
	if err := database.DB.Where("email = ?", email).First(&existing).Error; err == nil {
		if existing.Role != models.RoleUser {
			utils.BadRequest(c, "Administrator and client accounts must sign in with their password")
			return
		}
		if !existing.IsActive {
			utils.Forbidden(c, "This account has been deactivated. Please contact an administrator.")
			return
		}
	}

	number, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		utils.ServerError(c, "Could not create a verification code")
		return
	}
	code := fmt.Sprintf("%06d", number.Int64())
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		utils.ServerError(c, "Could not create a verification code")
		return
	}

	now := time.Now()
	database.DB.Model(&models.EmailLoginCode{}).
		Where("email = ? AND used_at IS NULL", email).
		Update("used_at", now)
	entry := models.EmailLoginCode{
		Email: email, CodeHash: string(hash), ExpiresAt: now.Add(emailLoginCodeTTL),
		IPAddress: utils.ClientIP(c),
	}
	if err := database.DB.Create(&entry).Error; err != nil {
		utils.ServerError(c, "Could not save the verification code")
		return
	}
	if err := services.SendEmailLoginCode(email, code, emailLoginCodeTTL); err != nil {
		database.DB.Model(&entry).Update("used_at", time.Now())
		log.Printf("auth: verification code to %s failed: %v", email, err)
		utils.ServerError(c, "We could not email the verification code. Please contact an administrator.")
		return
	}

	utils.Audit(c, models.ActionEmailCodeSent, "email_login", email, nil)
	utils.OKMessage(c, "A six-digit verification code was sent to "+email, gin.H{
		"email": email, "expires_in_seconds": int(emailLoginCodeTTL.Seconds()),
	})
}

// VerifyEmailLoginCode consumes a code, creates a normal query-user account on
// first use, and returns the same JWT session shape as password login.
func VerifyEmailLoginCode(c *gin.Context) {
	var req emailCodeVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Enter the six-digit code from your email")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	var entry models.EmailLoginCode
	err := database.DB.Where(
		"email = ? AND used_at IS NULL AND expires_at > ? AND attempts < 5",
		email, time.Now(),
	).Order("created_at desc").First(&entry).Error
	if err != nil {
		utils.BadRequest(c, "This verification code is invalid or expired. Request a new code.")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(entry.CodeHash), []byte(req.Code)) != nil {
		database.DB.Model(&entry).UpdateColumn("attempts", gorm.Expr("attempts + 1"))
		utils.BadRequest(c, "The verification code is incorrect")
		return
	}

	var user models.User
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.EmailLoginCode{}).
			Where("id = ? AND used_at IS NULL", entry.ID).
			Update("used_at", time.Now())
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("verification code already used")
		}

		findErr := tx.Where("email = ?", email).First(&user).Error
		if findErr == nil {
			if user.Role != models.RoleUser || !user.IsActive {
				return errors.New("account cannot use email-code access")
			}
			return nil
		}
		if !errors.Is(findErr, gorm.ErrRecordNotFound) {
			return findErr
		}

		rawPassword, tokenErr := randomToken()
		if tokenErr != nil {
			return tokenErr
		}
		passwordHash, hashErr := bcrypt.GenerateFromPassword([]byte(rawPassword), bcrypt.DefaultCost)
		if hashErr != nil {
			return hashErr
		}
		localName := strings.Split(email, "@")[0]
		localName = strings.TrimSpace(strings.NewReplacer(".", " ", "_", " ", "-", " ").Replace(localName))
		if localName == "" {
			localName = "QR User"
		}
		user = models.User{
			Name: localName, Email: email, PasswordHash: string(passwordHash),
			Role: models.RoleUser, IsActive: true,
		}
		return tx.Create(&user).Error
	})
	if err != nil {
		utils.BadRequest(c, "This verification code could not be used. Request a new code.")
		return
	}

	token, expiry, err := utils.GenerateToken(&user)
	if err != nil {
		utils.ServerError(c, "Could not create your session")
		return
	}
	now := time.Now()
	database.DB.Model(&user).UpdateColumn("last_login_at", now)
	user.LastLoginAt = &now
	c.Set("user_id", user.ID)
	c.Set("user_role", user.Role)
	c.Set("user_name", user.Name)
	utils.Audit(c, models.ActionEmailCodeUsed, "user", user.Email, nil)
	utils.OK(c, authResponse{Token: token, ExpiresAt: expiry, User: &user})
}

// ─── Forgot / reset password ──────────────────────────────────────────────

const resetTokenTTL = 60 * time.Minute

type forgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// ForgotPassword emails a one-time reset link.
//
// It always reports success, even for an unknown address. Saying "no such
// account" would turn this open endpoint into a way to discover who has one.
func ForgotPassword(c *gin.Context) {
	var req forgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Please enter a valid email address")
		return
	}

	const done = "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder."
	email := strings.ToLower(strings.TrimSpace(req.Email))

	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		utils.OKMessage(c, done, nil)
		return
	}
	if !user.IsActive {
		// Same story for a deactivated account: reveal nothing.
		utils.OKMessage(c, done, nil)
		return
	}

	// Retire any earlier links, so only the newest one works.
	now := time.Now()
	database.DB.Model(&models.PasswordReset{}).
		Where("user_id = ? AND used_at IS NULL", user.ID).
		Update("used_at", now)

	raw, err := randomToken()
	if err != nil {
		utils.ServerError(c, "Could not start the reset. Please try again.")
		return
	}

	reset := models.PasswordReset{
		UserID:    user.ID,
		TokenHash: hashToken(raw),
		ExpiresAt: now.Add(resetTokenTTL),
		IPAddress: utils.ClientIP(c),
	}
	if err := database.DB.Create(&reset).Error; err != nil {
		utils.ServerError(c, "Could not start the reset. Please try again.")
		return
	}

	resetURL := fmt.Sprintf("%s/reset-password?token=%s",
		strings.TrimRight(config.C.PublicBaseURL, "/"), raw)

	// Sent synchronously: the user is standing there waiting for this mail, so
	// a failure has to be reported rather than swallowed.
	if err := services.SendPasswordResetEmail(&user, resetURL, resetTokenTTL); err != nil {
		log.Printf("auth: reset email to %s failed: %v", user.Email, err)
		// Burn the token — it was never delivered.
		database.DB.Model(&reset).Update("used_at", time.Now())
		utils.ServerError(c, "We could not send the reset email. Please contact your administrator.")
		return
	}

	c.Set("user_id", user.ID)
	c.Set("user_role", user.Role)
	c.Set("user_name", user.Name)
	utils.Audit(c, models.ActionPwResetAsked, "user", user.Email, nil)

	utils.OKMessage(c, done, nil)
}

type resetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// ResetPassword consumes a reset token and sets the new password.
func ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Your new password must be at least 8 characters")
		return
	}
	if len(req.NewPassword) > 72 {
		utils.BadRequest(c, "Your new password cannot exceed 72 bytes")
		return
	}

	var reset models.PasswordReset
	err := database.DB.
		Where("token_hash = ? AND used_at IS NULL AND expires_at > ?", hashToken(req.Token), time.Now()).
		First(&reset).Error
	if err != nil {
		// One message for expired, used, and forged — no probing.
		utils.BadRequest(c, "This reset link is invalid or has expired. Please request a new one.")
		return
	}

	var user models.User
	if err := database.DB.First(&user, reset.UserID).Error; err != nil {
		utils.BadRequest(c, "This reset link is no longer valid.")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		utils.ServerError(c, "Could not set your password. Please try again.")
		return
	}

	// One transaction: a password changed without the token being burnt would
	// leave a working link in an inbox forever.
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&user).Updates(map[string]interface{}{
			"password_hash": string(hash),
			"auth_version":  gorm.Expr("auth_version + 1"),
		}).Error; err != nil {
			return err
		}
		return tx.Model(&reset).Update("used_at", time.Now()).Error
	})
	if err != nil {
		utils.ServerError(c, "Could not set your password. Please try again.")
		return
	}

	c.Set("user_id", user.ID)
	c.Set("user_role", user.Role)
	c.Set("user_name", user.Name)
	utils.Audit(c, models.ActionPwResetDone, "user", user.Email, nil)

	utils.OKMessage(c, "Your password has been reset. You can sign in now.", gin.H{"email": user.Email})
}

// VerifyResetToken lets the reset page tell a dead link from a live one before
// the user types a new password into a form that cannot work.
func VerifyResetToken(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		utils.BadRequest(c, "No reset token provided")
		return
	}

	var reset models.PasswordReset
	err := database.DB.
		Where("token_hash = ? AND used_at IS NULL AND expires_at > ?", hashToken(token), time.Now()).
		First(&reset).Error
	if err != nil {
		utils.BadRequest(c, "This reset link is invalid or has expired. Please request a new one.")
		return
	}

	var user models.User
	if err := database.DB.First(&user, reset.UserID).Error; err != nil {
		utils.BadRequest(c, "This reset link is no longer valid.")
		return
	}

	utils.OK(c, gin.H{"email": user.Email, "name": user.Name, "expires_at": reset.ExpiresAt})
}

// randomToken returns 32 bytes of crypto-grade randomness, hex encoded.
func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashToken is what gets stored. Plain SHA-256 is right here rather than
// bcrypt: the token is already 256 bits of randomness, so there is nothing to
// brute force, and lookups must stay indexable.
func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
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

// Logout revokes every token issued for the current account. Clearing browser
// storage alone would leave a copied token usable until its normal expiry.
func Logout(c *gin.Context) {
	user, err := utils.CurrentUser(c)
	if err != nil {
		utils.NotFound(c, "User not found")
		return
	}
	if err := database.DB.Model(user).UpdateColumn("auth_version", gorm.Expr("auth_version + 1")).Error; err != nil {
		utils.ServerError(c, "Could not end the session")
		return
	}
	utils.Audit(c, models.ActionUserUpdated, "user", user.Email, "all sessions revoked on logout")
	utils.OKMessage(c, "Signed out successfully", nil)
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
	if len(req.NewPassword) > 72 {
		utils.BadRequest(c, "Your new password cannot exceed 72 bytes")
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

	if err := database.DB.Model(user).Updates(map[string]interface{}{
		"password_hash": string(hash),
		"auth_version":  gorm.Expr("auth_version + 1"),
	}).Error; err != nil {
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
