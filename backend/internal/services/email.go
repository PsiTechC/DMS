package services

import (
	"bytes"
	"fmt"
	"html/template"
	"log"
	"strings"
	"time"

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

// SendQueryStatusEmail tells the reporter their ticket moved, and copies the
// admin so the same update lands in both inboxes.
func SendQueryStatusEmail(q *models.Query, oldStatus models.QueryStatus) error {
	cfg := config.C
	if !cfg.EmailEnabled || cfg.SMTPHost == "" {
		return nil
	}

	// Build the recipient list, skipping blanks and de-duplicating in case the
	// reporter IS the admin — otherwise they'd get the same mail twice.
	seen := map[string]bool{}
	var to []string
	for _, addr := range []string{q.ReportedByEmail, cfg.AdminEmail} {
		addr = strings.TrimSpace(addr)
		if addr == "" || seen[strings.ToLower(addr)] {
			continue
		}
		seen[strings.ToLower(addr)] = true
		to = append(to, addr)
	}
	if len(to) == 0 {
		return nil
	}

	statusColor := map[models.QueryStatus]string{
		models.QueryOpen:       "#2563eb",
		models.QueryInProgress: "#ea580c",
		models.QueryClosed:     "#059669",
		models.QueryRejected:   "#dc2626",
	}[q.Status]
	if statusColor == "" {
		statusColor = "#1e40af"
	}

	body := fmt.Sprintf(`
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:24px 28px;border-radius:10px 10px 0 0;">
    <div style="font-size:11px;letter-spacing:1.5px;opacity:.8;text-transform:uppercase;">Device Management System</div>
    <h2 style="margin:6px 0 0;font-size:19px;">Ticket Status Updated</h2>
    <div style="margin-top:12px;display:inline-block;background:rgba(255,255,255,.18);padding:5px 12px;border-radius:5px;font-size:14px;font-weight:600;">%s</div>
  </div>

  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 28px;border-radius:0 0 10px 10px;">
    <p style="margin:0 0 14px;">Hello %s,</p>
    <p style="margin:0 0 18px;">Your ticket for <strong>%s</strong> (%s) has been updated.</p>

    <table style="width:100%%;border-collapse:collapse;margin-bottom:18px;">
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;border-radius:6px;">
          <span style="color:#94a3b8;font-size:14px;text-decoration:line-through;">%s</span>
          <span style="color:#94a3b8;margin:0 8px;">&rarr;</span>
          <span style="color:%s;font-size:15px;font-weight:700;">%s</span>
        </td>
      </tr>
    </table>

    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Issue</div>
    <div style="font-size:15px;color:#0f172a;font-weight:600;margin:3px 0 16px;">%s</div>
    %s
    <p style="color:#94a3b8;font-size:11px;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:14px;">
      Automated message from the Device Management System. Please do not reply to this address.
    </p>
  </div>
</div>`,
		template.HTMLEscapeString(q.TicketNumber),
		template.HTMLEscapeString(q.ReportedByName),
		template.HTMLEscapeString(q.DeviceName),
		template.HTMLEscapeString(q.DeviceNumber),
		humanStatus(oldStatus),
		statusColor,
		humanStatus(q.Status),
		template.HTMLEscapeString(q.Title),
		remarksBlock(q.AdminRemarks),
	)

	m := gomail.NewMessage()
	m.SetAddressHeader("From", cfg.SMTPFrom, cfg.SMTPFromName)
	m.SetHeader("To", to...)
	m.SetHeader("Subject", fmt.Sprintf("[%s] Status: %s — %s", q.TicketNumber, humanStatus(q.Status), q.DeviceName))
	m.SetBody("text/html", body)

	d := gomail.NewDialer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("email: status update to %s: %w", strings.Join(to, ", "), err)
	}

	log.Printf("email: status of %s (%s) sent to %s", q.TicketNumber, q.Status, strings.Join(to, ", "))
	return nil
}

