package v1

import (
	"net/http"
	"regexp"
	"time"

	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type DashboardHandler struct {
	svc *services.DashboardService
}

func NewDashboardHandler(svc *services.DashboardService) *DashboardHandler {
	return &DashboardHandler{svc: svc}
}

// localDate returns the client-supplied local date (YYYY-MM-DD) or falls back to UTC today.
func localDate(c *gin.Context) string {
	if d := c.Query("local_date"); datePattern.MatchString(d) {
		return d
	}
	return time.Now().UTC().Format("2006-01-02")
}

func (h *DashboardHandler) GetTeamDashboard(c *gin.Context) {
	data, err := h.svc.GetTeamDashboard(c.Request.Context(), localDate(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load team dashboard"})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *DashboardHandler) GetMyDashboard(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid, _ := userID.(string)
	data, err := h.svc.GetMyDashboard(c.Request.Context(), uid, localDate(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load my dashboard"})
		return
	}
	c.JSON(http.StatusOK, data)
}
