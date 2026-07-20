package models

import (
	"time"

	"gorm.io/gorm"
)

// ─── Enumerations ─────────────────────────────────────────────────────────

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleUser   Role = "user"
	RoleClient Role = "client"
)

type QRStatus string

const (
	QRAvailable QRStatus = "available"
	QRMapped    QRStatus = "mapped"
	QRInactive  QRStatus = "inactive"
	QRLost      QRStatus = "lost"
	QRReplaced  QRStatus = "replaced"
)

type DeviceStatus string

const (
	DeviceActive      DeviceStatus = "active"
	DeviceMaintenance DeviceStatus = "maintenance"
	DeviceRetired     DeviceStatus = "retired"
	DeviceStored      DeviceStatus = "in_storage"
	DeviceFaulty      DeviceStatus = "faulty"
)

type QueryStatus string

const (
	QueryOpen       QueryStatus = "open"
	QueryInProgress QueryStatus = "in_progress"
	QueryClosed     QueryStatus = "closed"
	QueryRejected   QueryStatus = "rejected"
)

type Priority string

const (
	PriorityLow    Priority = "low"
	PriorityMedium Priority = "medium"
	PriorityHigh   Priority = "high"
)

type MediaType string

const (
	MediaImage  MediaType = "image"
	MediaVideo  MediaType = "video"
	MediaManual MediaType = "manual"
)

// ─── User ─────────────────────────────────────────────────────────────────

type User struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Name         string         `gorm:"size:120;not null" json:"name"`
	Email        string         `gorm:"size:160;uniqueIndex;not null" json:"email"`
	PasswordHash string         `gorm:"size:255;not null" json:"-"`
	AuthVersion  uint           `gorm:"not null;default:1" json:"-"`
	Role         Role           `gorm:"size:20;not null;default:user;index" json:"role"`
	EmployeeID   string         `gorm:"size:60;index" json:"employee_id"`
	Department   string         `gorm:"size:120" json:"department"`
	Company      string         `gorm:"size:120" json:"company"`
	Phone        string         `gorm:"size:40" json:"phone"`
	Location     string         `gorm:"size:160" json:"location"`
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	LastLoginAt  *time.Time     `json:"last_login_at"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// ─── QR Code ──────────────────────────────────────────────────────────────

type QRCode struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	AssetID   string         `gorm:"size:40;uniqueIndex;not null" json:"asset_id"` // DMS000001
	URL       string         `gorm:"size:400;not null" json:"url"`
	Status    QRStatus       `gorm:"size:20;not null;default:available;index" json:"status"`
	BatchID   string         `gorm:"size:60;index" json:"batch_id"`
	Notes     string         `gorm:"size:400" json:"notes"`
	ScanCount int            `gorm:"default:0" json:"scan_count"`
	MappedAt  *time.Time     `json:"mapped_at"`
	CreatedBy uint           `json:"created_by"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Device *Device `gorm:"foreignKey:QRCodeID" json:"device,omitempty"`
}

// ─── Device ───────────────────────────────────────────────────────────────

