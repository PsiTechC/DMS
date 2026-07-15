package config

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds every tunable the server reads at boot.
type Config struct {
	Port          string
	AppEnv        string
	PublicBaseURL string
	CORSOrigins   []string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	JWTSecret      string
	JWTExpiryHours int

	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
	SMTPFromName string
	AdminEmail   string
	EmailEnabled bool

	WhatsAppEnabled     bool
	WhatsAppAPIURL      string
	WhatsAppToken       string
	WhatsAppPhoneID     string
	WhatsAppAdminNumber string

	UploadDir   string
	MaxUploadMB int64

	SeedAdminEmail    string
	SeedAdminPassword string
}

var C *Config

// Load reads .env (if present) then the process environment.
func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("config: no .env file found, using environment variables")
	}

	C = &Config{
		Port:          get("PORT", "8080"),
		AppEnv:        get("APP_ENV", "development"),
		PublicBaseURL: get("PUBLIC_BASE_URL", "http://localhost:5173"),
		CORSOrigins:   splitCSV(get("CORS_ORIGINS", "http://localhost:5173")),

		DBHost:     get("DB_HOST", "localhost"),
		DBPort:     get("DB_PORT", "5432"),
		DBUser:     get("DB_USER", "postgres"),
		DBPassword: get("DB_PASSWORD", ""),
		DBName:     get("DB_NAME", "dms"),
		DBSSLMode:  get("DB_SSLMODE", "disable"),

		JWTSecret:      get("JWT_SECRET", "insecure-dev-secret-change-me"),
		JWTExpiryHours: getInt("JWT_EXPIRY_HOURS", 12),

		SMTPHost:     get("SMTP_HOST", ""),
		SMTPPort:     getInt("SMTP_PORT", 587),
		SMTPUsername: get("SMTP_USERNAME", ""),
		SMTPPassword: get("SMTP_PASSWORD", ""),
		SMTPFrom:     get("SMTP_FROM", ""),
		SMTPFromName: get("SMTP_FROM_NAME", "DMS Notifications"),
		AdminEmail:   get("ADMIN_EMAIL", ""),
		EmailEnabled: getBool("EMAIL_ENABLED", false),

		WhatsAppEnabled:     getBool("WHATSAPP_ENABLED", false),
		WhatsAppAPIURL:      get("WHATSAPP_API_URL", ""),
		WhatsAppToken:       get("WHATSAPP_TOKEN", ""),
		WhatsAppPhoneID:     get("WHATSAPP_PHONE_ID", ""),
		WhatsAppAdminNumber: get("WHATSAPP_ADMIN_NUMBER", ""),

		UploadDir:   get("UPLOAD_DIR", "./uploads"),
		MaxUploadMB: int64(getInt("MAX_UPLOAD_MB", 100)),

		SeedAdminEmail:    get("SEED_ADMIN_EMAIL", "admin@dms.local"),
		SeedAdminPassword: get("SEED_ADMIN_PASSWORD", "Admin@123"),
	}

	if C.SMTPFrom == "" {
		C.SMTPFrom = C.SMTPUsername
	}
	return C
}

func get(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if v, err := strconv.Atoi(get(key, "")); err == nil {
		return v
	}
	return fallback
}

func getBool(key string, fallback bool) bool {
	if v, err := strconv.ParseBool(get(key, "")); err == nil {
		return v
	}
	return fallback
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
