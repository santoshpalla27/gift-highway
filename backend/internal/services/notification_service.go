package services

import (
	"context"
	"encoding/json"
	"time"

	"github.com/company/app/backend/internal/repositories"
)

// ── Response types ────────────────────────────────────────────────────────────

type NotificationEventItem struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	ActorName string          `json:"actor_name"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt string          `json:"created_at"`
	Priority  string          `json:"priority"`
}

type NotificationGroup struct {
	OrderID     string                  `json:"order_id"`
	OrderNumber int                     `json:"order_number"`
	OrderTitle  string                  `json:"order_title"`
	UnreadCount int                     `json:"unread_count"`
	Events      []NotificationEventItem `json:"events"`
	LastEventAt string                  `json:"last_event_at"`
}

type OrderSummaryItem struct {
	OrderID     string `json:"order_id"`
	OrderNumber int    `json:"order_number"`
	OrderTitle  string `json:"order_title"`
	TotalCount  int    `json:"total_count"`
	UnreadCount int    `json:"unread_count"`
	LastEventAt string `json:"last_event_at"`
}

// ── Priority mapping ──────────────────────────────────────────────────────────

var highPriority = map[string]bool{
	"customer_message":    true,
	"customer_attachment": true,
	"assignees_changed":   true,
}

var lowPriority = map[string]bool{
	"order_updated":    true,
	"priority_changed": true,
}

func priorityFor(t string) string {
	if highPriority[t] {
		return "high"
	}
	if lowPriority[t] {
		return "low"
	}
	return "medium"
}

// ── Service ───────────────────────────────────────────────────────────────────

type NotificationService struct {
	repo *repositories.NotificationRepository
}

func NewNotificationService(repo *repositories.NotificationRepository) *NotificationService {
	return &NotificationService{repo: repo}
}

// GetUnreadGroups returns unread notification groups for the bell dropdown.
// mineOnly: only my orders. othersOnly: only orders not mine.
func (s *NotificationService) GetUnreadGroups(ctx context.Context, userID string, mineOnly, othersOnly bool) ([]*NotificationGroup, int, error) {
	events, err := s.repo.GetUnreadEvents(ctx, userID, mineOnly, othersOnly)
	if err != nil {
		return nil, 0, err
	}
	groups := groupEvents(events)
	total := 0
	for _, g := range groups {
		total += g.UnreadCount
	}
	return groups, total, nil
}

// GetHistoryGroups returns all notifiable events grouped by order for the history page.
func (s *NotificationService) GetHistoryGroups(ctx context.Context, userID string, page int) ([]*NotificationGroup, int, error) {
	const limit = 50
	offset := (page - 1) * limit
	events, total, err := s.repo.GetHistoryEvents(ctx, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	return groupEvents(events), total, nil
}

// GetLastSeenAt returns the last_seen_at for a user+order (nil if never viewed).
func (s *NotificationService) GetLastSeenAt(ctx context.Context, userID, orderID string) (*time.Time, error) {
	return s.repo.GetLastSeenAt(ctx, userID, orderID)
}

// MarkOrderRead marks all events for an order as read for this user.
func (s *NotificationService) MarkOrderRead(ctx context.Context, userID, orderID string) error {
	return s.repo.MarkOrderRead(ctx, userID, orderID)
}

// MarkAllRead marks every order as read for this user.
func (s *NotificationService) MarkAllRead(ctx context.Context, userID string) error {
	return s.repo.MarkAllRead(ctx, userID)
}

// GetOrderSummaries returns per-order notification counts for the summary table.
func (s *NotificationService) GetOrderSummaries(ctx context.Context, userID string) ([]*OrderSummaryItem, error) {
	rows, err := s.repo.GetOrderSummaries(ctx, userID)
	if err != nil {
		return nil, err
	}
	result := make([]*OrderSummaryItem, len(rows))
	for i, r := range rows {
		result[i] = &OrderSummaryItem{
			OrderID:     r.OrderID,
			OrderNumber: r.OrderNumber,
			OrderTitle:  r.OrderTitle,
			TotalCount:  r.TotalCount,
			UnreadCount: r.UnreadCount,
			LastEventAt: r.LastEventAt.UTC().Format(time.RFC3339),
		}
	}
	return result, nil
}

// GetOrderNotificationEvents returns all notifiable events for a single order.
func (s *NotificationService) GetOrderNotificationEvents(ctx context.Context, userID, orderID string) ([]NotificationEventItem, error) {
	events, err := s.repo.GetOrderNotificationEvents(ctx, userID, orderID)
	if err != nil {
		return nil, err
	}
	result := make([]NotificationEventItem, len(events))
	for i, e := range events {
		result[i] = NotificationEventItem{
			ID:        e.ID,
			Type:      e.Type,
			ActorName: e.ActorName,
			Payload:   e.Payload,
			CreatedAt: e.CreatedAt.UTC().Format(time.RFC3339),
			Priority:  priorityFor(e.Type),
		}
	}
	return result, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func groupEvents(events []*repositories.NotificationEvent) []*NotificationGroup {
	groupMap := make(map[string]*NotificationGroup)
	var order []string

	for _, e := range events {
		if _, ok := groupMap[e.OrderID]; !ok {
			groupMap[e.OrderID] = &NotificationGroup{
				OrderID:     e.OrderID,
				OrderNumber: e.OrderNumber,
				OrderTitle:  e.OrderTitle,
				LastEventAt: e.CreatedAt.UTC().Format(time.RFC3339),
			}
			order = append(order, e.OrderID)
		}
		g := groupMap[e.OrderID]
		g.UnreadCount++
		if len(g.Events) < 3 {
			g.Events = append(g.Events, NotificationEventItem{
				ID:        e.ID,
				Type:      e.Type,
				ActorName: e.ActorName,
				Payload:   e.Payload,
				CreatedAt: e.CreatedAt.UTC().Format(time.RFC3339),
				Priority:  priorityFor(e.Type),
			})
		}
	}

	result := make([]*NotificationGroup, 0, len(order))
	for _, id := range order {
		result = append(result, groupMap[id])
	}
	return result
}
