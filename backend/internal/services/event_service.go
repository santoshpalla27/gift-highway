package services

import (
	"context"
	"regexp"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
)

var mentionRe = regexp.MustCompile(`@\[([^\]]+)\]`)

func parseMentionNames(text string) []string {
	matches := mentionRe.FindAllStringSubmatch(text, -1)
	names := make([]string, 0, len(matches))
	seen := make(map[string]bool)
	for _, m := range matches {
		if !seen[m[1]] {
			names = append(names, m[1])
			seen[m[1]] = true
		}
	}
	return names
}

type EventService struct {
	repo     *repositories.EventRepository
	userRepo *repositories.UserRepository
}

func NewEventService(repo *repositories.EventRepository, userRepo *repositories.UserRepository) *EventService {
	return &EventService{repo: repo, userRepo: userRepo}
}

func (s *EventService) Record(ctx context.Context, orderID string, actorID *string, eventType string, payload interface{}) (*models.OrderEvent, error) {
	return s.repo.Create(ctx, orderID, actorID, eventType, payload)
}

func (s *EventService) AddComment(ctx context.Context, orderID, actorID, text string) (*models.OrderEvent, error) {
	event, err := s.repo.Create(ctx, orderID, &actorID, models.EvtCommentAdded, map[string]string{"text": text})
	if err != nil {
		return nil, err
	}

	names := parseMentionNames(text)
	if len(names) > 0 {
		mentioned, _ := s.userRepo.FindByFullNames(ctx, names)
		for _, u := range mentioned {
			if u.ID == actorID {
				continue
			}
			_, _ = s.repo.Create(ctx, orderID, &actorID, models.EvtUserMentioned, map[string]string{
				"mentioned_user_id":   u.ID,
				"mentioned_user_name": u.FullName,
				"text":                text,
			})
		}
	}

	return event, nil
}

func (s *EventService) GetEvent(ctx context.Context, eventID string) (*models.OrderEvent, error) {
	return s.repo.GetByID(ctx, eventID)
}

func (s *EventService) EditComment(ctx context.Context, eventID, newText string) error {
	return s.repo.UpdateComment(ctx, eventID, newText)
}

func (s *EventService) DeleteComment(ctx context.Context, eventID string) error {
	return s.repo.Delete(ctx, eventID)
}

func (s *EventService) ListEvents(ctx context.Context, orderID string, page, limit int, sort string) ([]*models.OrderEvent, int, error) {
	if limit <= 0 {
		limit = 30
	}
	if page <= 0 {
		page = 1
	}
	if sort != "desc" {
		sort = "asc"
	}
	return s.repo.ListByOrder(ctx, orderID, limit, (page-1)*limit, sort)
}
