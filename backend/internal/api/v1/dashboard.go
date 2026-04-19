package v1

import (
	"net/http"

	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type DashboardHandler struct {
	svc *services.DashboardService
}

func NewDashboardHandler(svc *services.DashboardService) *DashboardHandler {
	return &DashboardHandler{svc: svc}
}

func (h *DashboardHandler) GetTeamDashboard(c *gin.Context) {
	data, err := h.svc.GetTeamDashboard(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load team dashboard"})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *DashboardHandler) GetMyDashboard(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid, _ := userID.(string)
	data, err := h.svc.GetMyDashboard(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load my dashboard"})
		return
	}
	c.JSON(http.StatusOK, data)
}
