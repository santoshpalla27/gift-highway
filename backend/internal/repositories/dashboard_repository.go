package repositories

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type DashboardRepository struct {
	db *sqlx.DB
}

func NewDashboardRepository(db *sqlx.DB) *DashboardRepository {
	return &DashboardRepository{db: db}
}

type TeamStats struct {
	TotalOrders            int `db:"total_orders"              json:"total_orders"`
	NewOrders              int `db:"new_orders"                json:"new_orders"`
	WorkingOrders          int `db:"working_orders"            json:"working_orders"`
	WaitingForClientOrders int `db:"waiting_for_client_orders" json:"waiting_for_client_orders"`
	MakingOrders           int `db:"making_orders"             json:"making_orders"`
	DoneOrders             int `db:"done_orders"               json:"done_orders"`
	DeliveredOrders        int `db:"delivered_orders"          json:"delivered_orders"`
	CancelledOrders        int `db:"cancelled_orders"          json:"cancelled_orders"`
	Overdue                int `db:"overdue"                   json:"overdue"`
	DueToday               int `db:"due_today"                 json:"due_today"`
	UnreadCustomer         int `db:"unread_customer"           json:"unread_customer"`
	StaleOrders            int `db:"stale_orders"              json:"stale_orders"`
}

type MyStats struct {
	TotalOrders            int `db:"total_orders"              json:"total_orders"`
	NewOrders              int `db:"new_orders"                json:"new_orders"`
	WorkingOrders          int `db:"working_orders"            json:"working_orders"`
	WaitingForClientOrders int `db:"waiting_for_client_orders" json:"waiting_for_client_orders"`
	MakingOrders           int `db:"making_orders"             json:"making_orders"`
	DoneOrders             int `db:"done_orders"               json:"done_orders"`
	DeliveredOrders        int `db:"delivered_orders"          json:"delivered_orders"`
	CancelledOrders        int `db:"cancelled_orders"          json:"cancelled_orders"`
	AssignedToMe           int `db:"assigned_to_me"            json:"assigned_to_me"`
	DueToday               int `db:"due_today"                 json:"due_today"`
	Overdue                int `db:"overdue"                   json:"overdue"`
	UnreadCustomer         int `db:"unread_customer"           json:"unread_customer"`
}

type DashboardOrder struct {
	ID            string    `db:"id"             json:"id"`
	OrderNumber   int       `db:"order_number"   json:"order_number"`
	Title         string    `db:"title"          json:"title"`
	CustomerName  string    `db:"customer_name"  json:"customer_name"`
	Status        string    `db:"status"         json:"status"`
	Priority      string    `db:"priority"       json:"priority"`
	DueDate       *string   `db:"due_date"       json:"due_date"`
	AssignedNames pq.StringArray `db:"assigned_names" json:"assigned_names"`
	UpdatedAt     time.Time `db:"updated_at"     json:"updated_at"`
}

type CustomerMessage struct {
	ID           int64     `db:"id"            json:"id"`
	OrderID      string    `db:"order_id"      json:"order_id"`
	OrderNumber  int       `db:"order_number"  json:"order_number"`
	OrderTitle   string    `db:"order_title"   json:"order_title"`
	Message      string    `db:"message"       json:"message"`
	PortalSender string    `db:"portal_sender" json:"portal_sender"`
	CreatedAt    time.Time `db:"created_at"    json:"created_at"`
}

const dashboardOrderSelect = `
	SELECT
		o.id, o.order_number, o.title, o.customer_name, o.status, o.priority,
		TO_CHAR(o.due_date, 'YYYY-MM-DD') as due_date,
		ARRAY(
			SELECT CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))
			FROM order_assignees oa2
			JOIN users u ON oa2.user_id = u.id
			WHERE oa2.order_id = o.id ORDER BY u.first_name
		) as assigned_names,
		o.updated_at
	FROM orders o
`

