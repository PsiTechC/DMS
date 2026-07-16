package handlers

import (
	"log"
	"strings"

	"dms/backend/internal/config"
	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/services"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type createUserRequest struct {
	Name       string      `json:"name" binding:"required,min=2"`
	Email      string      `json:"email" binding:"required,email"`
	Password   string      `json:"password" binding:"required,min=8"`
	Role       models.Role `json:"role" binding:"required"`
	EmployeeID string      `json:"employee_id"`
	Department string      `json:"department"`
	Company    string      `json:"company"`
	Phone      string      `json:"phone"`
	Location   string      `json:"location"`
	// Defaults to true when omitted: an account nobody was told about is
	// useless, so emailing is the sane default rather than an opt-in.
	SendCredentials *bool `json:"send_credentials"`
}

func validRole(r models.Role) bool {
	return r == models.RoleAdmin || r == models.RoleUser || r == models.RoleClient
}

// CreateUser adds an account. Admins may create any role; a client may create
// only User-role accounts.
func CreateUser(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Name, a valid email, a password of at least 8 characters, and a role are required")
		return
	}
	if !validRole(req.Role) {
		utils.BadRequest(c, "Role must be admin, user, or client")
		return
	}

	// Privilege guard: a non-admin cannot mint an account at or above their own
	// level. A client creating an admin (or another client) would be a straight
	// escalation, so we force it to a plain User regardless of what was sent.
	// This is the real security boundary — the UI hint is only convenience.
	if utils.CurrentRole(c) != models.RoleAdmin {
		if req.Role != models.RoleUser {
			utils.Forbidden(c, "You can only create User accounts.")
			return
		}
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

	var existing int64
	database.DB.Model(&models.User{}).Where("email = ?", email).Count(&existing)
	if existing > 0 {
		utils.Conflict(c, "An account with this email already exists")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		utils.ServerError(c, "Could not create the account")
		return
	}

	user := models.User{
		Name:         strings.TrimSpace(req.Name),
		Email:        email,
		PasswordHash: string(hash),
		Role:         req.Role,
		EmployeeID:   strings.TrimSpace(req.EmployeeID),
		Department:   strings.TrimSpace(req.Department),
		Company:      strings.TrimSpace(req.Company),
		Phone:        strings.TrimSpace(req.Phone),
		Location:     strings.TrimSpace(req.Location),
		IsActive:     true,
	}

	if err := database.DB.Create(&user).Error; err != nil {
		utils.ServerError(c, "Could not create the account")
		return
	}

	utils.Audit(c, models.ActionUserCreated, "user", user.Email, gin.H{"role": user.Role})

	// Email the credentials. Done synchronously and reported honestly: if the
	// admin thinks the user was told and they weren't, the account silently
	// never gets used. The account is already created either way.
	send := true
	if req.SendCredentials != nil {
		send = *req.SendCredentials
	}

	emailed, emailErr := false, ""
	if send {
		if err := services.SendCredentialsEmail(&user, req.Password, loginURL()); err != nil {
			emailErr = err.Error()
			log.Printf("user: credentials email to %s failed: %v", user.Email, err)
		} else {
			emailed = config.C.EmailEnabled
			if emailed {
				utils.Audit(c, models.ActionCredsSent, "user", user.Email, nil)
			}
		}
	}

	message := "User created"
	switch {
	case emailed:
		message = "User created — login details emailed to " + user.Email
	case emailErr != "":
		message = "User created, but the credentials email could not be sent: " + emailErr
	case send && !config.C.EmailEnabled:
		message = "User created. Email is disabled on the server, so share the password manually."
	}

	c.JSON(201, gin.H{
		"success": true,
		"message": message,
		"data":    user,
		"meta":    gin.H{"credentials_emailed": emailed, "email_error": emailErr},
	})
}

// loginURL is where the credentials email points the new user.
func loginURL() string {
	return strings.TrimRight(config.C.PublicBaseURL, "/") + "/login"
}

// ListUsers returns a filtered page of accounts. Admins see everyone; a client
// sees only the User-role accounts, never admins or other clients — the same
// accounts they are allowed to create.
func ListUsers(c *gin.Context) {
	page, limit, offset := utils.Pagination(c)
	clientView := utils.CurrentRole(c) != models.RoleAdmin

	build := func() *gorm.DB {
		q := database.DB.Model(&models.User{})
		if clientView {
			q = q.Where("role = ?", models.RoleUser)
		}
		if s := strings.TrimSpace(c.Query("search")); s != "" {
			like := "%" + strings.ToLower(s) + "%"
			q = q.Where(`LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR
			             LOWER(employee_id) LIKE ? OR LOWER(department) LIKE ?`,
				like, like, like, like)
		}
		if r := c.Query("role"); r != "" && r != "all" {
			q = q.Where("role = ?", r)
		}
		if a := c.Query("is_active"); a == "true" || a == "false" {
			q = q.Where("is_active = ?", a == "true")
		}
		return q
	}

	var total int64
	build().Count(&total)

	var users []models.User
	sortable := map[string]bool{"name": true, "email": true, "role": true, "created_at": true, "last_login_at": true}
	if err := build().
		Order(utils.SafeSort(c, sortable, "created_at desc")).
		Limit(limit).Offset(offset).Find(&users).Error; err != nil {
		utils.ServerError(c, "Could not load users")
		return
	}

	utils.Paginated(c, users, utils.Meta{
		Page: page, Limit: limit, Total: total,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	})
}

