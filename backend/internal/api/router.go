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
	orderSvc := services.NewOrderService(orderRepo, cfg)
	eventSvc := services.NewEventService(eventRepo, userRepo)
	attachmentSvc := services.NewAttachmentService(attachmentRepo, eventRepo, cfg)
	portalSvc := services.NewPortalService(portalRepo, orderRepo, eventRepo, cfg)
	dashboardRepo := repositories.NewDashboardRepository(db)
	dashboardSvc := services.NewDashboardService(dashboardRepo)
	notificationRepo := repositories.NewNotificationRepository(db)
	notificationSvc := services.NewNotificationService(notificationRepo)

	hub := realtime.NewHub()
	hub.SetDB(db.DB)
	go hub.Run()

	portalHandler := v1.NewPortalHandler(portalSvc, hub)
	authHandler := v1.NewAuthHandler(authSvc)
	adminHandler := v1.NewAdminHandler(adminSvc)
	profileHandler := v1.NewProfileHandler(profileSvc)
	pushHandler := v1.NewPushHandler(db)
	orderHandler := v1.NewOrderHandler(orderSvc, eventSvc, hub)
	eventHandler := v1.NewEventHandler(eventSvc, orderSvc, attachmentSvc, hub)
	attachmentHandler := v1.NewAttachmentHandler(attachmentSvc, hub)
	dashboardHandler := v1.NewDashboardHandler(dashboardSvc)
	usersHandler := v1.NewUsersHandler(userRepo)
	notificationHandler := v1.NewNotificationHandler(notificationSvc)
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
		apiPortal.DELETE("/:token/messages/:msgId", portalHandler.CustomerDeleteMessage)
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

			// Push notification token + preference routes
			protected.POST("/push/register", pushHandler.RegisterToken)
			protected.DELETE("/push/unregister", pushHandler.UnregisterToken)
			protected.GET("/push/prefs", pushHandler.GetPrefs)
			protected.PATCH("/push/prefs", pushHandler.SavePrefs)

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

			// Notifications
			notifGroup := protected.Group("/notifications")
			{
				notifGroup.GET("", notificationHandler.GetUnread)
				notifGroup.GET("/activity", notificationHandler.GetActivity)
				notifGroup.GET("/history", notificationHandler.GetHistory)
				notifGroup.GET("/orders", notificationHandler.GetOrderSummaries)
				notifGroup.GET("/order/:orderId", notificationHandler.GetOrderNotifications)
				notifGroup.GET("/order/:orderId/last-seen", notificationHandler.GetLastSeen)
				notifGroup.POST("/read/:orderId", notificationHandler.MarkOrderRead)
				notifGroup.POST("/read-all", notificationHandler.MarkAllRead)
			}

			// Orders routes
			ordersGroup := protected.Group("/orders")
			{
				ordersGroup.GET("", orderHandler.ListOrders)
				ordersGroup.POST("", orderHandler.CreateOrder)
				ordersGroup.GET("/trash", orderHandler.ListTrash)
				ordersGroup.GET("/:id", orderHandler.GetOrder)
				ordersGroup.PATCH("/:id", orderHandler.UpdateOrder)
				ordersGroup.PATCH("/:id/status", orderHandler.UpdateStatus)
				ordersGroup.POST("/:id/archive", orderHandler.ArchiveOrder)
				ordersGroup.POST("/:id/restore", orderHandler.RestoreOrder)
				ordersGroup.DELETE("/:id/permanent", orderHandler.PermanentDelete)
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
				ordersGroup.DELETE("/:id/portal/messages/:msgId", portalHandler.StaffDeleteMessage)
				ordersGroup.GET("/:id/portal/attachments/:attId/download-url", portalHandler.StaffGetAttachmentDownloadURL)
			}
		}
	}

	return r
}
