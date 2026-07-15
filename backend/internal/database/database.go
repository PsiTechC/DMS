package database

import (
	"fmt"
	"log"
	"time"

	"dms/backend/internal/config"
	"dms/backend/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Connect opens the pool and runs AutoMigrate + seed.
func Connect(cfg *config.Config) error {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=UTC",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBSSLMode,
	)

	logLevel := logger.Warn
	if cfg.AppEnv == "development" {
		logLevel = logger.Error // keep dev output readable; flip to Info to see SQL
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		return fmt.Errorf("open postgres: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("get sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("ping postgres: %w", err)
	}

	DB = db
	log.Println("database: connected to postgres")
	return nil
}

// Migrate creates/updates all tables.
func Migrate() error {
	if err := DB.AutoMigrate(
		&models.User{},
		&models.QRCode{},
		&models.Device{},
		&models.Media{},
		&models.ServiceRecord{},
		&models.Query{},
		&models.Scan{},
		&models.AuditLog{},
		&models.Counter{},
	); err != nil {
		return fmt.Errorf("automigrate: %w", err)
	}
	log.Println("database: migrations applied")
	return nil
}

// Seed creates the default admin plus demo user/client accounts on first run.
func Seed(cfg *config.Config) error {
	seeds := []struct {
		name, email, password string
		role                  models.Role
		empID, dept, company  string
		location              string
	}{
		{"System Administrator", cfg.SeedAdminEmail, cfg.SeedAdminPassword, models.RoleAdmin, "EMP-ADMIN", "IT", "PSI Tech", "Head Office"},
		{"Demo User", "user@dms.local", "User@123", models.RoleUser, "EMP-1001", "Operations", "PSI Tech", "Plant 1"},
		{"Demo Client", "client@dms.local", "Client@123", models.RoleClient, "EMP-2001", "External", "Client Corp", "Client Site"},
	}

	for _, s := range seeds {
		var count int64
		DB.Model(&models.User{}).Where("email = ?", s.email).Count(&count)
		if count > 0 {
			continue
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(s.password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash seed password: %w", err)
		}
		u := models.User{
			Name:         s.name,
			Email:        s.email,
			PasswordHash: string(hash),
			Role:         s.role,
			EmployeeID:   s.empID,
			Department:   s.dept,
			Company:      s.company,
			Location:     s.location,
			IsActive:     true,
		}
		if err := DB.Create(&u).Error; err != nil {
			return fmt.Errorf("create seed user %s: %w", s.email, err)
		}
		log.Printf("database: seeded %s account -> %s / %s", s.role, s.email, s.password)
	}
	return nil
}

// NextSequence atomically increments a named counter and returns the new value.
// Used for QR asset IDs and query ticket numbers so concurrent requests never
// collide on a duplicate number.
func NextSequence(tx *gorm.DB, name string, step int64) (int64, error) {
	if tx == nil {
		tx = DB
	}

	// Ensure the row exists without clobbering an existing value.
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).
		Create(&models.Counter{Name: name, Value: 0}).Error; err != nil {
		return 0, fmt.Errorf("init counter %s: %w", name, err)
	}

	var c models.Counter
	// UPDATE ... RETURNING keeps the read-modify-write in a single atomic statement.
	if err := tx.Raw(
		`UPDATE counters SET value = value + ? WHERE name = ? RETURNING name, value`,
		step, name,
	).Scan(&c).Error; err != nil {
		return 0, fmt.Errorf("increment counter %s: %w", name, err)
	}
	return c.Value, nil
}
