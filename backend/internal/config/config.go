package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog/log"
)

type Config struct {
	AppEnv         string
	Port           string
	DatabaseURL    string
	JWTSecret      string
	JWTExpiry      time.Duration
	RefreshExpiry  time.Duration
	AllowedOrigins []string
	RateLimitRPS   int
	RateLimitBurst int
}

func Load() *Config {
	_ = godotenv.Load()

	jwtExpiry, _ := time.ParseDuration(getEnv("JWT_EXPIRY", "15m"))
	refreshExpiry, _ := time.ParseDuration(getEnv("REFRESH_EXPIRY", "720h"))
	rlRPS, _ := strconv.Atoi(getEnv("RATE_LIMIT_RPS", "100"))
	rlBurst, _ := strconv.Atoi(getEnv("RATE_LIMIT_BURST", "200"))

	cfg := &Config{
		AppEnv:         getEnv("APP_ENV", "development"),
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://app:secret@localhost:5432/appdb?sslmode=disable"),
		JWTSecret:      getEnv("JWT_SECRET", "change-me-in-production-use-32-chars-min"),
		JWTExpiry:      jwtExpiry,
		RefreshExpiry:  refreshExpiry,
		AllowedOrigins: splitComma(getEnv("ALLOWED_ORIGINS", "http://localhost:5173")),
		RateLimitRPS:   rlRPS,
		RateLimitBurst: rlBurst,
	}

	if cfg.AppEnv == "production" && cfg.JWTSecret == "change-me-in-production-use-32-chars-min" {
		log.Fatal().Msg("JWT_SECRET must be set in production")
	}

	return cfg
}

func getEnv(key, defaultValue string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultValue
}

func splitComma(s string) []string {
	if s == "*" {
		return []string{"*"}
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			result = append(result, t)
		}
	}
	return result
}
