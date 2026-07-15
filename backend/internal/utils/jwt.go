package utils

import (
	"errors"
	"fmt"
	"time"

	"dms/backend/internal/config"
	"dms/backend/internal/models"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID uint        `json:"uid"`
	Email  string      `json:"email"`
	Role   models.Role `json:"role"`
	Name   string      `json:"name"`
	jwt.RegisteredClaims
}

func GenerateToken(u *models.User) (string, time.Time, error) {
	cfg := config.C
	expiry := time.Now().Add(time.Duration(cfg.JWTExpiryHours) * time.Hour)

	claims := Claims{
		UserID: u.ID,
		Email:  u.Email,
		Role:   u.Role,
		Name:   u.Name,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprint(u.ID),
			ExpiresAt: jwt.NewNumericDate(expiry),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "dms-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(cfg.JWTSecret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, expiry, nil
}

func ParseToken(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(config.C.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