// GetUser returns a single account. A client may only read User-role accounts,
// so it cannot look up an admin by guessing an ID.
func GetUser(c *gin.Context) {
	var user models.User
	if err := database.DB.First(&user, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "User not found")
		return
	}
	if utils.CurrentRole(c) != models.RoleAdmin && user.Role != models.RoleUser {
		utils.Forbidden(c, "You do not have permission to view this account")
		return
	}
	utils.OK(c, user)
}

type updateUserRequest struct {
	Name       string      `json:"name"`
	Role       models.Role `json:"role"`
	EmployeeID string      `json:"employee_id"`
	Department string      `json:"department"`
	Company    string      `json:"company"`
	Phone      string      `json:"phone"`
	Location   string      `json:"location"`
	IsActive   *bool       `json:"is_active"`
	Password   string      `json:"password"`
	// Only meaningful alongside Password: email the reset password to the user.
	SendCredentials *bool `json:"send_credentials"`
}

// UpdateUser edits an account. Admin only.
func UpdateUser(c *gin.Context) {
	var user models.User
	if err := database.DB.First(&user, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "User not found")
		return
	}

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid user data")
		return
	}

	updates := map[string]interface{}{}
	if v := strings.TrimSpace(req.Name); v != "" {
		updates["name"] = v
	}
	if req.Role != "" {
		if !validRole(req.Role) {
			utils.BadRequest(c, "Role must be admin, user, or client")
			return
		}
		// Never let the last admin demote themselves out of the system.
		if user.Role == models.RoleAdmin && req.Role != models.RoleAdmin {
			if lastAdmin(user.ID) {
				utils.BadRequest(c, "This is the only admin account. Promote another user to admin first.")
				return
			}
		}
		updates["role"] = req.Role
	}
	if req.IsActive != nil {
		if !*req.IsActive && user.Role == models.RoleAdmin && lastAdmin(user.ID) {
			utils.BadRequest(c, "This is the only admin account and cannot be deactivated.")
			return
		}
		updates["is_active"] = *req.IsActive
	}
	if req.Password != "" {
		if len(req.Password) < 8 {
			utils.BadRequest(c, "The new password must be at least 8 characters")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			utils.ServerError(c, "Could not set the password")
			return
		}
		updates["password_hash"] = string(hash)
	}

	updates["employee_id"] = strings.TrimSpace(req.EmployeeID)
	updates["department"] = strings.TrimSpace(req.Department)
	updates["company"] = strings.TrimSpace(req.Company)
	updates["phone"] = strings.TrimSpace(req.Phone)
	updates["location"] = strings.TrimSpace(req.Location)

	if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
		utils.ServerError(c, "Could not update the account")
		return
	}

	database.DB.First(&user, user.ID)
	utils.Audit(c, models.ActionUserUpdated, "user", user.Email, gin.H{"role": user.Role, "active": user.IsActive})

	// A reset password the user is never told about just locks them out.
	message := "User updated"
	if req.Password != "" {
		send := true
		if req.SendCredentials != nil {
			send = *req.SendCredentials
		}
		if send {
			if err := services.SendCredentialsEmail(&user, req.Password, loginURL()); err != nil {
				log.Printf("user: reset email to %s failed: %v", user.Email, err)
				message = "User updated, but the new password could not be emailed: " + err.Error()
			} else if config.C.EmailEnabled {
				utils.Audit(c, models.ActionCredsSent, "user", user.Email, "password reset")
				message = "User updated — new password emailed to " + user.Email
			}
		}
	}

	utils.OKMessage(c, message, user)
}

// DeleteUser soft-deletes an account. Admin only.
func DeleteUser(c *gin.Context) {
	var user models.User
	if err := database.DB.First(&user, c.Param("id")).Error; err != nil {
		utils.NotFound(c, "User not found")
		return
	}

	if user.ID == utils.CurrentUserID(c) {
		utils.BadRequest(c, "You cannot delete your own account")
		return
	}
	if user.Role == models.RoleAdmin && lastAdmin(user.ID) {
		utils.BadRequest(c, "This is the only admin account and cannot be deleted")
		return
	}

	if err := database.DB.Delete(&user).Error; err != nil {
		utils.ServerError(c, "Could not delete the account")
		return
	}

	utils.Audit(c, models.ActionUserDeleted, "user", user.Email, nil)
	utils.OKMessage(c, "User deleted", nil)
}

// lastAdmin reports whether userID is the only remaining active admin.
func lastAdmin(userID uint) bool {
	var others int64
	database.DB.Model(&models.User{}).
		Where("role = ? AND is_active = ? AND id <> ?", models.RoleAdmin, true, userID).
		Count(&others)
	return others == 0
}
