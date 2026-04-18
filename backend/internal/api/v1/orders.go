package v1

import (
	"net/http"
	"strconv"
	"time"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type OrderHandler struct {
	orderService *services.OrderService
}

func NewOrderHandler(orderService *services.OrderService) *OrderHandler {
	return &OrderHandler{orderService: orderService}
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
	c.JSON(http.StatusCreated, gin.H{"order": toOrderResponse(o)})
}

func (h *OrderHandler) UpdateOrder(c *gin.Context) {
	id := c.Param("id")
	var req services.UpdateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.orderService.UpdateOrder(c.Request.Context(), id, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update order"})
		return
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
	if err := h.orderService.UpdateStatus(c.Request.Context(), id, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update status"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "status updated"})
}