type Device struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	QRCodeID uint `gorm:"uniqueIndex;not null" json:"qr_code_id"`

	DeviceNumber string `gorm:"size:80;uniqueIndex;not null" json:"device_number"`
	DeviceName   string `gorm:"size:160;not null;index" json:"device_name"`
	Category     string `gorm:"size:80;index" json:"category"`
	Brand        string `gorm:"size:80;index" json:"brand"`
	Model        string `gorm:"size:120" json:"model"`
	SerialNumber string `gorm:"size:120;index" json:"serial_number"`

	PurchaseDate   *time.Time `json:"purchase_date"`
	WarrantyExpiry *time.Time `gorm:"index" json:"warranty_expiry"`

	Department       string `gorm:"size:120;index" json:"department"`
	Company          string `gorm:"size:120;index" json:"company"`
	Project          string `gorm:"size:120;index" json:"project"`
	AssignedEmployee string `gorm:"size:160;index" json:"assigned_employee"`
	Location         string `gorm:"size:200;index" json:"location"`
	Vendor           string `gorm:"size:160" json:"vendor"`

	Status    DeviceStatus `gorm:"size:30;not null;default:active;index" json:"status"`
	Condition string       `gorm:"size:40;default:good" json:"condition"`

	// Public product-page content, all optional. Stored as JSON text like
	// Specifications so the shape can evolve without a migration.
	Headline       string `gorm:"size:250" json:"headline"`        // one-line tagline under the name
	Description    string `gorm:"type:text" json:"description"`    // the intro / about paragraph
	Specifications string `gorm:"type:text" json:"specifications"` // [{"key":"RAM","value":"16GB"}]
	Features       string `gorm:"type:text" json:"features"`       // ["Feature one","Feature two"]
	UsageSteps     string `gorm:"type:text" json:"usage_steps"`    // [{"title":"Power on","detail":"..."}]

	CreatedBy uint           `json:"created_by"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	QRCode         *QRCode         `gorm:"foreignKey:QRCodeID" json:"qr_code,omitempty"`
	Media          []Media         `gorm:"foreignKey:DeviceID" json:"media,omitempty"`
	ServiceHistory []ServiceRecord `gorm:"foreignKey:DeviceID" json:"service_history,omitempty"`
	FAQs           []FAQ           `gorm:"foreignKey:DeviceID" json:"faqs,omitempty"`
}

// ─── Media ────────────────────────────────────────────────────────────────

type Media struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	DeviceID   uint      `gorm:"index;not null" json:"device_id"`
	Type       MediaType `gorm:"size:20;not null;index" json:"type"`
	FileName   string    `gorm:"size:255;not null" json:"file_name"`
	FilePath   string    `gorm:"size:400;not null" json:"file_path"`
	URL        string    `gorm:"size:400" json:"url"`
	MimeType   string    `gorm:"size:120" json:"mime_type"`
	SizeBytes  int64     `json:"size_bytes"`
	IsPrimary  bool      `gorm:"default:false" json:"is_primary"`
	UploadedBy uint      `json:"uploaded_by"`
	CreatedAt  time.Time `json:"created_at"`
}

// ─── FAQ ──────────────────────────────────────────────────────────────────
// Questions and answers attached to a device. Anyone scanning the QR can read
// them; only an admin can write them. An FAQ can be authored from scratch or
// promoted from a resolved query, which is where most of them come from.

type FAQ struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	DeviceID uint `gorm:"index;not null" json:"device_id"`

	Question string `gorm:"size:400;not null" json:"question"`
	Answer   string `gorm:"type:text;not null" json:"answer"`

	// Set when this entry was promoted from a ticket, so the origin stays
	// traceable and the same ticket cannot be promoted twice.
	SourceQueryID *uint  `gorm:"uniqueIndex" json:"source_query_id"`
	SourceTicket  string `gorm:"size:40" json:"source_ticket"`

	SortOrder int `gorm:"default:0;index" json:"sort_order"`

	// No `default:` tag here on purpose. GORM omits a zero-valued field from
	// the INSERT when the column has a default, so `false` would silently be
	// written as the default `true` and a draft could never be saved. The
	// handler always sets this explicitly instead.
	IsPublished bool `gorm:"index" json:"is_published"`

	ViewCount int `gorm:"default:0" json:"view_count"`

	CreatedBy     uint           `json:"created_by"`
	CreatedByName string         `gorm:"size:120" json:"created_by_name"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`

	Device *Device `gorm:"foreignKey:DeviceID" json:"device,omitempty"`
}

// ─── Service history ──────────────────────────────────────────────────────

type ServiceRecord struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DeviceID    uint      `gorm:"index;not null" json:"device_id"`
	ServiceDate time.Time `json:"service_date"`
	Title       string    `gorm:"size:200" json:"title"`
	Description string    `gorm:"type:text" json:"description"`
	PerformedBy string    `gorm:"size:160" json:"performed_by"`
	Cost        float64   `json:"cost"`
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// ─── Query / Ticket ───────────────────────────────────────────────────────
// Device + user fields are snapshotted at submit time so the ticket stays
// accurate even if the device is later re-assigned or edited.

type Query struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	TicketNumber string `gorm:"size:40;uniqueIndex;not null" json:"ticket_number"`

	DeviceID uint `gorm:"index" json:"device_id"`
	UserID   uint `gorm:"index" json:"user_id"`

	Title       string      `gorm:"size:250;not null" json:"title"`
	Description string      `gorm:"type:text;not null" json:"description"`
	Priority    Priority    `gorm:"size:20;not null;default:medium;index" json:"priority"`
	Status      QueryStatus `gorm:"size:20;not null;default:open;index" json:"status"`

	AttachmentPath string `gorm:"size:400" json:"attachment_path"`
	AttachmentURL  string `gorm:"size:400" json:"attachment_url"`

	// Snapshot — device
	DeviceNumber     string `gorm:"size:80" json:"device_number"`
	QRNumber         string `gorm:"size:40" json:"qr_number"`
	DeviceName       string `gorm:"size:160" json:"device_name"`
	Brand            string `gorm:"size:80" json:"brand"`
	Model            string `gorm:"size:120" json:"model"`
	SerialNumber     string `gorm:"size:120" json:"serial_number"`
	AssignedEmployee string `gorm:"size:160" json:"assigned_employee"`
	Department       string `gorm:"size:120" json:"department"`
	Company          string `gorm:"size:120" json:"company"`
	Project          string `gorm:"size:120" json:"project"`
	Location         string `gorm:"size:200" json:"location"`

	// Snapshot — reporter
	ReportedByName  string `gorm:"size:120" json:"reported_by_name"`
	ReportedByEmpID string `gorm:"size:60" json:"reported_by_emp_id"`
	ReportedByEmail string `gorm:"size:160" json:"reported_by_email"`

	AdminRemarks string     `gorm:"type:text" json:"admin_remarks"`
	ResolvedAt   *time.Time `json:"resolved_at"`
	CreatedAt    time.Time  `gorm:"index" json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	Device *Device `gorm:"foreignKey:DeviceID" json:"device,omitempty"`
	User   *User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// ─── Scan log ─────────────────────────────────────────────────────────────