// SendCredentialsEmail delivers a new account's login details to the user.
// The plain password exists only for the length of this call — it is never
// stored, and only ever reaches the address the admin typed.
func SendCredentialsEmail(u *models.User, plainPassword, loginURL string) error {
	cfg := config.C

	if !cfg.EmailEnabled {
		log.Printf("email: disabled, not sending credentials to %s", u.Email)
		return nil
	}
	if cfg.SMTPHost == "" || cfg.SMTPUsername == "" {
		return fmt.Errorf("email: SMTP not configured")
	}

	roleBlurb := map[models.Role]string{
		models.RoleAdmin:  "You have full access: QR generation, device mapping, user management, reports, and audit logs.",
		models.RoleUser:   "You can scan QR codes, view device details, and raise queries about any device.",
		models.RoleClient: "You have read-only access to device details, manuals, videos, and query status.",
	}[u.Role]

	body := fmt.Sprintf(`
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:28px;border-radius:10px 10px 0 0;">
    <div style="font-size:11px;letter-spacing:1.5px;opacity:.8;text-transform:uppercase;">Device Management System</div>
    <h2 style="margin:6px 0 0;font-size:21px;">Your account is ready</h2>
  </div>

  <div style="border:1px solid #e5e7eb;border-top:none;padding:26px 28px;border-radius:0 0 10px 10px;">
    <p style="margin:0 0 16px;">Hello %s,</p>
    <p style="margin:0 0 20px;">An account has been created for you on the Device Management System. %s</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:20px;">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:12px;">Your login details</div>

      <table style="width:100%%;border-collapse:collapse;">
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#64748b;width:34%%;">Username</td>
          <td style="padding:7px 0;font-size:14px;color:#0f172a;font-weight:600;font-family:Consolas,monospace;">%s</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#64748b;">Password</td>
          <td style="padding:7px 0;font-size:14px;color:#0f172a;font-weight:600;font-family:Consolas,monospace;letter-spacing:.5px;">%s</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#64748b;">Role</td>
          <td style="padding:7px 0;font-size:14px;color:#0f172a;font-weight:600;text-transform:capitalize;">%s</td>
        </tr>
        %s
      </table>
    </div>

    <div style="text-align:center;margin-bottom:20px;">
      <a href="%s" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 30px;border-radius:7px;font-weight:600;font-size:15px;">Log in now</a>
      <div style="font-size:11px;color:#94a3b8;margin-top:8px;">%s</div>
    </div>

    <div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:0 5px 5px 0;">
      <div style="font-size:13px;color:#713f12;line-height:1.6;">
        <strong>Please change your password after your first login.</strong><br/>
        Go to Settings &rarr; Change password. Do not share these details with anyone.
      </div>
    </div>

    <p style="color:#94a3b8;font-size:11px;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:14px;">
      If you were not expecting this account, please contact your administrator.
    </p>
  </div>
</div>`,
		template.HTMLEscapeString(u.Name),
		roleBlurb,
		template.HTMLEscapeString(u.Email),
		template.HTMLEscapeString(plainPassword),
		template.HTMLEscapeString(string(u.Role)),
		optionalRow("Employee ID", u.EmployeeID),
		loginURL,
		template.HTMLEscapeString(loginURL),
	)

	m := gomail.NewMessage()
	m.SetAddressHeader("From", cfg.SMTPFrom, cfg.SMTPFromName)
	m.SetHeader("To", u.Email)
	m.SetHeader("Subject", "Your Device Management System account")
	m.SetBody("text/html", body)
	m.AddAlternative("text/plain", fmt.Sprintf(
		"Hello %s,\n\nAn account has been created for you on the Device Management System.\n\n"+
			"Username: %s\nPassword: %s\nRole: %s\n\nLog in at: %s\n\n"+
			"Please change your password after your first login (Settings > Change password).\n",
		u.Name, u.Email, plainPassword, u.Role, loginURL))

	d := gomail.NewDialer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("email: credentials to %s: %w", u.Email, err)
	}

	log.Printf("email: credentials sent to %s (%s)", u.Email, u.Role)
	return nil
}

// SendEmailLoginCode delivers the passwordless code used by QR visitors.
func SendEmailLoginCode(email, code string, validFor time.Duration) error {
	cfg := config.C
	if !cfg.EmailEnabled {
		return fmt.Errorf("email is disabled on the server")
	}
	if cfg.SMTPHost == "" || cfg.SMTPUsername == "" {
		return fmt.Errorf("SMTP is not configured")
	}

	mins := int(validFor.Minutes())
	body := fmt.Sprintf(`
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:26px;border-radius:10px 10px 0 0;">
    <div style="font-size:11px;letter-spacing:1.5px;opacity:.8;text-transform:uppercase;">Device Management System</div>
    <h2 style="margin:6px 0 0;font-size:21px;">Verify your email</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 10px 10px;text-align:center;">
    <p style="margin:0 0 18px;color:#334155;">Use this code to sign in and raise your device query:</p>
    <div style="display:inline-block;padding:14px 24px;border-radius:9px;background:#eff6ff;color:#1d4ed8;font:700 32px/1 Consolas,monospace;letter-spacing:8px;">%s</div>
    <p style="margin:20px 0 0;color:#64748b;font-size:13px;">The code expires in %d minutes and can be used only once.</p>
    <p style="margin:14px 0 0;color:#94a3b8;font-size:11px;">If you did not request this code, you can ignore this email.</p>
  </div>
</div>`, template.HTMLEscapeString(code), mins)

	m := gomail.NewMessage()
	m.SetAddressHeader("From", cfg.SMTPFrom, cfg.SMTPFromName)
	m.SetHeader("To", email)
	m.SetHeader("Subject", code+" is your DMS verification code")
	m.SetBody("text/html", body)
	m.AddAlternative("text/plain", fmt.Sprintf(
		"Your DMS verification code is %s. It expires in %d minutes and can be used once.\n", code, mins))
	d := gomail.NewDialer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("email verification code to %s: %w", email, err)
	}
	log.Printf("email: verification code sent to %s", email)
	return nil
}