func (r *DashboardRepository) GetTeamStats(ctx context.Context, localDate string) (*TeamStats, error) {
	var s TeamStats
	err := r.db.GetContext(ctx, &s, `
		SELECT
			COUNT(*) AS total_orders,
			COUNT(*) FILTER (WHERE status = 'yet_to_start')       AS new_orders,
			COUNT(*) FILTER (WHERE status = 'working')             AS working_orders,
			COUNT(*) FILTER (WHERE status = 'waiting_for_client')  AS waiting_for_client_orders,
			COUNT(*) FILTER (WHERE status = 'making')              AS making_orders,
			COUNT(*) FILTER (WHERE status = 'done')                AS done_orders,
			COUNT(*) FILTER (WHERE status = 'delivered')           AS delivered_orders,
			COUNT(*) FILTER (WHERE status = 'cancelled')           AS cancelled_orders,
			COUNT(*) FILTER (WHERE due_date < $1::date AND status NOT IN ('done','delivered','cancelled')) AS overdue,
			COUNT(*) FILTER (WHERE due_date = $1::date AND status NOT IN ('done','delivered','cancelled')) AS due_today,
			(
				SELECT COUNT(DISTINCT order_id)
				FROM (
					SELECT DISTINCT ON (order_id) order_id, sender_type
					FROM portal_messages
					ORDER BY order_id, created_at DESC
				) latest
				WHERE sender_type = 'customer'
			) AS unread_customer,
			COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days' AND status NOT IN ('done','delivered','cancelled')) AS stale_orders
		FROM orders
		WHERE is_archived = false
	`, localDate)
	return &s, err
}

func (r *DashboardRepository) GetMyStats(ctx context.Context, userID, localDate string) (*MyStats, error) {
	var s MyStats
	err := r.db.GetContext(ctx, &s, `
		SELECT
			(SELECT COUNT(*) FROM order_assignees oa JOIN orders o ON o.id = oa.order_id WHERE oa.user_id = $1 AND o.is_archived = false) AS total_orders,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.status = 'yet_to_start' AND o.is_archived = false) AS new_orders,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.status = 'working' AND o.is_archived = false) AS working_orders,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.status = 'waiting_for_client' AND o.is_archived = false) AS waiting_for_client_orders,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.status = 'making' AND o.is_archived = false) AS making_orders,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.status = 'done' AND o.is_archived = false) AS done_orders,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.status = 'delivered' AND o.is_archived = false) AS delivered_orders,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.status = 'cancelled' AND o.is_archived = false) AS cancelled_orders,
			(SELECT COUNT(*) FROM order_assignees oa JOIN orders o ON o.id = oa.order_id WHERE oa.user_id = $1 AND o.is_archived = false) AS assigned_to_me,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.due_date = $2::date AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false) AS due_today,
			(SELECT COUNT(*) FROM orders o JOIN order_assignees oa ON o.id = oa.order_id
			 WHERE oa.user_id = $1 AND o.due_date < $2::date AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false) AS overdue,
			(
				SELECT COUNT(DISTINCT pm.order_id)
				FROM portal_messages pm
				JOIN order_assignees oa ON pm.order_id = oa.order_id
				WHERE oa.user_id = $1
				AND pm.sender_type = 'customer'
				AND NOT EXISTS (
					SELECT 1 FROM portal_messages pm2
					WHERE pm2.order_id = pm.order_id
					AND pm2.sender_type = 'staff'
					AND pm2.created_at > pm.created_at
				)
			) AS unread_customer
	`, userID, localDate)
	return &s, err
}

func (r *DashboardRepository) GetDueTodayOrders(ctx context.Context, localDate string) ([]DashboardOrder, error) {
	var orders []DashboardOrder
	err := r.db.SelectContext(ctx, &orders, dashboardOrderSelect+`
		WHERE o.due_date = $1::date AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false
		ORDER BY CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, o.order_number
		LIMIT 10
	`, localDate)
	return orders, err
}

func (r *DashboardRepository) GetOverdueOrders(ctx context.Context, localDate string) ([]DashboardOrder, error) {
	var orders []DashboardOrder
	err := r.db.SelectContext(ctx, &orders, dashboardOrderSelect+`
		WHERE o.due_date < $1::date AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false
		ORDER BY o.due_date ASC,
			CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
		LIMIT 15
	`, localDate)
	return orders, err
}

func (r *DashboardRepository) GetStaleOrders(ctx context.Context) ([]DashboardOrder, error) {
	var orders []DashboardOrder
	err := r.db.SelectContext(ctx, &orders, dashboardOrderSelect+`
		WHERE o.updated_at < NOW() - INTERVAL '7 days' AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false
		ORDER BY o.updated_at ASC
		LIMIT 10
	`)
	return orders, err
}

func (r *DashboardRepository) GetUnreadCustomerOrders(ctx context.Context) ([]DashboardOrder, error) {
	var orders []DashboardOrder
	err := r.db.SelectContext(ctx, &orders, dashboardOrderSelect+`
		WHERE o.id IN (
			SELECT order_id FROM (
				SELECT DISTINCT ON (order_id) order_id, sender_type
				FROM portal_messages
				ORDER BY order_id, created_at DESC
			) latest
			WHERE sender_type = 'customer'
		)
		AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false
		ORDER BY o.updated_at DESC
		LIMIT 15
	`)
	return orders, err
}

