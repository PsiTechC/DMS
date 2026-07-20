package config

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds every tunable the server reads at boot.
type Config struct {
	Port           string
	AppEnv         string
	PublicBaseURL  string
	CORSOrigins    []string
	TrustedProxies []string

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
	SeedAdminEnabled  bool
	SeedDemoAccounts  bool
}

var C *Config

// Load reads .env (if present) then the process environment.
func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("config: no .env file found, using environment variables")
	}

	appEnv := strings.ToLower(get("APP_ENV", "development"))

	C = &Config{
		Port:           get("PORT", "8080"),
		AppEnv:         appEnv,
		PublicBaseURL:  get("PUBLIC_BASE_URL", "http://localhost:5173"),
		CORSOrigins:    splitCSV(get("CORS_ORIGINS", "http://localhost:5173")),
		TrustedProxies: splitCSV(get("TRUSTED_PROXIES", "")),

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
		SeedAdminEnabled:  getBool("SEED_ADMIN_ENABLED", appEnv != "production"),
		SeedDemoAccounts:  getBool("SEED_DEMO_ACCOUNTS", appEnv != "production"),
	}

	if C.SMTPFrom == "" {
		C.SMTPFrom = C.SMTPUsername
	}
	return C
}

// Validate rejects unsafe or incomplete configuration before the server opens
// a database connection. Development keeps convenient local defaults;
// production fails closed instead of silently running with them.
func (c *Config) Validate() error {
	if c.AppEnv != "development" && c.AppEnv != "test" && c.AppEnv != "production" {
		return fmt.Errorf("APP_ENV must be development, test, or production")
	}
	if c.Port == "" || c.DBHost == "" || c.DBName == "" || c.DBUser == "" {
		return fmt.Errorf("PORT, DB_HOST, DB_NAME, and DB_USER are required")
	}
	if c.DBPassword == "" || strings.Contains(strings.ToUpper(c.DBPassword), "CHANGE_ME") {
		return fmt.Errorf("DB_PASSWORD is required and cannot be a placeholder")
	}
	if len(c.JWTSecret) < 32 || c.JWTSecret == "insecure-dev-secret-change-me" || strings.Contains(strings.ToUpper(c.JWTSecret), "CHANGE_ME") {
		return fmt.Errorf("JWT_SECRET must be a unique value of at least 32 characters")
	}
	if c.JWTExpiryHours < 1 || c.JWTExpiryHours > 168 {
		return fmt.Errorf("JWT_EXPIRY_HOURS must be between 1 and 168")
	}
	if c.SMTPPort < 1 || c.SMTPPort > 65535 {
		return fmt.Errorf("SMTP_PORT must be between 1 and 65535")
	}
	if c.MaxUploadMB < 1 || c.MaxUploadMB > 500 {
		return fmt.Errorf("MAX_UPLOAD_MB must be between 1 and 500")
	}
	if c.EmailEnabled && (c.SMTPHost == "" || c.SMTPUsername == "" || c.SMTPPassword == "" || c.AdminEmail == "") {
		return fmt.Errorf("EMAIL_ENABLED requires SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, and ADMIN_EMAIL")
	}

	publicURL, err := url.Parse(c.PublicBaseURL)
	if err != nil || publicURL.Host == "" || (publicURL.Scheme != "http" && publicURL.Scheme != "https") {
		return fmt.Errorf("PUBLIC_BASE_URL must be an absolute http(s) URL")
	}
	for _, origin := range c.CORSOrigins {
		u, err := url.Parse(origin)
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
			return fmt.Errorf("invalid CORS_ORIGINS entry %q", origin)
		}
	}

	if c.AppEnv == "production" {
		if publicURL.Scheme != "https" || isLocalHost(publicURL.Hostname()) || strings.HasSuffix(publicURL.Hostname(), ".example.com") {
			return fmt.Errorf("production PUBLIC_BASE_URL must use HTTPS and a non-local hostname")
		}
		if len(c.CORSOrigins) == 0 {
			return fmt.Errorf("production CORS_ORIGINS must contain at least one HTTPS origin")
		}
		for _, origin := range c.CORSOrigins {
			u, _ := url.Parse(origin)
			if u.Scheme != "https" || isLocalHost(u.Hostname()) || strings.HasSuffix(u.Hostname(), ".example.com") {
				return fmt.Errorf("production CORS origin %q must use HTTPS and a non-local hostname", origin)
			}
		}
		if strings.EqualFold(c.DBUser, "postgres") {
			return fmt.Errorf("production DB_USER must be a dedicated non-superuser account")
		}
		if c.DBSSLMode == "" || strings.EqualFold(c.DBSSLMode, "disable") {
			return fmt.Errorf("production DB_SSLMODE must require or verify TLS")
		}
		if c.SeedDemoAccounts {
			return fmt.Errorf("SEED_DEMO_ACCOUNTS must be false in production")
		}
		if c.SeedAdminEnabled && (c.SeedAdminEmail == "admin@dms.local" || strings.HasSuffix(c.SeedAdminEmail, "@example.com") || c.SeedAdminPassword == "Admin@123" || len(c.SeedAdminPassword) < 12 || strings.Contains(strings.ToUpper(c.SeedAdminPassword), "CHANGE_ME")) {
			return fmt.Errorf("production admin seeding requires a real email and a unique password of at least 12 characters")
		}
	}

	return nil
}

func isLocalHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
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
