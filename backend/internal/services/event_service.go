package services

import (
	"context"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
)

type EventService struct {
	repo *repositories.EventRepository
}

func NewEventService(repo *repositories.EventRepository) *EventService {
	return &EventService{repo: repo}
}

func (s *EventService) Record(ctx context.Context, orderID string, actorID *string, eventType string, payload interface{}) (*models.OrderEvent, error) {
	return s.repo.Create(ctx, orderID, actorID, eventType, payload)
}

func (s *EventService) AddComment(ctx context.Context, orderID, actorID, text string) (*models.OrderEvent, error) {
	return s.repo.Create(ctx, orderID, &actorID, models.EvtCommentAdded, map[string]string{"text": text})
}

func (s *EventService) ListEvents(ctx context.Context, orderID string, page, limit int) ([]*models.OrderEvent, int, error) {
	if limit <= 0 {
		limit = 50
	}
	if page <= 0 {
		page = 1
	}
	return s.repo.ListByOrder(ctx, orderID, limit, (page-1)*limit)
}
