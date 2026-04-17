package api

import (
	v1 "github.com/company/app/backend/internal/api/v1"
	"github.com/company/app/backend/internal/auth"
	"github.com/company/app/backend/internal/config"
	"github.com/company/app/backend/internal/middleware"
	"github.com/company/app/backend/internal/repositories"
	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

func NewRouter(cfg *config.Config, db *sqlx.DB) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	// Global middleware
	r.Use(middleware.RequestLogger())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORS(cfg.AllowedOrigins))
	r.Use(middleware.RateLimit(cfg.RateLimitRPS, cfg.RateLimitBurst))
	r.Use(gin.Recovery())

	// Dependencies
	userRepo := repositories.NewUserRepository(db)
	jwtManager := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)
	authSvc := services.NewAuthService(userRepo, jwtManager, cfg.RefreshExpiry)
	adminSvc := services.NewAdminService(userRepo)
	profileSvc := services.NewProfileService(userRepo, cfg)

	authHandler := v1.NewAuthHandler(authSvc)
	adminHandler := v1.NewAdminHandler(adminSvc)
	profileHandler := v1.NewProfileHandler(profileSvc)

	// Health
	r.GET("/health", v1.HealthCheck)

	// API v1
	api := r.Group("/api/v1")
	{
		// Public routes
		authGroup := api.Group("/auth")
		{
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/refresh", authHandler.Refresh)
		}

		// Protected routes
		protected := api.Group("")
		protected.Use(middleware.RequireAuth(jwtManager))
		{
			protected.POST("/auth/logout", authHandler.Logout)
			protected.GET("/auth/me", authHandler.Me)

			// Admin routes (require admin role)
			adminGroup := protected.Group("/admin")
			adminGroup.Use(middleware.RequireRole("admin"))
			{
				adminGroup.GET("/users", adminHandler.ListUsers)
				adminGroup.POST("/users", adminHandler.CreateUser)
				adminGroup.PATCH("/users/:id", adminHandler.UpdateUser)
				adminGroup.PATCH("/users/:id/password", adminHandler.ChangePassword)
				adminGroup.DELETE("/users/:id", adminHandler.DeleteUser)
			}

			// Profile routes
			profileGroup := protected.Group("/profile")
			{
				profileGroup.GET("/me", profileHandler.GetProfile)
				profileGroup.GET("/avatar/signed-url", profileHandler.GetAvatarSignedURL)
				profileGroup.POST("/avatar/upload-url", profileHandler.GetAvatarUploadURL)
				profileGroup.PATCH("/avatar", profileHandler.UpdateAvatarURL)
			}
		}
	}

	return r
}
