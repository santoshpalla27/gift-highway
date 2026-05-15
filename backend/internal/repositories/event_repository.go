package repositories

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/company/app/backend/internal/models"
	"github.com/jmoiron/sqlx"
)

type ActivityEvent struct {
	ID          string          `db:"id"           json:"id"`
	OrderID     string          `db:"order_id"     json:"order_id"`
	OrderNumber int             `db:"order_number" json:"order_number"`
	OrderTitle  string          `db:"order_title"  json:"order_title"`
	Type        string          `db:"type"         json:"type"`
	ActorName   string          `db:"actor_name"   json:"actor_name"`
	Payload     json.RawMessage `db:"payload"      json:"payload"`
	CreatedAt   time.Time       `db:"created_at"   json:"created_at"`
}

const eventSelectSQL = `
	SELECT
		e.id, e.order_id, e.type, e.actor_id, e.payload, e.created_at,
		COALESCE(CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')), 'System') AS actor_name
	FROM order_events e
	LEFT JOIN users u ON e.actor_id = u.id
`

type EventRepository struct {
	db *sqlx.DB
}

func NewEventRepository(db *sqlx.DB) *EventRepository {
	return &EventRepository{db: db}
}

func (r *EventRepository) Create(ctx context.Context, orderID string, actorID *string, eventType string, payload interface{}) (*models.OrderEvent, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	e := &models.OrderEvent{}
	err = r.db.QueryRowxContext(ctx, `
		WITH ins AS (
			INSERT INTO order_events (order_id, actor_id, type, payload)
			VALUES ($1, $2, $3, $4)
			RETURNING *
		)
		SELECT
			ins.id, ins.order_id, ins.type, ins.actor_id, ins.payload, ins.created_at,
			COALESCE(CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')), 'System') AS actor_name
		FROM ins
		LEFT JOIN users u ON ins.actor_id = u.id
	`, orderID, actorID, eventType, data).StructScan(e)
	return e, err
}

func (r *EventRepository) GetByID(ctx context.Context, eventID string) (*models.OrderEvent, error) {
	e := &models.OrderEvent{}
	err := r.db.QueryRowxContext(ctx,
		eventSelectSQL+`WHERE e.id = $1`, eventID,
	).StructScan(e)
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (r *EventRepository) UpdateComment(ctx context.Context, eventID, newText string) error {
	data, err := json.Marshal(map[string]string{"text": newText})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx,
		`UPDATE order_events SET payload=$1 WHERE id=$2 AND type='comment_added'`, data, eventID)
	return err
}

func (r *EventRepository) UpdateTypeAndPayload(ctx context.Context, eventID, eventType string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `UPDATE order_events SET type=$1, payload=$2 WHERE id=$3`, eventType, data, eventID)
	return err
}

func (r *EventRepository) Delete(ctx context.Context, eventID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM order_events WHERE id = $1`, eventID)
	return err
}

func (r *EventRepository) ListAllEvents(ctx context.Context, orderTitle, eventType, dateFrom, dateTo string, limit, offset int) ([]*ActivityEvent, int, error) {
	const baseCount = `SELECT COUNT(*) FROM order_events e JOIN orders o ON e.order_id = o.id`
	const baseList = `
		SELECT e.id, e.order_id, o.order_number, o.title AS order_title,
		       e.type, e.payload, e.created_at,
		       COALESCE(TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))), 'System') AS actor_name
		FROM order_events e
		JOIN orders o ON e.order_id = o.id
		LEFT JOIN users u ON e.actor_id = u.id
	`

	var conds []string
	var args []interface{}

	if orderTitle != "" {
		args = append(args, orderTitle)
		conds = append(conds, fmt.Sprintf("o.title ILIKE $%d", len(args)))
	}
	if eventType != "" {
		args = append(args, eventType)
		conds = append(conds, fmt.Sprintf("e.type = $%d", len(args)))
	}
	if dateFrom != "" {
		args = append(args, dateFrom)
		conds = append(conds, fmt.Sprintf("e.created_at >= $%d::timestamptz", len(args)))
	}
	if dateTo != "" {
		args = append(args, dateTo)
		conds = append(conds, fmt.Sprintf("e.created_at <= $%d::timestamptz", len(args)))
	}

	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	var total int
	if err := r.db.GetContext(ctx, &total, baseCount+where, args...); err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	var events []*ActivityEvent
	err := r.db.SelectContext(ctx, &events,
		baseList+where+fmt.Sprintf(" ORDER BY e.created_at DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args)),
		args...)
	return events, total, err
}

func (r *EventRepository) ListByOrder(ctx context.Context, orderID string, limit, offset int, sort string) ([]*models.OrderEvent, int, error) {
	var total int
	if err := r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM order_events WHERE order_id = $1`, orderID); err != nil {
		return nil, 0, err
	}

	direction := "ASC"
	if sort == "desc" {
		direction = "DESC"
	}

	var events []*models.OrderEvent
	query := eventSelectSQL + `WHERE e.order_id = $1 ORDER BY e.created_at ` + direction + ` LIMIT $2 OFFSET $3`
	err := r.db.SelectContext(ctx, &events, query, orderID, limit, offset)
	return events, total, err
}
