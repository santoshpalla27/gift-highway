package v1

import (
	"net/http"
	"strconv"
	"time"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/realtime"
	"github.com/company/app/backend/internal/repositories"
	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type OrderHandler struct {
	orderService *services.OrderService
	eventService *services.EventService
	hub          *realtime.Hub
}

func NewOrderHandler(orderService *services.OrderService, eventService *services.EventService, hub *realtime.Hub) *OrderHandler {
	return &OrderHandler{orderService: orderService, eventService: eventService, hub: hub}
}

type orderResponse struct {
	ID            string   `json:"id"`
	OrderNumber   int      `json:"order_number"`
	Title         string   `json:"title"`
	Description   string   `json:"description"`
	CustomerName  string   `json:"customer_name"`
	ContactNumber string   `json:"contact_number"`
	Status        string   `json:"status"`
	Priority      string   `json:"priority"`
	AssignedTo    []string `json:"assigned_to"`
	AssignedNames []string `json:"assigned_names"`
	CreatedBy     string   `json:"created_by"`
	CreatedByName string   `json:"created_by_name"`
	DueDate       *string  `json:"due_date"`
	CreatedAt     string   `json:"created_at"`
	UpdatedAt     string   `json:"updated_at"`
}

func toOrderResponse(o *models.OrderWithNames) orderResponse {
	var dueDate *string
	if o.DueDate != nil {
		s := o.DueDate.Format("2006-01-02")
		dueDate = &s
	}
	assignedTo := []string(o.AssignedTo)
	if assignedTo == nil {
		assignedTo = []string{}
	}
	assignedNames := []string(o.AssignedNames)
	if assignedNames == nil {
		assignedNames = []string{}
	}
	return orderResponse{
		ID:            o.ID,
		OrderNumber:   o.OrderNumber,
		Title:         o.Title,
		Description:   o.Description,
		CustomerName:  o.CustomerName,
		ContactNumber: o.ContactNumber,
		Status:        o.Status,
		Priority:      o.Priority,
		AssignedTo:    assignedTo,
		AssignedNames: assignedNames,
		CreatedBy:     o.CreatedBy,
		CreatedByName: o.CreatedByName,
		DueDate:       dueDate,
		CreatedAt:     o.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     o.UpdatedAt.Format(time.RFC3339),
	}
}

func (h *OrderHandler) ListOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	orders, total, err := h.orderService.ListOrders(c.Request.Context(), services.ListOrdersParams{
		Search:     c.Query("search"),
		Status:     c.Query("status"),
		Priority:   c.Query("priority"),
		AssignedTo: c.Query("assigned_to"),
		DueFrom:    c.Query("due_from"),
		DueTo:      c.Query("due_to"),
		Page:       page,
		Limit:      limit,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch orders"})
		return
	}

	items := make([]orderResponse, len(orders))
	for i, o := range orders {
		items[i] = toOrderResponse(o)
	}
	c.JSON(http.StatusOK, gin.H{"orders": items, "total": total, "page": page, "limit": limit})
}

func (h *OrderHandler) GetOrder(c *gin.Context) {
	id := c.Param("id")
	o, err := h.orderService.GetOrder(c.Request.Context(), id)
	if err != nil {
		if err == repositories.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch order"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"order": toOrderResponse(o)})
}

func (h *OrderHandler) CreateOrder(c *gin.Context) {
	var req services.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, _ := c.Get("user_id")
	o, err := h.orderService.CreateOrder(c.Request.Context(), userID.(string), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create order"})
		return
	}
	resp := toOrderResponse(o)
	h.hub.Broadcast(realtime.NewEvent(realtime.EventOrderCreated, o.ID, resp))

	uid := userID.(string)
	if ev, err := h.eventService.Record(c.Request.Context(), o.ID, &uid, models.EvtOrderCreated,
		map[string]string{"customer_name": o.CustomerName}); err == nil {
		h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, o.ID, toEventResponse(ev)))
	}

	c.JSON(http.StatusCreated, gin.H{"order": resp})
}