type Scan struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	QRCodeID  uint      `gorm:"index" json:"qr_code_id"`
	AssetID   string    `gorm:"size:40;index" json:"asset_id"`
	UserID    *uint     `gorm:"index" json:"user_id"`
	WasMapped bool      `json:"was_mapped"`
	IPAddress string    `gorm:"size:60" json:"ip_address"`
	UserAgent string    `gorm:"size:400" json:"user_agent"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}

// ─── Audit log ────────────────────────────────────────────────────────────

type AuditLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     *uint     `gorm:"index" json:"user_id"`
	UserName   string    `gorm:"size:120" json:"user_name"`
	UserRole   string    `gorm:"size:20" json:"user_role"`
	Action     string    `gorm:"size:60;index" json:"action"`
	EntityType string    `gorm:"size:40;index" json:"entity_type"`
	EntityID   string    `gorm:"size:60" json:"entity_id"`
	Details    string    `gorm:"type:text" json:"details"`
	IPAddress  string    `gorm:"size:60" json:"ip_address"`
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}

// Audit action constants.
const (
	ActionQRGenerated     = "QR_GENERATED"
	ActionQRMapped        = "QR_MAPPED"
	ActionQRUnmapped      = "QR_UNMAPPED"
	ActionQRStatus        = "QR_STATUS_CHANGED"
	ActionQRScanned       = "QR_SCANNED"
	ActionDeviceCreated   = "DEVICE_CREATED"
	ActionDeviceUpdated   = "DEVICE_UPDATED"
	ActionDeviceDeleted   = "DEVICE_DELETED"
	ActionMediaUploaded   = "MEDIA_UPLOADED"
	ActionMediaDeleted    = "MEDIA_DELETED"
	ActionUserLogin       = "USER_LOGIN"
	ActionUserCreated     = "USER_CREATED"
	ActionUserUpdated     = "USER_UPDATED"
	ActionUserDeleted     = "USER_DELETED"
	ActionQuerySubmit     = "QUERY_SUBMITTED"
	ActionQueryStatus     = "QUERY_STATUS_CHANGED"
	ActionReportExport    = "REPORT_EXPORTED"
	ActionFAQCreated      = "FAQ_CREATED"
	ActionFAQUpdated      = "FAQ_UPDATED"
	ActionFAQDeleted      = "FAQ_DELETED"
	ActionCredsSent       = "CREDENTIALS_EMAILED"
	ActionPwResetAsked    = "PASSWORD_RESET_REQUESTED"
	ActionPwResetDone     = "PASSWORD_RESET_COMPLETED"
	ActionEmailCodeSent   = "EMAIL_LOGIN_CODE_SENT"
	ActionEmailCodeUsed   = "EMAIL_LOGIN_CODE_USED"
	ActionCategoryAdded   = "PRODUCT_CATEGORY_ADDED"
	ActionCategoryUpdated = "PRODUCT_CATEGORY_UPDATED"
	ActionCategoryDeleted = "PRODUCT_CATEGORY_DELETED"
)

// PasswordReset backs the "forgot password" flow.
//
// Only a HASH of the token is stored. The raw token exists in one place — the
// email — so a leaked database still cannot be used to seize an account.
type PasswordReset struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"index;not null" json:"user_id"`
	TokenHash string     `gorm:"size:64;uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time  `gorm:"index;not null" json:"expires_at"`
	UsedAt    *time.Time `json:"used_at"`
	IPAddress string     `gorm:"size:60" json:"ip_address"`
	CreatedAt time.Time  `json:"created_at"`

	User *User `gorm:"foreignKey:UserID" json:"-"`
}

// EmailLoginCode backs passwordless access for QR visitors who need to raise
// a query. Codes are short-lived, single-use, and stored only as bcrypt hashes.
type EmailLoginCode struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	Email     string     `gorm:"size:160;index;not null" json:"email"`
	CodeHash  string     `gorm:"size:255;not null" json:"-"`
	ExpiresAt time.Time  `gorm:"index;not null" json:"expires_at"`
	UsedAt    *time.Time `json:"used_at"`
	Attempts  int        `gorm:"not null;default:0" json:"-"`
	IPAddress string     `gorm:"size:60" json:"-"`
	CreatedAt time.Time  `json:"created_at"`
}

// Counter backs atomic sequence generation for asset IDs and ticket numbers.
type Counter struct {
	Name  string `gorm:"primaryKey;size:40"`
	Value int64  `gorm:"not null;default:0"`
}

// ─── Product categories ───────────────────────────────────────────────────
// Defines the hardware product lines the "Products" bulk-generation workflow
// can create devices for. ProductPrefix/DevicePrefix drive the auto-numbered
// IDs (FMS0001, PW0001, DualDoor-528, ...) and back Counter rows keyed by
// the lowercased prefix — once a category has generated devices, its prefix
// must not change or the counter sequence forks.
type ProductCategory struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Name          string    `gorm:"size:80;uniqueIndex;not null" json:"name"`
	ProductPrefix string    `gorm:"size:20;uniqueIndex;not null" json:"product_prefix"`
	DevicePrefix  string    `gorm:"size:20;not null" json:"device_prefix"`
	ProductStart  int64     `gorm:"not null;default:1" json:"product_start"`
	DeviceStart   int64     `gorm:"not null;default:1" json:"device_start"`
	CreatedBy     uint      `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
}
