package utils

import (
	"encoding/json"
	"log"
	"strconv"
	"strings"
	"time"

	"dms/backend/internal/database"
	"dms/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// ─── Context accessors (populated by middleware.Auth) ─────────────────────

func CurrentUserID(c *gin.Context) uint {
	if v, ok := c.Get("user_id"); ok {
		if id, ok := v.(uint); ok {
			return id
		}
	}
	return 0
}

func CurrentRole(c *gin.Context) models.Role {
	if v, ok := c.Get("user_role"); ok {
		if r, ok := v.(models.Role); ok {
			return r
		}
	}
	return ""
}

func CurrentUserName(c *gin.Context) string {
	if v, ok := c.Get("user_name"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return "anonymous"
}

// CurrentUser loads the full user row for the authenticated request.
func CurrentUser(c *gin.Context) (*models.User, error) {
	var u models.User
	if err := database.DB.First(&u, CurrentUserID(c)).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

// SeesAllQueries reports whether the caller may read every ticket rather than
// only their own.
//
// Users raise queries, so "own tickets" is exactly what they want. Clients are
// read-only oversight accounts that CANNOT raise a query at all — scoping them
// to their own would leave them with a permanently empty list. They already
// read every device, so the whole ticket list is consistent with that.
// Reading is all this grants: mutations stay admin-only in the route groups.
func SeesAllQueries(c *gin.Context) bool {
	role := CurrentRole(c)
	return role == models.RoleAdmin || role == models.RoleClient
}

// ─── Audit ────────────────────────────────────────────────────────────────

// Audit writes an audit-log row. Failures are logged, never surfaced to the
// caller — an audit write must not fail the user's actual request.
func Audit(c *gin.Context, action, entityType, entityID string, details interface{}) {
	var detailStr string
	switch v := details.(type) {
	case nil:
		detailStr = ""
	case string:
		detailStr = v
	default:
		if b, err := json.Marshal(v); err == nil {
			detailStr = string(b)
		}
	}

	entry := models.AuditLog{
		UserName:   CurrentUserName(c),
		UserRole:   string(CurrentRole(c)),
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		Details:    detailStr,
		IPAddress:  ClientIP(c),
		CreatedAt:  time.Now(),
	}
	if uid := CurrentUserID(c); uid != 0 {
		entry.UserID = &uid
	}

	if err := database.DB.Create(&entry).Error; err != nil {
		log.Printf("audit: failed to write %s: %v", action, err)
	}
}

// ClientIP prefers proxy headers, falling back to Gin's resolution.
func ClientIP(c *gin.Context) string {
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if rip := c.GetHeader("X-Real-IP"); rip != "" {
		return rip
	}
	return c.ClientIP()
}

// ─── Query param parsing ──────────────────────────────────────────────────

func QueryInt(c *gin.Context, key string, fallback int) int {
	if v, err := strconv.Atoi(c.Query(key)); err == nil {
		return v
	}
	return fallback
}

// ParseDate accepts "2006-01-02" or full RFC3339, returning nil for blanks.
func ParseDate(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

// SafeSort whitelists sortable columns to keep ORDER BY injection-free.
func SafeSort(c *gin.Context, allowed map[string]bool, fallback string) string {
	col := c.Query("sort_by")
	dir := strings.ToLower(c.Query("sort_dir"))
	if !allowed[col] {
		return fallback
	}
	if dir != "asc" && dir != "desc" {
		dir = "desc"
	}
	return col + " " + dir
}
