package v1

import (
	"net/http"
	"regexp"
	"strconv"
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

// localDate returns the client-supplied local date (YYYY-MM-DD) or falls back to IST today.
func localDate(c *gin.Context) string {
	if d := c.Query("local_date"); datePattern.MatchString(d) {
		return d
	}
	return time.Now().In(time.FixedZone("IST", 5*60*60+30*60)).Format("2006-01-02")
}

func (h *DashboardHandler) GetTeamDashboard(c *gin.Context) {
	data, err := h.svc.GetTeamDashboard(c.Request.Context(), localDate(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load team dashboard"})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *DashboardHandler) GetUserMetrics(c *gin.Context) {
	rows, err := h.svc.GetUserMetrics(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user metrics"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"users": rows})
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

func (h *DashboardHandler) GetTeamSectionPage(c *gin.Context) {
	section := c.Query("type")
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit < 1 || limit > 100 {
		limit = 10
	}
	data, err := h.svc.GetTeamSectionPage(c.Request.Context(), section, localDate(c), offset, limit)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *DashboardHandler) GetMySectionPage(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid, _ := userID.(string)
	section := c.Query("type")
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit < 1 || limit > 100 {
		limit = 10
	}
	data, err := h.svc.GetMySectionPage(c.Request.Context(), uid, section, localDate(c), offset, limit)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}
