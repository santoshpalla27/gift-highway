package v1

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/realtime"
	"github.com/company/app/backend/internal/services"
	"github.com/company/app/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

type EventHandler struct {
	eventService      *services.EventService
	orderService      *services.OrderService
	attachmentService *services.AttachmentService
	hub               *realtime.Hub
}

func NewEventHandler(eventService *services.EventService, orderService *services.OrderService, attachmentService *services.AttachmentService, hub *realtime.Hub) *EventHandler {
	return &EventHandler{eventService: eventService, orderService: orderService, attachmentService: attachmentService, hub: hub}
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
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	sort := c.DefaultQuery("sort", "asc")

	events, total, err := h.eventService.ListEvents(c.Request.Context(), orderID, page, limit, sort)
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

func (h *EventHandler) DeleteComment(c *gin.Context) {
	orderID := c.Param("id")
	eventID := c.Param("eventId")
	ctx := c.Request.Context()

	ev, err := h.eventService.GetEvent(ctx, eventID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	// Only comment and attachment events can be deleted via this route
	if ev.Type != models.EvtCommentAdded && ev.Type != models.EvtAttachmentAdded {
		c.JSON(http.StatusForbidden, gin.H{"error": "only comments and attachments can be deleted"})
		return
	}

	// Must belong to this order
	if ev.OrderID != orderID {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	// Require assigned-to-order or admin
	role, _ := c.Get("user_role")
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	if role != "admin" {
		order, err := h.orderService.GetOrder(ctx, orderID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		isAssigned := false
		for _, id := range order.AssignedTo {
			if id == uid {
				isAssigned = true
				break
			}
		}
		if !isAssigned {
			c.JSON(http.StatusForbidden, gin.H{"error": "only assigned users or admins can delete"})
			return
		}
	}

	if ev.Type == models.EvtAttachmentAdded {
		_, err := h.attachmentService.DeleteAttachmentByEventID(ctx, eventID, uid, role.(string))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete attachment"})
			return
		}
		h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEventDeleted, orderID, gin.H{
			"event_id":  eventID,
			"tombstone": true,
		}))
		c.JSON(http.StatusOK, gin.H{"message": "deleted"})
		return
	}

	if err := h.eventService.DeleteComment(ctx, eventID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete comment"})
		return
	}

	h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEventDeleted, orderID, gin.H{"event_id": eventID}))
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *EventHandler) EditComment(c *gin.Context) {
	orderID := c.Param("id")
	eventID := c.Param("eventId")
	ctx := c.Request.Context()

	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
		return
	}
	req.Text = utils.Strip(req.Text)

	ev, err := h.eventService.GetEvent(ctx, eventID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	if ev.Type != models.EvtCommentAdded || ev.OrderID != orderID {
		c.JSON(http.StatusForbidden, gin.H{"error": "only comments on this order can be edited"})
		return
	}

	role, _ := c.Get("user_role")
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	if role != "admin" {
		order, err := h.orderService.GetOrder(ctx, orderID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		isAssigned := false
		for _, id := range order.AssignedTo {
			if id == uid {
				isAssigned = true
				break
			}
		}
		if !isAssigned {
			c.JSON(http.StatusForbidden, gin.H{"error": "only assigned users or admins can edit comments"})
			return
		}
	}

	if err := h.eventService.EditComment(ctx, eventID, req.Text); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to edit comment"})
		return
	}

	updated, _ := h.eventService.GetEvent(ctx, eventID)
	if updated != nil {
		h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, orderID, toEventResponse(updated)))
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
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
	req.Text = utils.Strip(req.Text)

	event, err := h.eventService.AddComment(c.Request.Context(), orderID, uid, req.Text)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add comment"})
		return
	}

	resp := toEventResponse(event)
	h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, orderID, resp))
	c.JSON(http.StatusCreated, gin.H{"event": resp})
}