// SendPasswordResetEmail delivers a one-time reset link.
//
// Unlike the other notifications, this one is NOT best-effort: if it cannot be
// sent, the caller must know, because the user is otherwise left waiting for a
// mail that will never arrive.
func SendPasswordResetEmail(u *models.User, resetURL string, validFor time.Duration) error {
	cfg := config.C

	if !cfg.EmailEnabled {
		return fmt.Errorf("email is disabled on the server, so password resets cannot be sent")
	}
	if cfg.SMTPHost == "" || cfg.SMTPUsername == "" {
		return fmt.Errorf("SMTP is not configured")
	}

	mins := int(validFor.Minutes())

	body := fmt.Sprintf(`
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:28px;border-radius:10px 10px 0 0;">
    <div style="font-size:11px;letter-spacing:1.5px;opacity:.8;text-transform:uppercase;">Device Management System</div>
    <h2 style="margin:6px 0 0;font-size:21px;">Reset your password</h2>
  </div>

  <div style="border:1px solid #e5e7eb;border-top:none;padding:26px 28px;border-radius:0 0 10px 10px;">
    <p style="margin:0 0 16px;">Hello %s,</p>
    <p style="margin:0 0 22px;">
      We received a request to reset the password for <strong>%s</strong>.
      Click the button below to choose a new one.
    </p>

    <div style="text-align:center;margin-bottom:22px;">
      <a href="%s" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 32px;border-radius:7px;font-weight:600;font-size:15px;">Reset my password</a>
    </div>

    <div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:0 5px 5px 0;margin-bottom:18px;">
      <div style="font-size:13px;color:#713f12;line-height:1.6;">
        This link expires in <strong>%d minutes</strong> and can only be used once.
      </div>
    </div>

    <p style="font-size:12px;color:#64748b;margin:0 0 6px;">If the button does not work, paste this into your browser:</p>
    <p style="font-size:11px;color:#2563eb;word-break:break-all;margin:0 0 22px;">%s</p>

    <p style="color:#94a3b8;font-size:11px;border-top:1px solid #f1f5f9;padding-top:14px;margin:0;">
      <strong>Did not request this?</strong> You can ignore this email — your password will not change,
      and nobody can reset it without this link.
    </p>
  </div>
</div>`,
		template.HTMLEscapeString(u.Name),
		template.HTMLEscapeString(u.Email),
		resetURL, mins, template.HTMLEscapeString(resetURL))

	m := gomail.NewMessage()
	m.SetAddressHeader("From", cfg.SMTPFrom, cfg.SMTPFromName)
	m.SetHeader("To", u.Email)
	m.SetHeader("Subject", "Reset your Device Management System password")
	m.SetBody("text/html", body)
	m.AddAlternative("text/plain", fmt.Sprintf(
		"Hello %s,\n\nReset the password for %s using this link (valid for %d minutes, one use only):\n\n%s\n\n"+
			"If you did not request this, ignore this email — your password will not change.\n",
		u.Name, u.Email, mins, resetURL))

	d := gomail.NewDialer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("email: password reset to %s: %w", u.Email, err)
	}

	log.Printf("email: password reset link sent to %s", u.Email)
	return nil
}

func optionalRow(label, value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return fmt.Sprintf(
		`<tr><td style="padding:7px 0;font-size:13px;color:#64748b;">%s</td>`+
			`<td style="padding:7px 0;font-size:14px;color:#0f172a;font-weight:600;font-family:Consolas,monospace;">%s</td></tr>`,
		template.HTMLEscapeString(label), template.HTMLEscapeString(value))
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
	ReplyURL      string
}

func renderQueryEmail(q *models.Query) (string, error) {
	// Deep link to this exact ticket. If the admin is not signed in, the app's
	// route guard bounces them to login and returns here afterwards, so the
	// link works from a cold inbox.
	replyURL := fmt.Sprintf("%s/queries?open=%d",
		strings.TrimRight(config.C.PublicBaseURL, "/"), q.ID)

	data := emailData{
		Q:             q,
		PriorityColor: priorityColor(q.Priority),
		PriorityLabel: strings.ToUpper(string(q.Priority)),
		SubmittedAt:   q.CreatedAt.Format("02 Jan 2006, 03:04 PM"),
		ReplyURL:      replyURL,
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

    <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:16px 18px;border-radius:0 6px 6px 0;margin-bottom:22px;">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Issue Title</div>
      <div style="font-size:17px;color:#0f172a;font-weight:600;margin-top:4px;">{{.Q.Title}}</div>
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-top:14px;">Description</div>
      <div style="font-size:14px;color:#334155;margin-top:4px;line-height:1.6;white-space:pre-wrap;">{{.Q.Description}}</div>
    </div>

    <div style="text-align:center;margin-bottom:26px;">
      <a href="{{.ReplyURL}}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 34px;border-radius:8px;font-size:15px;font-weight:600;">
        View &amp; reply to this ticket
      </a>
      <div style="font-size:11px;color:#94a3b8;margin-top:8px;">
        Opens {{.Q.TicketNumber}} where you can set its status and add a reply.
      </div>
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
	fmt.Fprintf(&b, "View & reply: %s/queries?open=%d\n\n",
		strings.TrimRight(config.C.PublicBaseURL, "/"), q.ID)
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
