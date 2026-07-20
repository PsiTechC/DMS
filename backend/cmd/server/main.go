package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"dms/backend/internal/config"
	"dms/backend/internal/database"
	"dms/backend/internal/handlers"
	"dms/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[dms] ")

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("startup: invalid configuration: %v", err)
	}

	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	if err := database.Connect(cfg); err != nil {
		log.Fatalf("startup: %v\n\nIs PostgreSQL running, and does the '%s' database exist?\nCreate it with:  createdb -U %s %s",
			err, cfg.DBName, cfg.DBUser, cfg.DBName)
	}
	if err := database.Migrate(); err != nil {
		log.Fatalf("startup: %v", err)
	}
	if err := database.Seed(cfg); err != nil {
		log.Fatalf("startup: %v", err)
	}
	if err := database.SeedProductCategories(); err != nil {
		log.Fatalf("startup: %v", err)
	}

	// Make sure the upload tree exists before the static handler mounts it.
	for _, sub := range []string{"images", "videos", "manuals", "attachments"} {
		if err := os.MkdirAll(cfg.UploadDir+"/"+sub, 0o755); err != nil {
			log.Fatalf("startup: create upload dir: %v", err)
		}
	}

	r := gin.New()
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		log.Fatalf("startup: invalid TRUSTED_PROXIES: %v", err)
	}
	r.Use(gin.Logger())
	r.Use(middleware.Recovery())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORS(cfg))
	r.Use(middleware.RateLimit(20, 60)) // global ceiling per IP
	r.Use(middleware.BodyLimit(cfg.MaxUploadMB))

	r.MaxMultipartMemory = 16 << 20 // 16 MB buffered; larger uploads spill to disk

	handlers.RegisterRoutes(r, cfg)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       5 * time.Minute,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	go func() {
		log.Printf("server: listening on :%s", cfg.Port)
		log.Printf("server: QR codes will point at %s/device/{assetId}", cfg.PublicBaseURL)
		if cfg.EmailEnabled {
			log.Printf("server: query notifications will be emailed to %s", cfg.AdminEmail)
		} else {
			log.Printf("server: email is DISABLED (set EMAIL_ENABLED=true in .env to turn it on)")
		}
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	// Graceful shutdown so in-flight uploads/exports finish.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("server: shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("server: forced shutdown: %v", err)
	}
	log.Println("server: stopped")
}
