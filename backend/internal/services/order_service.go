package services

import (
	"context"
	"time"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
	"github.com/google/uuid"
)

type OrderService struct {
	orderRepo *repositories.OrderRepository
}

func NewOrderService(orderRepo *repositories.OrderRepository) *OrderService {
	return &OrderService{orderRepo: orderRepo}
}

type CreateOrderRequest struct {
	Title         string   `json:"title" binding:"required"`
	Description   string   `json:"description"`
	CustomerName  string   `json:"customer_name" binding:"required"`
	ContactNumber string   `json:"contact_number"`
	Priority      string   `json:"priority" binding:"required,oneof=low medium high urgent"`
	AssignedTo    []string `json:"assigned_to"`
	DueDate       *string  `json:"due_date"`
}

type UpdateOrderRequest struct {
	Title         string   `json:"title" binding:"required"`
	Description   string   `json:"description"`
	CustomerName  string   `json:"customer_name" binding:"required"`
	ContactNumber string   `json:"contact_number"`
	Priority      string   `json:"priority" binding:"required,oneof=low medium high urgent"`
	AssignedTo    []string `json:"assigned_to"`
	DueDate       *string  `json:"due_date"`
}

type UpdateOrderStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=new in_progress completed"`
}

type ListOrdersParams struct {
	Search     string
	Status     string
	Priority   string
	AssignedTo string
	DueFrom    string
	DueTo      string
	Page       int
	Limit      int
}

func (s *OrderService) ListOrders(ctx context.Context, p ListOrdersParams) ([]*models.OrderWithNames, int, error) {
	return s.orderRepo.List(ctx, repositories.OrderFilter{
		Search:     p.Search,
		Status:     p.Status,
		Priority:   p.Priority,
		AssignedTo: p.AssignedTo,
		DueFrom:    p.DueFrom,
		DueTo:      p.DueTo,
		Page:       p.Page,
		Limit:      p.Limit,
	})
}

func (s *OrderService) GetOrder(ctx context.Context, id string) (*models.OrderWithNames, error) {
	return s.orderRepo.GetByID(ctx, id)
}

func (s *OrderService) CreateOrder(ctx context.Context, createdBy string, req CreateOrderRequest) (*models.OrderWithNames, error) {
	var dueDate *time.Time
	if req.DueDate != nil && *req.DueDate != "" {
		t, err := time.Parse("2006-01-02", *req.DueDate)
		if err != nil {
			return nil, err
		}
		dueDate = &t
	}

	o := &models.Order{
		ID:            uuid.New().String(),
		Title:         req.Title,
		Description:   req.Description,
		CustomerName:  req.CustomerName,
		ContactNumber: req.ContactNumber,
		Status:        "new",
		Priority:      req.Priority,
		CreatedBy:     createdBy,
		DueDate:       dueDate,
	}
	return s.orderRepo.Create(ctx, o, req.AssignedTo)
}

func (s *OrderService) UpdateOrder(ctx context.Context, id string, req UpdateOrderRequest) error {
	return s.orderRepo.Update(ctx, id, req.Title, req.Description, req.CustomerName, req.ContactNumber, req.Priority, req.AssignedTo, req.DueDate)
}

func (s *OrderService) UpdateStatus(ctx context.Context, id string, req UpdateOrderStatusRequest) error {
	return s.orderRepo.UpdateStatus(ctx, id, req.Status)
}
