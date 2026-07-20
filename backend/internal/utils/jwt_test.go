package utils

import (
	"testing"
	"time"

	"dms/backend/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

func TestParseTokenRejectsWrongIssuer(t *testing.T) {
	previous := config.C
	config.C = &config.Config{JWTSecret: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}
	t.Cleanup(func() { config.C = previous })

	claims := Claims{
		UserID: 1,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "different-application",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.C.JWTSecret))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseToken(token); err == nil {
		t.Fatal("expected a correctly signed token from the wrong issuer to be rejected")
	}
}
