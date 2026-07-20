package handlers

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dms/backend/internal/models"

	"github.com/gin-gonic/gin"
)

func validDeviceForm() deviceForm {
	return deviceForm{
		DeviceNumber:     "DEV-001",
		DeviceName:       "Laptop",
		AssignedEmployee: "Test User",
		Location:         "Test Lab",
		Status:           models.DeviceActive,
		Condition:        "good",
		Specifications:   `[{"key":"RAM","value":"16 GB"}]`,
		Features:         `[{"title":"Portable","detail":"Easy to carry"}]`,
		UsageSteps:       `[{"title":"Power on","detail":"Press the power button"}]`,
	}
}

func TestDeviceFormRequiresCompleteProductContent(t *testing.T) {
	tests := map[string]func(*deviceForm){
		"missing specification":    func(f *deviceForm) { f.Specifications = `[]` },
		"blank specification":      func(f *deviceForm) { f.Specifications = `[{"key":" ","value":""}]` },
		"missing feature":          func(f *deviceForm) { f.Features = "" },
		"blank feature":            func(f *deviceForm) { f.Features = `[{"title":" ","detail":""}]` },
		"usage step without title": func(f *deviceForm) { f.UsageSteps = `[{"title":"","detail":"Press power"}]` },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			form := validDeviceForm()
			mutate(&form)
			if err := form.validate(); err == nil {
				t.Fatal("expected mandatory product content to be rejected")
			}
		})
	}
}

func TestDeviceFormAllowsSingleTextSpecification(t *testing.T) {
	form := validDeviceForm()
	form.Specifications = `[{"key":"16GB to 32GB unified memory","value":""}]`
	if err := form.validate(); err != nil {
		t.Fatalf("expected a single-text specification to be accepted: %v", err)
	}
}

func TestDeviceFormAllowsFeatureTitleOrDescription(t *testing.T) {
	for _, value := range []string{
		`[{"title":"Fast performance","detail":""}]`,
		`[{"title":"","detail":"Up to 9.5x faster"}]`,
	} {
		form := validDeviceForm()
		form.Features = value
		if err := form.validate(); err != nil {
			t.Fatalf("expected flexible feature %s to be accepted: %v", value, err)
		}
	}
}

func TestDeviceFormAllowsMissingUsageSteps(t *testing.T) {
	for _, value := range []string{"", "[]"} {
		form := validDeviceForm()
		form.UsageSteps = value
		if err := form.validate(); err != nil {
			t.Fatalf("expected optional usage steps %q to be accepted: %v", value, err)
		}
	}
}

func TestDeviceFormRejectsWhitespaceRequiredFields(t *testing.T) {
	tests := map[string]func(*deviceForm){
		"device number":     func(f *deviceForm) { f.DeviceNumber = "   " },
		"device name":       func(f *deviceForm) { f.DeviceName = "\t\n" },
		"assigned employee": func(f *deviceForm) { f.AssignedEmployee = "   " },
		"location":          func(f *deviceForm) { f.Location = "   " },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			form := validDeviceForm()
			mutate(&form)
			if err := form.validate(); err == nil {
				t.Fatal("expected whitespace-only required field to be rejected")
			}
		})
	}
}

func TestDeviceFormRejectsInvalidDatesAndEnums(t *testing.T) {
	tests := map[string]func(*deviceForm){
		"invalid purchase date": func(f *deviceForm) { f.PurchaseDate = "not-a-date" },
		"invalid warranty date": func(f *deviceForm) { f.WarrantyExpiry = "31/12/2026" },
		"warranty before purchase": func(f *deviceForm) {
			f.PurchaseDate = "2026-06-10"
			f.WarrantyExpiry = "2026-06-09"
		},
		"invalid status":    func(f *deviceForm) { f.Status = models.DeviceStatus("destroyed") },
		"invalid condition": func(f *deviceForm) { f.Condition = "perfect-ish" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			form := validDeviceForm()
			mutate(&form)
			if err := form.validate(); err == nil {
				t.Fatal("expected invalid device data to be rejected")
			}
		})
	}
}

