package middleware

import (
	"strings"

	"dms/backend/internal/database"
	"dms/backend/internal/models"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
)

func bearerToken(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func setUserContext(c *gin.Context, claims *utils.Claims) {
	c.Set("user_id", claims.UserID)
	c.Set("user_role", claims.Role)
	c.Set("user_email", claims.Email)
	c.Set("user_name", claims.Name)
}

// Auth rejects any request without a valid token for an active user.
func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerToken(c)
		if token == "" {
			utils.Unauthorized(c, "Authorization token required")
			return
		}

		claims, err := utils.ParseToken(token)
		if err != nil {
			utils.Unauthorized(c, "Invalid or expired session. Please log in again.")
			return
		}

		// Confirm the account still exists and is active — a token alone is not
		// enough if the user was deactivated mid-session.
		var user models.User
		if err := database.DB.First(&user, claims.UserID).Error; err != nil {
			utils.Unauthorized(c, "Account no longer exists")
			return
		}
		if !user.IsActive {
			utils.Forbidden(c, "Your account has been deactivated")
			return
		}
		if claims.AuthVersion != user.AuthVersion {
			utils.Unauthorized(c, "Your session was revoked. Please log in again.")
			return
		}

		claims.Role = user.Role // trust the DB over the token for role
		setUserContext(c, claims)
		c.Next()
	}
}

// OptionalAuth attaches user context when a valid token is present but never
// blocks the request. Used by public QR scan / device view endpoints.
func OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if token := bearerToken(c); token != "" {
			if claims, err := utils.ParseToken(token); err == nil {
				var user models.User
				if err := database.DB.First(&user, claims.UserID).Error; err == nil && user.IsActive && claims.AuthVersion == user.AuthVersion {
					claims.Role = user.Role
					setUserContext(c, claims)
				}
			}
		}
		c.Next()
	}
}

// RequireRole allows only the listed roles through.
func RequireRole(roles ...models.Role) gin.HandlerFunc {
	allowed := make(map[models.Role]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}

	return func(c *gin.Context) {
		role := utils.CurrentRole(c)
		if role == "" {
			utils.Unauthorized(c, "Authentication required")
			return
		}
		if !allowed[role] {
			utils.Forbidden(c, "You do not have permission to perform this action")
			return
		}
		c.Next()
	}
}

// AdminOnly is the common case shorthand.
func AdminOnly() gin.HandlerFunc {
	return RequireRole(models.RoleAdmin)
}
