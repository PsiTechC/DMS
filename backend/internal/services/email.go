package services

import (
	"bytes"
	"fmt"
	"html/template"
	"log"
	"strings"

	"dms/backend/internal/config"
	"dms/backend/internal/models"

	"gopkg.in/gomail.v2"
)

// SendQueryEmail delivers the new-ticket notification to the admin inbox.
// It runs on its own goroutine from the handler, so it must never panic the
// caller — all failures are logged and returned.
func SendQueryEmail(q *models.Query) error {
	cfg := config.C

	if !cfg.EmailEnabled {
		log.Printf("email: disabled (EMAIL_ENABLED=false), skipping ticket %s", q.TicketNumber)
		return nil
	}
	if cfg.SMTPHost == "" || cfg.SMTPUsername == "" {
		return fmt.Errorf("email: SMTP not configured (set SMTP_HOST / SMTP_USERNAME in .env)")
	}
	if cfg.AdminEmail == "" {
		return fmt.Errorf("email: ADMIN_EMAIL not configured")
	}

	body, err := renderQueryEmail(q)
	if err != nil {
		return fmt.Errorf("email: render template: %w", err)
	}

	m := gomail.NewMessage()
	m.SetAddressHeader("From", cfg.SMTPFrom, cfg.SMTPFromName)
	m.SetHeader("To", cfg.AdminEmail)
	m.SetHeader("Subject", fmt.Sprintf("[%s] %s — %s (%s Priority)",
		q.TicketNumber, q.DeviceName, q.Title, titleCase(string(q.Priority))))
	m.SetBody("text/html", body)
	m.AddAlternative("text/plain", plainQueryEmail(q))

	// Reply-To the reporter so the admin can respond directly from their inbox.
	if q.ReportedByEmail != "" {
		m.SetAddressHeader("Reply-To", q.ReportedByEmail, q.ReportedByName)
	}
	if q.AttachmentPath != "" {
		m.Attach(q.AttachmentPath)
	}

	d := gomail.NewDialer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("email: send to %s: %w", cfg.AdminEmail, err)
	}

	log.Printf("email: ticket %s sent to %s", q.TicketNumber, cfg.AdminEmail)
	return nil
}

// SendQueryStatusEmail tells the reporter their ticket moved.
func SendQueryStatusEmail(q *models.Query, oldStatus models.QueryStatus) error {
	cfg := config.C
	if !cfg.EmailEnabled || q.ReportedByEmail == "" || cfg.SMTPHost == "" {
		return nil
	}

	body := fmt.Sprintf(`
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#1e40af;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:18px;">Ticket Status Updated</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
    <p>Hello %s,</p>
    <p>Your ticket <strong>%s</strong> for <strong>%s</strong> has been updated.</p>
    <p style="font-size:16px;">
      <span style="color:#6b7280;">%s</span>
      &nbsp;&rarr;&nbsp;
      <strong style="color:#1e40af;">%s</strong>
    </p>
    %s
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">
      This is an automated message from the Device Management System.
    </p>
  </div>
</div>`,
		template.HTMLEscapeString(q.ReportedByName),
		template.HTMLEscapeString(q.TicketNumber),
		template.HTMLEscapeString(q.DeviceName),
		humanStatus(oldStatus),
		humanStatus(q.Status),
		remarksBlock(q.AdminRemarks),
	)

	m := gomail.NewMessage()
	m.SetAddressHeader("From", cfg.SMTPFrom, cfg.SMTPFromName)
	m.SetHeader("To", q.ReportedByEmail)
	m.SetHeader("Subject", fmt.Sprintf("[%s] Status: %s", q.TicketNumber, humanStatus(q.Status)))
	m.SetBody("text/html", body)

	d := gomail.NewDialer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("email: status update to %s: %w", q.ReportedByEmail, err)
	}
	return nil
}

// TestSMTP verifies credentials by sending a probe email to the admin.
func TestSMTP(to string) error {
	cfg := config.C
	if cfg.SMTPHost == "" || cfg.SMTPUsername == "" {
		return fmt.Errorf("SMTP is not configured — fill SMTP_HOST and SMTP_USERNAME in backend/.env")
	}
	if to == "" {
		to = cfg.AdminEmail
	}
	if to == "" {
		return fmt.Errorf("no recipient — set ADMIN_EMAIL in backend/.env")
	}

	m := gomail.NewMessage()
	m.SetAddressHeader("From", cfg.SMTPFrom, cfg.SMTPFromName)
	m.SetHeader("To", to)
	m.SetHeader("Subject", "DMS — SMTP test successful")
	m.SetBody("text/html", `
<div style="font-family:Segoe UI,Arial,sans-serif;padding:24px;">
  <h2 style="color:#1e40af;">SMTP is working</h2>
  <p>Your Device Management System can send email. Query notifications will be delivered to this address.</p>
</div>`)

	d := gomail.NewDialer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword)
	return d.DialAndSend(m)
}

// ─── Template ─────────────────────────────────────────────────────────────

type emailRow struct {
	Label string
	Value string
}

type emailData struct {
	Q             *models.Query
	PriorityColor string
	PriorityLabel string
	DeviceRows    []emailRow
	ReporterRows  []emailRow
	SubmittedAt   string
}

