package repositories

import (
	"context"
	"encoding/json"

	"github.com/company/app/backend/internal/models"
	"github.com/jmoiron/sqlx"
)

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

func (r *EventRepository) Delete(ctx context.Context, eventID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM order_events WHERE id = $1`, eventID)
	return err
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
