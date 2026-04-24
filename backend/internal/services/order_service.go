package services

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/company/app/backend/internal/utils"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/company/app/backend/internal/config"
	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
	"github.com/google/uuid"
)

type OrderService struct {
	orderRepo *repositories.OrderRepository
	cfg       *config.Config
}

func NewOrderService(orderRepo *repositories.OrderRepository, cfg *config.Config) *OrderService {
	return &OrderService{orderRepo: orderRepo, cfg: cfg}
}

type CreateOrderRequest struct {
	Title         string   `json:"title" binding:"required"`
	Description   string   `json:"description"`
	CustomerName  string   `json:"customer_name" binding:"required"`
	ContactNumber string   `json:"contact_number"`
	Priority      string   `json:"priority" binding:"required,oneof=low medium high urgent"`
	AssignedTo    []string `json:"assigned_to"`
	DueDate       *string  `json:"due_date"`
	DueTime       *string  `json:"due_time"`
}

type UpdateOrderRequest struct {
	Title         string   `json:"title" binding:"required"`
	Description   string   `json:"description"`
	CustomerName  string   `json:"customer_name" binding:"required"`
	ContactNumber string   `json:"contact_number"`
	Priority      string   `json:"priority" binding:"required,oneof=low medium high urgent"`
	AssignedTo    []string `json:"assigned_to"`
	DueDate       *string  `json:"due_date"`
	DueTime       *string  `json:"due_time"`
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
	SortBy     string
	SortDir    string
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
		SortBy:     p.SortBy,
		SortDir:    p.SortDir,
	})
}

func (s *OrderService) GetOrder(ctx context.Context, id string) (*models.OrderWithNames, error) {
	return s.orderRepo.GetByID(ctx, id)
}

func (s *OrderService) CreateOrder(ctx context.Context, createdBy string, req CreateOrderRequest) (*models.OrderWithNames, error) {
	req.Title = utils.Strip(req.Title)
	req.Description = utils.Strip(req.Description)
	req.CustomerName = utils.Strip(req.CustomerName)
	req.ContactNumber = utils.Strip(req.ContactNumber)

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
		DueTime:       req.DueTime,
	}
	return s.orderRepo.Create(ctx, o, req.AssignedTo)
}

func (s *OrderService) UpdateOrder(ctx context.Context, id string, req UpdateOrderRequest) error {
	req.Title = utils.Strip(req.Title)
	req.Description = utils.Strip(req.Description)
	req.CustomerName = utils.Strip(req.CustomerName)
	req.ContactNumber = utils.Strip(req.ContactNumber)
	return s.orderRepo.Update(ctx, id, req.Title, req.Description, req.CustomerName, req.ContactNumber, req.Priority, req.AssignedTo, req.DueDate, req.DueTime)
}

func (s *OrderService) UpdateStatus(ctx context.Context, id string, req UpdateOrderStatusRequest) error {
	return s.orderRepo.UpdateStatus(ctx, id, req.Status)
}

func (s *OrderService) ArchiveOrder(ctx context.Context, id, archivedBy string) error {
	return s.orderRepo.Archive(ctx, id, archivedBy)
}

func (s *OrderService) RestoreOrder(ctx context.Context, id string) error {
	return s.orderRepo.Restore(ctx, id)
}

func (s *OrderService) ListTrash(ctx context.Context) ([]*repositories.TrashOrder, error) {
	return s.orderRepo.ListTrash(ctx)
}

func (s *OrderService) PermanentDeleteOrder(ctx context.Context, id string) error {
	r2Keys, err := s.orderRepo.PermanentDelete(ctx, id)
	if err != nil {
		return err
	}
	if len(r2Keys) > 0 && s.cfg != nil && s.cfg.R2AccountID != "" {
		_ = s.deleteR2Objects(ctx, r2Keys)
	}
	return nil
}

func (s *OrderService) deleteR2Objects(ctx context.Context, keys []string) error {
	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", s.cfg.R2AccountID)
	r2cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			s.cfg.R2AccessKey, s.cfg.R2SecretKey, "",
		)),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return err
	}
	client := s3.NewFromConfig(r2cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
	})
	for _, key := range keys {
		_, _ = client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(s.cfg.R2Bucket),
			Key:    aws.String(key),
		})
	}
	return nil
}
