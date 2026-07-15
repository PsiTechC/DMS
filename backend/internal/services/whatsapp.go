package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"dms/backend/internal/config"
	"dms/backend/internal/models"
)

// BuildWhatsAppMessage renders the concise admin notification text.
// Kept separate from sending so it can be unit-tested and reused by any
// provider (Meta Cloud API, Twilio, Gupshup, ...).
func BuildWhatsAppMessage(q *models.Query) string {
	var b strings.Builder
	b.WriteString("*NEW DEVICE QUERY*\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━\n")
	fmt.Fprintf(&b, "*Ticket:* %s\n", q.TicketNumber)
	fmt.Fprintf(&b, "*Priority:* %s\n\n", strings.ToUpper(string(q.Priority)))
	fmt.Fprintf(&b, "*Device:* %s\n", q.DeviceName)
	fmt.Fprintf(&b, "*Device No:* %s\n", q.DeviceNumber)
	fmt.Fprintf(&b, "*QR No:* %s\n", q.QRNumber)
	fmt.Fprintf(&b, "*Location:* %s\n", dashIfBlank(q.Location))
	fmt.Fprintf(&b, "*Department:* %s\n\n", dashIfBlank(q.Department))
	fmt.Fprintf(&b, "*Reported By:* %s\n\n", q.ReportedByName)
	fmt.Fprintf(&b, "*Issue:* %s\n", q.Title)
	fmt.Fprintf(&b, "%s", truncate(q.Description, 300))
	return b.String()
}

// SendQueryWhatsApp posts the notification via the Meta WhatsApp Cloud API.
// Disabled by default — set WHATSAPP_ENABLED=true plus token/phone id in .env.
func SendQueryWhatsApp(q *models.Query) error {
	cfg := config.C

	if !cfg.WhatsAppEnabled {
		log.Printf("whatsapp: disabled, skipping ticket %s", q.TicketNumber)
		return nil
	}
	if cfg.WhatsAppToken == "" || cfg.WhatsAppPhoneID == "" || cfg.WhatsAppAdminNumber == "" {
		return fmt.Errorf("whatsapp: missing WHATSAPP_TOKEN / WHATSAPP_PHONE_ID / WHATSAPP_ADMIN_NUMBER")
	}

	endpoint := cfg.WhatsAppAPIURL
	if endpoint == "" {
		endpoint = fmt.Sprintf("https://graph.facebook.com/v21.0/%s/messages", cfg.WhatsAppPhoneID)
	}

	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"to":                cfg.WhatsAppAdminNumber,
		"type":              "text",
		"text": map[string]interface{}{
			"preview_url": false,
			"body":        BuildWhatsAppMessage(q),
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("whatsapp: marshal payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("whatsapp: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+cfg.WhatsAppToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("whatsapp: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("whatsapp: api returned %d: %s", resp.StatusCode, string(respBody))
	}

	log.Printf("whatsapp: ticket %s sent to %s", q.TicketNumber, cfg.WhatsAppAdminNumber)
	return nil
}

func dashIfBlank(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
