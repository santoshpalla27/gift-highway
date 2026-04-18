package v1

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/realtime"
	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type EventHandler struct {
	eventService *services.EventService
	hub          *realtime.Hub
}

func NewEventHandler(eventService *services.EventService, hub *realtime.Hub) *EventHandler {
	return &EventHandler{eventService: eventService, hub: hub}
}

type eventResponse struct {
	ID        string          `json:"id"`
	OrderID   string          `json:"order_id"`
	Type      string          `json:"type"`
	ActorID   *string         `json:"actor_id"`
	ActorName string          `json:"actor_name"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt string          `json:"created_at"`
}

func toEventResponse(e *models.OrderEvent) eventResponse {
	return eventResponse{
		ID:        e.ID,
		OrderID:   e.OrderID,
		Type:      e.Type,
		ActorID:   e.ActorID,
		ActorName: e.ActorName,
		Payload:   e.Payload,
		CreatedAt: e.CreatedAt.Format(time.RFC3339),
	}
}

func (h *EventHandler) ListEvents(c *gin.Context) {
	orderID := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	events, total, err := h.eventService.ListEvents(c.Request.Context(), orderID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch events"})
		return
	}

	items := make([]eventResponse, len(events))
	for i, e := range events {
		items[i] = toEventResponse(e)
	}
	c.JSON(http.StatusOK, gin.H{"events": items, "total": total})
}

func (h *EventHandler) AddComment(c *gin.Context) {
	orderID := c.Param("id")
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
		return
	}

	event, err := h.eventService.AddComment(c.Request.Context(), orderID, uid, req.Text)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add comment"})
		return
	}

	resp := toEventResponse(event)
	h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, orderID, resp))
	c.JSON(http.StatusCreated, gin.H{"event": resp})
}
