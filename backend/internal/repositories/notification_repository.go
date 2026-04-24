package repositories

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// NotificationEvent is a raw event row enriched with order info.
type NotificationEvent struct {
	ID          string          `db:"id"`
	OrderID     string          `db:"order_id"`
	OrderTitle  string          `db:"order_title"`
	OrderNumber int             `db:"order_number"`
	Type        string          `db:"type"`
	ActorID     *string         `db:"actor_id"`
	ActorName   string          `db:"actor_name"`
	Payload     json.RawMessage `db:"payload"`
	CreatedAt   time.Time       `db:"created_at"`
}

// notifiableTypes are the event types that generate notifications.
var notifiableTypes = []string{
	"comment_added",
	"attachment_added",
	"status_changed",
	"due_date_changed",
	"priority_changed",
	"assignees_changed",
	"customer_message",
	"customer_attachment",
	"staff_portal_reply",
	"order_updated",
}

type NotificationRepository struct {
	db *sqlx.DB
}

func NewNotificationRepository(db *sqlx.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

// GetUnreadEvents returns all unread notifiable events for a user.
func (r *NotificationRepository) GetUnreadEvents(ctx context.Context, userID string) ([]*NotificationEvent, error) {
	query := `
		SELECT e.id, e.order_id, e.type, e.actor_id, e.payload, e.created_at,
		       o.title AS order_title, o.order_number,
		       TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS actor_name
		FROM order_events e
		JOIN orders o ON e.order_id = o.id
		LEFT JOIN users u ON e.actor_id = u.id
		LEFT JOIN notification_reads nr ON nr.user_id::text = $1 AND nr.order_id = e.order_id
		WHERE e.type = ANY($2)
		  AND (e.actor_id IS NULL OR e.actor_id::text != $1)
		  AND e.created_at > COALESCE(nr.last_seen_at, '1970-01-01 00:00:00 UTC'::timestamptz)
		ORDER BY e.created_at DESC
		LIMIT 500
	`
	var events []*NotificationEvent
	err := r.db.SelectContext(ctx, &events, query, userID, pq.Array(notifiableTypes))
	return events, err
}

// GetHistoryEvents returns all notifiable events (read + unread) for the history page.
func (r *NotificationRepository) GetHistoryEvents(ctx context.Context, userID string, limit, offset int) ([]*NotificationEvent, int, error) {
	query := `
		SELECT e.id, e.order_id, e.type, e.actor_id, e.payload, e.created_at,
		       o.title AS order_title, o.order_number,
		       TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS actor_name
		FROM order_events e
		JOIN orders o ON e.order_id = o.id
		LEFT JOIN users u ON e.actor_id = u.id
		WHERE e.type = ANY($1)
		  AND (e.actor_id IS NULL OR e.actor_id::text != $2)
		ORDER BY e.created_at DESC
		LIMIT $3 OFFSET $4
	`
	var events []*NotificationEvent
	err := r.db.SelectContext(ctx, &events, query, pq.Array(notifiableTypes), userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	var total int
	err = r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM order_events
		 WHERE type = ANY($1) AND (actor_id IS NULL OR actor_id::text != $2)`,
		pq.Array(notifiableTypes), userID,
	).Scan(&total)
	return events, total, err
}

// GetLastSeenAt returns the last_seen_at timestamp for a user/order pair, or nil if never seen.
func (r *NotificationRepository) GetLastSeenAt(ctx context.Context, userID, orderID string) (*time.Time, error) {
	var t time.Time
	err := r.db.QueryRowContext(ctx,
		`SELECT last_seen_at FROM notification_reads WHERE user_id::text = $1 AND order_id::text = $2`,
		userID, orderID,
	).Scan(&t)
	if err != nil {
		// No row = never seen
		return nil, nil //nolint:nilerr
	}
	return &t, nil
}

// MarkOrderRead upserts last_seen_at = NOW() for the given user/order.
func (r *NotificationRepository) MarkOrderRead(ctx context.Context, userID, orderID string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO notification_reads (user_id, order_id, last_seen_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (user_id, order_id) DO UPDATE
		    SET last_seen_at = NOW(), updated_at = NOW()
	`, userID, orderID)
	return err
}

// MarkAllRead marks every order as read for the given user.
func (r *NotificationRepository) MarkAllRead(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO notification_reads (user_id, order_id, last_seen_at, updated_at)
		SELECT $1, id, NOW(), NOW() FROM orders
		ON CONFLICT (user_id, order_id) DO UPDATE
		    SET last_seen_at = NOW(), updated_at = NOW()
	`, userID)
	return err
}

// OrderNotificationSummary holds per-order notification counts for the summary table.
type OrderNotificationSummary struct {
	OrderID     string    `db:"order_id"`
	OrderNumber int       `db:"order_number"`
	OrderTitle  string    `db:"order_title"`
	TotalCount  int       `db:"total_count"`
	UnreadCount int       `db:"unread_count"`
	LastEventAt time.Time `db:"last_event_at"`
}

// GetOrderSummaries returns one row per order that has notifiable events, with total and unread counts.
func (r *NotificationRepository) GetOrderSummaries(ctx context.Context, userID string) ([]*OrderNotificationSummary, error) {
	query := `
		SELECT
		    o.id AS order_id,
		    o.order_number,
		    o.title AS order_title,
		    COUNT(e.id) AS total_count,
		    COUNT(e.id) FILTER (
		        WHERE e.created_at > COALESCE(nr.last_seen_at, '1970-01-01 00:00:00 UTC'::timestamptz)
		    ) AS unread_count,
		    MAX(e.created_at) AS last_event_at
		FROM orders o
		JOIN order_events e ON e.order_id = o.id
		LEFT JOIN notification_reads nr ON nr.user_id::text = $1 AND nr.order_id = o.id
		WHERE e.type = ANY($2)
		  AND (e.actor_id IS NULL OR e.actor_id::text != $1)
		GROUP BY o.id, o.order_number, o.title
		HAVING COUNT(e.id) > 0
		ORDER BY MAX(e.created_at) DESC
	`
	var summaries []*OrderNotificationSummary
	err := r.db.SelectContext(ctx, &summaries, query, userID, pq.Array(notifiableTypes))
	return summaries, err
}

// GetOrderNotificationEvents returns all notifiable events for a single order, excluding the viewer's own actions.
func (r *NotificationRepository) GetOrderNotificationEvents(ctx context.Context, userID, orderID string) ([]*NotificationEvent, error) {
	query := `
		SELECT e.id, e.order_id, e.type, e.actor_id, e.payload, e.created_at,
		       o.title AS order_title, o.order_number,
		       TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS actor_name
		FROM order_events e
		JOIN orders o ON e.order_id = o.id
		LEFT JOIN users u ON e.actor_id = u.id
		WHERE e.order_id = $1
		  AND e.type = ANY($2)
		  AND (e.actor_id IS NULL OR e.actor_id::text != $3)
		ORDER BY e.created_at DESC
	`
	var events []*NotificationEvent
	err := r.db.SelectContext(ctx, &events, query, orderID, pq.Array(notifiableTypes), userID)
	return events, err
}