func TestReadQueryFormRejectsTitleBeyondDatabaseLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	body := `{"device_id":1,"title":"` + strings.Repeat("x", 251) + `","description":"valid issue description","priority":"medium"}`
	req := httptest.NewRequest("POST", "/api/queries", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req

	if _, err := readQueryForm(c); err == nil {
		t.Fatal("expected a title longer than the Query.title column to be rejected")
	}
}

func TestFAQFormRejectsQuestionBeyondDatabaseLimit(t *testing.T) {
	form := faqForm{Question: strings.Repeat("q", 401), Answer: "valid answer"}
	if err := form.validate(); err == nil {
		t.Fatal("expected a question longer than the FAQ.question column to be rejected")
	}
}

func TestServiceFormRejectsInvalidData(t *testing.T) {
	tests := map[string]serviceForm{
		"whitespace title": {Title: "   "},
		"invalid date":     {Title: "Repair", ServiceDate: "tomorrow"},
		"negative cost":    {Title: "Repair", Cost: -1},
		"non-finite cost":  {Title: "Repair", Cost: math.Inf(1)},
		"oversized title":  {Title: strings.Repeat("x", 201)},
	}
	for name, form := range tests {
		t.Run(name, func(t *testing.T) {
			if err := form.validate(); err == nil {
				t.Fatal("expected invalid service record to be rejected")
			}
		})
	}
}

func TestCreateUserRequestRejectsWhitespaceAndBcryptOverflow(t *testing.T) {
	base := createUserRequest{Name: "Test User", Email: "test@example.test", Password: "password123", Role: models.RoleUser}
	tests := map[string]func(*createUserRequest){
		"whitespace name": func(r *createUserRequest) { r.Name = "   " },
		"password beyond bcrypt limit": func(r *createUserRequest) {
			r.Password = strings.Repeat("x", 73)
		},
		"oversized email": func(r *createUserRequest) { r.Email = strings.Repeat("a", 150) + "@example.test" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			req := base
			mutate(&req)
			if err := req.validate(); err == nil {
				t.Fatal("expected invalid user request to be rejected")
			}
		})
	}
}

func TestQRHandlersRejectUnsafeInputBeforeDatabaseAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name    string
		method  string
		target  string
		body    string
		handler gin.HandlerFunc
	}{
		{"oversized generation notes", http.MethodPost, "/api/qr/generate", `{"quantity":1,"notes":"` + strings.Repeat("n", 401) + `"}`, GenerateQRCodes},
		{"malformed print JSON", http.MethodPost, "/api/qr/print", `{`, PrintQRLabels},
		{"oversized public QR image", http.MethodGet, "/api/qr/DMS000001/image?size=999999", "", GetQRImage},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(tt.method, tt.target, strings.NewReader(tt.body))
			if tt.body != "" {
				c.Request.Header.Set("Content-Type", "application/json")
			}
			tt.handler(c)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 before database access, got %d: %s", recorder.Code, recorder.Body.String())
			}
			var payload map[string]interface{}
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("expected JSON error response: %v", err)
			}
			if payload["success"] != false || payload["message"] == "" {
				t.Fatalf("expected structured error response, got %#v", payload)
			}
		})
	}
}

func TestEmailCodeHandlersRejectMalformedInputBeforeDatabaseAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name    string
		body    string
		handler gin.HandlerFunc
	}{
		{"invalid email", `{"email":"not-an-email"}`, RequestEmailLoginCode},
		{"non-numeric code", `{"email":"person@example.test","code":"12AB56"}`, VerifyEmailLoginCode},
		{"short code", `{"email":"person@example.test","code":"12345"}`, VerifyEmailLoginCode},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/auth/email-code", strings.NewReader(tt.body))
			c.Request.Header.Set("Content-Type", "application/json")
			tt.handler(c)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 before database access, got %d: %s", recorder.Code, recorder.Body.String())
			}
		})
	}
}
