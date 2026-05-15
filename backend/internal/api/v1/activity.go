package v1

import (
	"net/http"
	"strconv"

	"github.com/company/app/backend/internal/repositories"
	"github.com/gin-gonic/gin"
)

type ActivityHandler struct {
	eventRepo *repositories.EventRepository
}

func NewActivityHandler(eventRepo *repositories.EventRepository) *ActivityHandler {
	return &ActivityHandler{eventRepo: eventRepo}
}

func (h *ActivityHandler) GetActivityLog(c *gin.Context) {
	ctx := c.Request.Context()

	orderTitle := c.Query("title")
	eventType  := c.Query("event_type")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	events, total, err := h.eventRepo.ListAllEvents(ctx, orderTitle, eventType, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if events == nil {
		events = []*repositories.ActivityEvent{}
	}

	c.JSON(http.StatusOK, gin.H{
		"events": events,
		"total":  total,
		"page":   page,
		"limit":  limit,
	})
}