func (r *DashboardRepository) GetMyDueTodayOrders(ctx context.Context, userID, localDate string) ([]DashboardOrder, error) {
	var orders []DashboardOrder
	err := r.db.SelectContext(ctx, &orders, dashboardOrderSelect+`
		JOIN order_assignees oa ON o.id = oa.order_id
		WHERE oa.user_id = $1 AND o.due_date = $2::date AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false
		ORDER BY CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, o.order_number
		LIMIT 15
	`, userID, localDate)
	return orders, err
}

func (r *DashboardRepository) GetMyOverdueOrders(ctx context.Context, userID, localDate string) ([]DashboardOrder, error) {
	var orders []DashboardOrder
	err := r.db.SelectContext(ctx, &orders, dashboardOrderSelect+`
		JOIN order_assignees oa ON o.id = oa.order_id
		WHERE oa.user_id = $1 AND o.due_date < $2::date AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false
		ORDER BY o.due_date ASC,
			CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
		LIMIT 15
	`, userID, localDate)
	return orders, err
}

// ─── Admin user metrics ───────────────────────────────────────────────────────

type UserMetricRow struct {
	ID                     string `db:"id"                          json:"id"`
	Name                   string `db:"name"                        json:"name"`
	Email                  string `db:"email"                       json:"email"`
	Role                   string `db:"role"                        json:"role"`
	IsActive               bool   `db:"is_active"                   json:"is_active"`
	TotalAssigned          int    `db:"total_assigned"              json:"total_assigned"`
	NewCount               int    `db:"new_count"                   json:"new_count"`
	WorkingCount           int    `db:"working_count"               json:"working_count"`
	WaitingForClientCount  int    `db:"waiting_for_client_count"    json:"waiting_for_client_count"`
	MakingCount            int    `db:"making_count"                json:"making_count"`
	DoneCount              int    `db:"done_count"                  json:"done_count"`
	DeliveredCount         int    `db:"delivered_count"             json:"delivered_count"`
	CancelledCount         int    `db:"cancelled_count"             json:"cancelled_count"`
}

func (r *DashboardRepository) GetUserMetrics(ctx context.Context) ([]UserMetricRow, error) {
	var rows []UserMetricRow
	err := r.db.SelectContext(ctx, &rows, `
		SELECT
			u.id,
			TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')) AS name,
			u.email,
			u.role,
			u.is_active,
			COUNT(DISTINCT oa.order_id) FILTER (WHERE o.is_archived = false)                                                 AS total_assigned,
			COUNT(DISTINCT oa.order_id) FILTER (WHERE o.status = 'yet_to_start'       AND o.is_archived = false)             AS new_count,
			COUNT(DISTINCT oa.order_id) FILTER (WHERE o.status = 'working'             AND o.is_archived = false)             AS working_count,
			COUNT(DISTINCT oa.order_id) FILTER (WHERE o.status = 'waiting_for_client'  AND o.is_archived = false)             AS waiting_for_client_count,
			COUNT(DISTINCT oa.order_id) FILTER (WHERE o.status = 'making'              AND o.is_archived = false)             AS making_count,
			COUNT(DISTINCT oa.order_id) FILTER (WHERE o.status = 'done'                AND o.is_archived = false)             AS done_count,
			COUNT(DISTINCT oa.order_id) FILTER (WHERE o.status = 'delivered'           AND o.is_archived = false)             AS delivered_count,
			COUNT(DISTINCT oa.order_id) FILTER (WHERE o.status = 'cancelled'           AND o.is_archived = false)             AS cancelled_count
		FROM users u
		LEFT JOIN order_assignees oa ON oa.user_id = u.id
		LEFT JOIN orders o ON o.id = oa.order_id
		GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.is_active
		ORDER BY total_assigned DESC, u.first_name
	`)
	if rows == nil {
		rows = []UserMetricRow{}
	}
	return rows, err
}

func (r *DashboardRepository) GetMyUnreadCustomerOrders(ctx context.Context, userID string) ([]DashboardOrder, error) {
	var orders []DashboardOrder
	err := r.db.SelectContext(ctx, &orders, dashboardOrderSelect+`
		JOIN order_assignees oa ON o.id = oa.order_id
		WHERE oa.user_id = $1
		AND o.id IN (
			SELECT order_id FROM (
				SELECT DISTINCT ON (order_id) order_id, sender_type
				FROM portal_messages
				ORDER BY order_id, created_at DESC
			) latest
			WHERE sender_type = 'customer'
		)
		AND o.status NOT IN ('done','delivered','cancelled') AND o.is_archived = false
		ORDER BY o.updated_at DESC
		LIMIT 15
	`, userID)
	return orders, err
}
