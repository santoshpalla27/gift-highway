package config

import (
	"log"
	"os"
)

type Config struct {
	DatabaseURL     string
	Port            string
	ExpoAccessToken string
}

func Load() *Config {
	db := os.Getenv("DATABASE_URL")
	if db == "" {
		log.Fatal("DATABASE_URL is required")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "4002"
	}
	return &Config{
		DatabaseURL:     db,
		Port:            port,
		ExpoAccessToken: os.Getenv("EXPO_ACCESS_TOKEN"),
	}
}