// isAssignedOrAdmin returns true when the caller is an admin or is in the order's assigned_to list.
func isAssignedOrAdmin(c *gin.Context, order *models.OrderWithNames) bool {
	role, _ := c.Get("user_role")
	if role == "admin" {
		return true
	}
	uid, _ := c.Get("user_id")
	for _, id := range order.AssignedTo {
		if id == uid.(string) {
			return true
		}
	}
	return false
}

func (h *OrderHandler) UpdateOrder(c *gin.Context) {
	id := c.Param("id")
	var req services.UpdateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	uid := userID.(string)
	ctx := c.Request.Context()

	// Snapshot old state for change detection + permission check
	old, err := h.orderService.GetOrder(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	if !isAssignedOrAdmin(c, old) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only assigned users or admins can edit this order"})
		return
	}

	// Only admin may change assignees
	role, _ := c.Get("user_role")
	if role != "admin" {
		req.AssignedTo = []string(old.AssignedTo)
	}

	if err := h.orderService.UpdateOrder(ctx, id, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update order"})
		return
	}

	h.hub.Broadcast(realtime.NewEvent(realtime.EventOrderUpdated, id, gin.H{"id": id}))

	// Record per-field events
	if old != nil {
		if old.Priority != req.Priority {
			if ev, err := h.eventService.Record(ctx, id, &uid, models.EvtPriorityChanged,
				map[string]string{"from": old.Priority, "to": req.Priority}); err == nil {
				h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, id, toEventResponse(ev)))
			}
		}

		oldDue := ""
		if old.DueDate != nil {
			oldDue = old.DueDate.Format("2006-01-02")
		}
		newDue := ""
		if req.DueDate != nil {
			newDue = *req.DueDate
		}
		if oldDue != newDue {
			if ev, err := h.eventService.Record(ctx, id, &uid, models.EvtDueDateChanged,
				map[string]string{"from": oldDue, "to": newDue}); err == nil {
				h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, id, toEventResponse(ev)))
			}
		}

		// Assignees: record if set changed
		oldSet := make(map[string]struct{}, len(old.AssignedTo))
		for _, v := range old.AssignedTo {
			oldSet[v] = struct{}{}
		}
		newSet := make(map[string]struct{}, len(req.AssignedTo))
		for _, v := range req.AssignedTo {
			newSet[v] = struct{}{}
		}
		assigneesChanged := len(oldSet) != len(newSet)
		if !assigneesChanged {
			for v := range newSet {
				if _, ok := oldSet[v]; !ok {
					assigneesChanged = true
					break
				}
			}
		}
		if assigneesChanged {
			if ev, err := h.eventService.Record(ctx, id, &uid, models.EvtAssigneesChanged,
				map[string]interface{}{"assignee_ids": req.AssignedTo}); err == nil {
				h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, id, toEventResponse(ev)))
			}
		}

		if old.Title != req.Title || old.Description != req.Description ||
			old.CustomerName != req.CustomerName || old.ContactNumber != req.ContactNumber {
			if ev, err := h.eventService.Record(ctx, id, &uid, models.EvtOrderUpdated,
				map[string]string{}); err == nil {
				h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, id, toEventResponse(ev)))
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *OrderHandler) UpdateStatus(c *gin.Context) {
	id := c.Param("id")
	var req services.UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	uid := userID.(string)
	ctx := c.Request.Context()

	old, err := h.orderService.GetOrder(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	if !isAssignedOrAdmin(c, old) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only assigned users or admins can change status"})
		return
	}

	if err := h.orderService.UpdateStatus(ctx, id, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update status"})
		return
	}

	h.hub.Broadcast(realtime.NewEvent(realtime.EventOrderStatus, id, gin.H{"id": id, "status": req.Status}))

	fromStatus := ""
	if old != nil {
		fromStatus = old.Status
	}
	if ev, err := h.eventService.Record(ctx, id, &uid, models.EvtStatusChanged,
		map[string]string{"from": fromStatus, "to": req.Status}); err == nil {
		h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, id, toEventResponse(ev)))
	}

	c.JSON(http.StatusOK, gin.H{"message": "status updated"})
}
