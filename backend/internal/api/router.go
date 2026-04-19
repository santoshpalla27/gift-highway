package api

import (
	v1 "github.com/company/app/backend/internal/api/v1"
	"github.com/company/app/backend/internal/auth"
	"github.com/company/app/backend/internal/config"
	"github.com/company/app/backend/internal/middleware"
	"github.com/company/app/backend/internal/realtime"
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
	orderRepo := repositories.NewOrderRepository(db)
	eventRepo := repositories.NewEventRepository(db)
	jwtManager := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)
	authSvc := services.NewAuthService(userRepo, jwtManager, cfg.RefreshExpiry)
	adminSvc := services.NewAdminService(userRepo)
	profileSvc := services.NewProfileService(userRepo, cfg)
	attachmentRepo := repositories.NewAttachmentRepository(db)
	portalRepo := repositories.NewPortalRepository(db)
	orderSvc := services.NewOrderService(orderRepo)
	eventSvc := services.NewEventService(eventRepo)
	attachmentSvc := services.NewAttachmentService(attachmentRepo, eventRepo, cfg)
	portalSvc := services.NewPortalService(portalRepo, orderRepo, eventRepo, cfg)
	dashboardRepo := repositories.NewDashboardRepository(db)
	dashboardSvc := services.NewDashboardService(dashboardRepo)

	hub := realtime.NewHub()
	go hub.Run()

	portalHandler := v1.NewPortalHandler(portalSvc, hub)
	authHandler := v1.NewAuthHandler(authSvc)
	adminHandler := v1.NewAdminHandler(adminSvc)
	profileHandler := v1.NewProfileHandler(profileSvc)
	orderHandler := v1.NewOrderHandler(orderSvc, eventSvc, hub)
	eventHandler := v1.NewEventHandler(eventSvc, orderSvc, attachmentSvc, hub)
	attachmentHandler := v1.NewAttachmentHandler(attachmentSvc, hub)
	dashboardHandler := v1.NewDashboardHandler(dashboardSvc)
	usersHandler := v1.NewUsersHandler(userRepo)
	wsHandler := v1.NewWSHandler(hub, jwtManager)

	// Health
	r.GET("/health", v1.HealthCheck)

	// Public portal routes (token-based, no auth) — under /api/portal to avoid SPA route conflict
	apiPortal := r.Group("/api/portal")
	{
		apiPortal.GET("/:token", portalHandler.GetPortal)
		apiPortal.GET("/:token/messages", portalHandler.GetMessages)
		apiPortal.POST("/:token/messages", portalHandler.SendMessage)
		apiPortal.GET("/:token/attachments", portalHandler.GetAttachments)
		apiPortal.POST("/:token/attachments/upload-url", portalHandler.GetAttachmentUploadURL)
		apiPortal.POST("/:token/attachments", portalHandler.ConfirmAttachment)
		apiPortal.DELETE("/:token/attachments/:attId", portalHandler.DeletePortalAttachmentPublic)
	}

	// WebSocket
	r.GET("/ws", wsHandler.ServeWS)

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
		protected.Use(middleware.RequireAuth(jwtManager, userRepo))
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
				adminGroup.PATCH("/users/:id/disable", adminHandler.DisableUser)
				adminGroup.PATCH("/users/:id/enable", adminHandler.EnableUser)
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

			// Dashboard
			dashboardGroup := protected.Group("/dashboard")
			{
				dashboardGroup.GET("/team", dashboardHandler.GetTeamDashboard)
				dashboardGroup.GET("/me", dashboardHandler.GetMyDashboard)
			}

			// Users list for assignment dropdowns
			protected.GET("/users", usersHandler.ListForAssignment)

			// Orders routes
			ordersGroup := protected.Group("/orders")
			{
				ordersGroup.GET("", orderHandler.ListOrders)
				ordersGroup.POST("", orderHandler.CreateOrder)
				ordersGroup.GET("/:id", orderHandler.GetOrder)
				ordersGroup.PATCH("/:id", orderHandler.UpdateOrder)
				ordersGroup.PATCH("/:id/status", orderHandler.UpdateStatus)
				ordersGroup.GET("/:id/events", eventHandler.ListEvents)
				ordersGroup.POST("/:id/comments", eventHandler.AddComment)
				ordersGroup.DELETE("/:id/events/:eventId", eventHandler.DeleteComment)
				ordersGroup.PATCH("/:id/events/:eventId", eventHandler.EditComment)
				ordersGroup.POST("/:id/attachments/upload-url", attachmentHandler.GetUploadURL)
				ordersGroup.POST("/:id/attachments", attachmentHandler.ConfirmUpload)
				ordersGroup.GET("/:id/attachments", attachmentHandler.ListAttachments)
				ordersGroup.GET("/:id/attachments/signed-url", attachmentHandler.GetSignedURL)
				ordersGroup.GET("/:id/attachments/download-url", attachmentHandler.GetDownloadURL)
				ordersGroup.DELETE("/:id/attachments/:attachmentId", attachmentHandler.DeleteAttachment)

				// Portal management (staff)
				ordersGroup.POST("/:id/portal", portalHandler.CreatePortal)
				ordersGroup.GET("/:id/portal", portalHandler.GetOrderPortal)
				ordersGroup.PATCH("/:id/portal/revoke", portalHandler.RevokePortal)
				ordersGroup.POST("/:id/portal/regenerate", portalHandler.RegenerateToken)
				ordersGroup.POST("/:id/portal/reply", portalHandler.StaffReply)
				ordersGroup.GET("/:id/portal/messages", portalHandler.GetPortalMessages)
				ordersGroup.GET("/:id/portal/attachments", portalHandler.StaffListAttachments)
				ordersGroup.POST("/:id/portal/attachments/upload-url", portalHandler.StaffGetUploadURL)
				ordersGroup.POST("/:id/portal/attachments/confirm", portalHandler.StaffConfirmAttachment)
				ordersGroup.DELETE("/:id/portal/attachments/:attId", portalHandler.DeletePortalAttachment)
				ordersGroup.GET("/:id/portal/attachments/:attId/download-url", portalHandler.StaffGetAttachmentDownloadURL)
			}
		}
	}

	return r
}
