package services

import (
	"context"

	"github.com/company/app/backend/internal/repositories"
)

type DashboardService struct {
	repo *repositories.DashboardRepository
}

func NewDashboardService(repo *repositories.DashboardRepository) *DashboardService {
	return &DashboardService{repo: repo}
}

type TeamDashboard struct {
	Stats                *repositories.TeamStats       `json:"stats"`
	DueTodayList         []repositories.DashboardOrder `json:"due_today_list"`
	OverdueOrders        []repositories.DashboardOrder `json:"overdue_orders"`
	StaleOrders          []repositories.DashboardOrder `json:"stale_orders"`
	UnreadCustomerOrders []repositories.DashboardOrder `json:"unread_customer_orders"`
}

type MyDashboard struct {
	Stats                *repositories.MyStats         `json:"stats"`
	DueTodayList         []repositories.DashboardOrder `json:"due_today_list"`
	OverdueOrders        []repositories.DashboardOrder `json:"overdue_orders"`
	UnreadCustomerOrders []repositories.DashboardOrder `json:"unread_customer_orders"`
}

func (s *DashboardService) GetTeamDashboard(ctx context.Context, localDate string) (*TeamDashboard, error) {
	stats, err := s.repo.GetTeamStats(ctx, localDate)
	if err != nil {
		return nil, err
	}
	dueToday, err := s.repo.GetDueTodayOrders(ctx, localDate)
	if err != nil {
		return nil, err
	}
	overdue, err := s.repo.GetOverdueOrders(ctx, localDate)
	if err != nil {
		return nil, err
	}
	stale, err := s.repo.GetStaleOrders(ctx)
	if err != nil {
		return nil, err
	}
	unread, err := s.repo.GetUnreadCustomerOrders(ctx)
	if err != nil {
		return nil, err
	}
	if dueToday == nil {
		dueToday = []repositories.DashboardOrder{}
	}
	if overdue == nil {
		overdue = []repositories.DashboardOrder{}
	}
	if stale == nil {
		stale = []repositories.DashboardOrder{}
	}
	if unread == nil {
		unread = []repositories.DashboardOrder{}
	}
	return &TeamDashboard{
		Stats:                stats,
		DueTodayList:         dueToday,
		OverdueOrders:        overdue,
		StaleOrders:          stale,
		UnreadCustomerOrders: unread,
	}, nil
}

func (s *DashboardService) GetMyDashboard(ctx context.Context, userID, localDate string) (*MyDashboard, error) {
	stats, err := s.repo.GetMyStats(ctx, userID, localDate)
	if err != nil {
		return nil, err
	}
	dueToday, err := s.repo.GetMyDueTodayOrders(ctx, userID, localDate)
	if err != nil {
		return nil, err
	}
	overdue, err := s.repo.GetMyOverdueOrders(ctx, userID, localDate)
	if err != nil {
		return nil, err
	}
	unread, err := s.repo.GetMyUnreadCustomerOrders(ctx, userID)
	if err != nil {
		return nil, err
	}
	if dueToday == nil {
		dueToday = []repositories.DashboardOrder{}
	}
	if overdue == nil {
		overdue = []repositories.DashboardOrder{}
	}
	if unread == nil {
		unread = []repositories.DashboardOrder{}
	}
	return &MyDashboard{
		Stats:                stats,
		DueTodayList:         dueToday,
		OverdueOrders:        overdue,
		UnreadCustomerOrders: unread,
	}, nil
}
