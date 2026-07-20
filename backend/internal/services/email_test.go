package services

import (
	"strings"
	"testing"

	"dms/backend/internal/config"
	"dms/backend/internal/models"
)

func TestQueryEmailEscapesUserControlledHTML(t *testing.T) {
	previous := config.C
	config.C = &config.Config{PublicBaseURL: "https://dms.acme.test"}
	t.Cleanup(func() { config.C = previous })

	q := &models.Query{
		ID:             1,
		TicketNumber:   "DMS-2026-000001",
		Title:          `<img src=x onerror="alert(1)">`,
		Description:    `<script>alert("xss")</script>`,
		ReportedByName: `<b>Attacker</b>`,
		Priority:       models.PriorityHigh,
	}
	body, err := renderQueryEmail(q)
	if err != nil {
		t.Fatal(err)
	}
	for _, unsafe := range []string{"<img src=x", "<script>", "<b>Attacker</b>"} {
		if strings.Contains(body, unsafe) {
			t.Fatalf("email contains unescaped user HTML %q", unsafe)
		}
	}
	if !strings.Contains(body, "&lt;script&gt;") {
		t.Fatal("expected escaped content to remain visible as text")
	}
}
