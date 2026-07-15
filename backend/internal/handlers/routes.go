package handlers

import (
	"net/http"
	"time"

	"dms/backend/internal/config"
	"dms/backend/internal/middleware"
	"dms/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// RegisterRoutes wires every endpoint onto the router.
func RegisterRoutes(r *gin.Engine, cfg *config.Config) {
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
			"time":   time.Now(),
			"env":    cfg.AppEnv,
		})
	})

	// Uploaded media is served statically. Filenames are random UUIDs, so a
	// URL is effectively unguessable, but this directory is world-readable —
	// do not store confidential documents here without adding auth.
	r.Static("/uploads", cfg.UploadDir)

	api := r.Group("/api")

	// ─── Public ───────────────────────────────────────────────────────────
	// Login is rate limited harder than the rest to blunt credential stuffing.
	api.POST("/auth/login", middleware.RateLimit(0.2, 8), Login)

	// The QR sticker points here. OptionalAuth so a logged-in scan is
	// attributed, while an anonymous scan still works.
	api.GET("/scan/:assetId", middleware.OptionalAuth(), middleware.RateLimit(3, 30), ScanQR)
	api.GET("/qr/:assetId/image", GetQRImage)

	// ─── Authenticated (any role) ─────────────────────────────────────────
	auth := api.Group("", middleware.Auth())
	{
		auth.GET("/auth/me", Me)
		auth.POST("/auth/change-password", ChangePassword)
		auth.PUT("/auth/profile", UpdateProfile)

		auth.GET("/dashboard/stats", DashboardStats)
		auth.GET("/dashboard/charts", DashboardCharts)
		auth.GET("/dashboard/recent", DashboardRecent)

		// Read-only device access is open to all three roles.
		auth.GET("/devices", ListDevices)
		auth.GET("/devices/:id", GetDevice)
		auth.GET("/devices/filters/options", DeviceFilterOptions)

		auth.GET("/queries", ListQueries)
		auth.GET("/queries/:id", GetQuery)
	}

	// ─── Admin + User (clients are read-only) ─────────────────────────────
	raiser := api.Group("", middleware.Auth(), middleware.RequireRole(models.RoleAdmin, models.RoleUser))
	{
		raiser.POST("/queries", middleware.RateLimit(0.5, 5), CreateQuery)
	}

	// ─── Admin only ───────────────────────────────────────────────────────
	admin := api.Group("", middleware.Auth(), middleware.AdminOnly())
	{
		// QR lifecycle
		admin.POST("/qr/generate", GenerateQRCodes)
		admin.GET("/qr", ListQRCodes)
		admin.GET("/qr/batches", ListQRBatches)
		admin.POST("/qr/print", PrintQRLabels)
		admin.GET("/qr/:assetId/pdf", DownloadSingleQRPDF)
		admin.PATCH("/qr/:assetId/status", UpdateQRStatus)
		admin.DELETE("/qr/:assetId", DeleteQRCode)

		// Mapping
		admin.POST("/qr/:assetId/map", MapQRToDevice)
		admin.DELETE("/qr/:assetId/map", UnmapQR)

		// Devices
		admin.PUT("/devices/:id", UpdateDevice)
		admin.DELETE("/devices/:id", DeleteDevice)

		// Media
		admin.POST("/devices/:id/media", UploadDeviceMedia)
		admin.DELETE("/media/:mediaId", DeleteMedia)
		admin.PATCH("/media/:mediaId/primary", SetPrimaryImage)

		// Service history
		admin.POST("/devices/:id/service", AddServiceRecord)
		admin.DELETE("/devices/:id/service/:recordId", DeleteServiceRecord)

		// Queries
		admin.PATCH("/queries/:id/status", UpdateQueryStatus)

		// Users
		admin.GET("/users", ListUsers)
		admin.POST("/users", CreateUser)
		admin.GET("/users/:id", GetUser)
		admin.PUT("/users/:id", UpdateUser)
		admin.DELETE("/users/:id", DeleteUser)

		// Audit & scans
		admin.GET("/audit", ListAuditLogs)
		admin.GET("/audit/actions", AuditActions)
		admin.GET("/scans", ListScans)

		// Reports
		admin.GET("/reports/:type", ExportReport)

		// Settings
		admin.POST("/settings/test-email", middleware.RateLimit(0.1, 3), TestEmail)
	}

	// Catch-all 404 in the API namespace returns JSON, not Gin's HTML.
	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Endpoint not found"})
	})
}