func renderQueryEmail(q *models.Query) (string, error) {
	data := emailData{
		Q:             q,
		PriorityColor: priorityColor(q.Priority),
		PriorityLabel: strings.ToUpper(string(q.Priority)),
		SubmittedAt:   q.CreatedAt.Format("02 Jan 2006, 03:04 PM"),
		DeviceRows: []emailRow{
			{"Device Number", q.DeviceNumber},
			{"QR Number", q.QRNumber},
			{"Device Name", q.DeviceName},
			{"Brand", q.Brand},
			{"Model", q.Model},
			{"Serial Number", q.SerialNumber},
			{"Company", q.Company},
			{"Project", q.Project},
			{"Department", q.Department},
			{"Assigned Employee", q.AssignedEmployee},
			{"Location", q.Location},
		},
		ReporterRows: []emailRow{
			{"Reported By", q.ReportedByName},
			{"Employee ID", q.ReportedByEmpID},
			{"Email", q.ReportedByEmail},
			{"Submitted On", q.CreatedAt.Format("02 Jan 2006, 03:04 PM")},
		},
	}

	var buf bytes.Buffer
	if err := queryEmailTmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

var queryEmailTmpl = template.Must(template.New("query").Funcs(template.FuncMap{
	"dash": func(s string) string {
		if strings.TrimSpace(s) == "" {
			return "—"
		}
		return s
	},
}).Parse(`
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px 32px;color:#fff;">
    <div style="font-size:12px;letter-spacing:1.5px;opacity:.85;text-transform:uppercase;">Device Management System</div>
    <h1 style="margin:6px 0 0;font-size:22px;font-weight:600;">New Query Raised</h1>
    <div style="margin-top:14px;display:inline-block;background:rgba(255,255,255,.18);padding:6px 14px;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:.5px;">
      {{.Q.TicketNumber}}
    </div>
    <span style="display:inline-block;margin-left:8px;background:{{.PriorityColor}};padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;">
      {{.PriorityLabel}} PRIORITY
    </span>
  </div>

  <div style="padding:28px 32px;">

    <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:16px 18px;border-radius:0 6px 6px 0;margin-bottom:26px;">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Issue Title</div>
      <div style="font-size:17px;color:#0f172a;font-weight:600;margin-top:4px;">{{.Q.Title}}</div>
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-top:14px;">Description</div>
      <div style="font-size:14px;color:#334155;margin-top:4px;line-height:1.6;white-space:pre-wrap;">{{.Q.Description}}</div>
    </div>

    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">Device Details</div>
    <table style="width:100%;border-collapse:collapse;margin:12px 0 26px;">
      {{range .DeviceRows}}
      <tr>
        <td style="padding:9px 0;font-size:13px;color:#64748b;width:42%;border-bottom:1px solid #f1f5f9;">{{.Label}}</td>
        <td style="padding:9px 0;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">{{dash .Value}}</td>
      </tr>
      {{end}}
    </table>

    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">Reported By</div>
    <table style="width:100%;border-collapse:collapse;margin:12px 0 26px;">
      {{range .ReporterRows}}
      <tr>
        <td style="padding:9px 0;font-size:13px;color:#64748b;width:42%;border-bottom:1px solid #f1f5f9;">{{.Label}}</td>
        <td style="padding:9px 0;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">{{dash .Value}}</td>
      </tr>
      {{end}}
    </table>

    {{if .Q.AttachmentURL}}
    <div style="background:#fefce8;border:1px solid #fde047;padding:12px 16px;border-radius:6px;font-size:13px;color:#713f12;">
      An attachment was included with this query and is attached to this email.
    </div>
    {{end}}

  </div>

  <div style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center;">
    <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
      Automated notification from the Device Management System.<br/>
      Reply to this email to respond directly to {{.Q.ReportedByName}}.
    </div>
  </div>

</div>
</body>
</html>
`))

func plainQueryEmail(q *models.Query) string {
	var b strings.Builder
	fmt.Fprintf(&b, "NEW QUERY RAISED — %s\n", q.TicketNumber)
	fmt.Fprintf(&b, "Priority: %s\n\n", strings.ToUpper(string(q.Priority)))
	fmt.Fprintf(&b, "Issue: %s\n%s\n\n", q.Title, q.Description)
	fmt.Fprintf(&b, "-- Device --\n")
	fmt.Fprintf(&b, "Device Number: %s\nQR Number: %s\nDevice Name: %s\nBrand: %s\nModel: %s\nSerial: %s\n",
		q.DeviceNumber, q.QRNumber, q.DeviceName, q.Brand, q.Model, q.SerialNumber)
	fmt.Fprintf(&b, "Company: %s\nProject: %s\nDepartment: %s\nAssigned To: %s\nLocation: %s\n\n",
		q.Company, q.Project, q.Department, q.AssignedEmployee, q.Location)
	fmt.Fprintf(&b, "-- Reported By --\n")
	fmt.Fprintf(&b, "Name: %s\nEmployee ID: %s\nEmail: %s\nSubmitted: %s\n",
		q.ReportedByName, q.ReportedByEmpID, q.ReportedByEmail,
		q.CreatedAt.Format("02 Jan 2006, 03:04 PM"))
	return b.String()
}

func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func priorityColor(p models.Priority) string {
	switch p {
	case models.PriorityHigh:
		return "#dc2626"
	case models.PriorityMedium:
		return "#ea580c"
	default:
		return "#059669"
	}
}

func humanStatus(s models.QueryStatus) string {
	switch s {
	case models.QueryInProgress:
		return "In Progress"
	case models.QueryOpen:
		return "Open"
	case models.QueryClosed:
		return "Closed"
	case models.QueryRejected:
		return "Rejected"
	}
	return string(s)
}

func remarksBlock(remarks string) string {
	if strings.TrimSpace(remarks) == "" {
		return ""
	}
	return fmt.Sprintf(
		`<div style="background:#f8fafc;border-left:3px solid #cbd5e1;padding:12px 16px;margin-top:16px;">
       <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;">Admin Remarks</div>
       <div style="font-size:14px;color:#334155;margin-top:4px;">%s</div>
     </div>`,
		template.HTMLEscapeString(remarks))
}
