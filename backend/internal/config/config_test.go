package config

import "testing"

func validProductionConfig() Config {
	return Config{
		Port:             "8090",
		AppEnv:           "production",
		PublicBaseURL:    "https://dms.acme.test",
		CORSOrigins:      []string{"https://dms.acme.test"},
		DBHost:           "db.internal",
		DBPort:           "5432",
		DBUser:           "dms_app",
		DBPassword:       "a-real-database-password",
		DBName:           "dms",
		DBSSLMode:        "verify-full",
		JWTSecret:        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		JWTExpiryHours:   12,
		SMTPPort:         587,
		UploadDir:        "/var/lib/dms/uploads",
		MaxUploadMB:      100,
		SeedAdminEnabled: false,
		SeedDemoAccounts: false,
	}
}

func TestProductionConfigAcceptsSecureValues(t *testing.T) {
	cfg := validProductionConfig()
	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected valid production configuration: %v", err)
	}
}

func TestProductionConfigRejectsUnsafeValues(t *testing.T) {
	tests := map[string]func(*Config){
		"local public URL":              func(c *Config) { c.PublicBaseURL = "http://localhost:5180" },
		"local CORS origin":             func(c *Config) { c.CORSOrigins = []string{"http://localhost:5180"} },
		"database superuser":            func(c *Config) { c.DBUser = "postgres" },
		"database TLS disabled":         func(c *Config) { c.DBSSLMode = "disable" },
		"demo accounts enabled":         func(c *Config) { c.SeedDemoAccounts = true },
		"placeholder database password": func(c *Config) { c.DBPassword = "CHANGE_ME" },
		"placeholder JWT secret":        func(c *Config) { c.JWTSecret = "CHANGE_ME_WITH_AT_LEAST_32_RANDOM_CHARACTERS" },
		"zero JWT lifetime":             func(c *Config) { c.JWTExpiryHours = 0 },
		"excessive JWT lifetime":        func(c *Config) { c.JWTExpiryHours = 24 * 365 },
		"invalid SMTP port":             func(c *Config) { c.SMTPPort = 70000 },
	}

	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			cfg := validProductionConfig()
			mutate(&cfg)
			if err := cfg.Validate(); err == nil {
				t.Fatal("expected unsafe production configuration to be rejected")
			}
		})
	}
}
