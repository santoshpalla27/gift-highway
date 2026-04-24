package repositories

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/company/app/backend/internal/models"
	"github.com/jmoiron/sqlx"
)

type OrderFilter struct {
	Search     string
	Status     string
	Priority   string
	AssignedTo string
	DueFrom    string
	DueTo      string
	Page       int
	Limit      int
	SortBy     string // created_at | updated_at | due_date | order_number
	SortDir    string // asc | desc
}

type OrderRepository struct {
	db *sqlx.DB
}

func NewOrderRepository(db *sqlx.DB) *OrderRepository {
	return &OrderRepository{db: db}
}

const orderSelectBase = `
	SELECT
		o.id, o.order_number, o.title, o.description, o.customer_name, o.contact_number,
		o.status, o.priority, o.created_by, o.due_date, o.due_time,
		o.is_archived, o.archived_at, o.archived_by, o.created_at, o.updated_at,
		ARRAY(
			SELECT oa.user_id::text
			FROM order_assignees oa
			JOIN users u ON oa.user_id = u.id
			WHERE oa.order_id = o.id
			ORDER BY u.first_name
		) as assigned_to,
		ARRAY(
			SELECT CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))
			FROM order_assignees oa
			JOIN users u ON oa.user_id = u.id
			WHERE oa.order_id = o.id
			ORDER BY u.first_name
		) as assigned_names,
		CONCAT(cu.first_name, ' ', COALESCE(cu.last_name, '')) as created_by_name,
		CASE WHEN o.archived_by IS NOT NULL
			THEN TRIM(CONCAT(au.first_name, ' ', COALESCE(au.last_name, '')))
			ELSE NULL
		END as archived_by_name
	FROM orders o
	LEFT JOIN users cu ON o.created_by = cu.id
	LEFT JOIN users au ON o.archived_by = au.id
`

func (r *OrderRepository) buildWhere(f OrderFilter) (string, []interface{}) {
	var conditions []string
	var args []interface{}
	idx := 1

	if f.Search != "" {
		// Strip leading '#' so "#1042" matches order_number 1042
		numSearch := strings.TrimPrefix(f.Search, "#")
		conditions = append(conditions, fmt.Sprintf(
			"(o.title ILIKE $%d OR o.customer_name ILIKE $%d OR CAST(o.order_number AS TEXT) ILIKE $%d)",
			idx, idx+1, idx+2,
		))
		args = append(args, "%"+f.Search+"%", "%"+f.Search+"%", "%"+numSearch+"%")
		idx += 3
	}
	if f.Status != "" {
		conditions = append(conditions, fmt.Sprintf("o.status = $%d", idx))
		args = append(args, f.Status)
		idx++
	}
	if f.Priority != "" {
		conditions = append(conditions, fmt.Sprintf("o.priority = $%d", idx))
		args = append(args, f.Priority)
		idx++
	}
	if f.AssignedTo != "" {
		conditions = append(conditions, fmt.Sprintf(
			"EXISTS (SELECT 1 FROM order_assignees oa WHERE oa.order_id = o.id AND oa.user_id = $%d)", idx,
		))
		args = append(args, f.AssignedTo)
		idx++
	}
	if f.DueFrom != "" {
		conditions = append(conditions, fmt.Sprintf("o.due_date >= $%d", idx))
		args = append(args, f.DueFrom)
		idx++
	}
	if f.DueTo != "" {
		conditions = append(conditions, fmt.Sprintf("o.due_date <= $%d", idx))
		args = append(args, f.DueTo)
		idx++
	}
	_ = idx

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}
	return where, args
}

func (r *OrderRepository) List(ctx context.Context, f OrderFilter) ([]*models.OrderWithNames, int, error) {
	where, args := r.buildWhere(f)

	// Active list always excludes archived orders
	archiveFilter := "AND o.is_archived = false"
	if where == "" {
		where = "WHERE o.is_archived = false"
		archiveFilter = ""
	}

	var total int
	if err := r.db.GetContext(ctx, &total, "SELECT COUNT(*) FROM orders o "+where+" "+archiveFilter, args...); err != nil {
		return nil, 0, err
	}

	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	page := f.Page
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * limit

	sortCols := map[string]string{
		"created_at":   "o.created_at",
		"updated_at":   "o.updated_at",
		"due_date":     "o.due_date",
		"order_number": "o.order_number",
	}
	sortCol := "o.created_at"
	if col, ok := sortCols[f.SortBy]; ok {
		sortCol = col
	}
	sortDir := "DESC"
	if strings.EqualFold(f.SortDir, "asc") {
		sortDir = "ASC"
	}
	nullsLast := ""
	if f.SortBy == "due_date" {
		nullsLast = " NULLS LAST"
	}
	query := orderSelectBase + where + " " + archiveFilter + fmt.Sprintf(" ORDER BY %s %s%s LIMIT $%d OFFSET $%d", sortCol, sortDir, nullsLast, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	var orders []*models.OrderWithNames
	if err := r.db.SelectContext(ctx, &orders, query, args...); err != nil {
		return nil, 0, err
	}
	return orders, total, nil
}

func (r *OrderRepository) GetByID(ctx context.Context, id string) (*models.OrderWithNames, error) {
	o := &models.OrderWithNames{}
	err := r.db.GetContext(ctx, o, orderSelectBase+"WHERE o.id = $1", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return o, err
}

func (r *OrderRepository) Create(ctx context.Context, o *models.Order, assignedTo []string) (*models.OrderWithNames, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO orders (id, title, description, customer_name, contact_number, status, priority, created_by, due_date, due_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, o.ID, o.Title, o.Description, o.CustomerName, o.ContactNumber, o.Status, o.Priority, o.CreatedBy, o.DueDate, o.DueTime)
	if err != nil {
		return nil, err
	}

	for _, uid := range assignedTo {
		if uid == "" {
			continue
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO order_assignees (order_id, user_id) VALUES ($1, $2)`, o.ID, uid); err != nil {
			return nil, err
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetByID(ctx, o.ID)
}

func (r *OrderRepository) Update(ctx context.Context, id, title, description, customerName, contactNumber, priority string, assignedTo []string, dueDate *string, dueTime *string) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var dd interface{}
	if dueDate != nil && *dueDate != "" {
		dd = *dueDate
	}
	var dt interface{}
	if dueTime != nil && *dueTime != "" {
		dt = *dueTime
	}
	_, err = tx.ExecContext(ctx, `
		UPDATE orders SET title=$1, description=$2, customer_name=$3, contact_number=$4, priority=$5, due_date=$6, due_time=$7, updated_at=NOW()
		WHERE id=$8
	`, title, description, customerName, contactNumber, priority, dd, dt, id)
	if err != nil {
		return err
	}

	if _, err = tx.ExecContext(ctx, `DELETE FROM order_assignees WHERE order_id = $1`, id); err != nil {
		return err
	}

	for _, uid := range assignedTo {
		if uid == "" {
			continue
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO order_assignees (order_id, user_id) VALUES ($1, $2)`, id, uid); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *OrderRepository) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2
	`, status, id)
	return err
}

// Archive marks an order as archived.
func (r *OrderRepository) Archive(ctx context.Context, id, archivedBy string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE orders SET is_archived=true, archived_at=NOW(), archived_by=$1, updated_at=NOW()
		WHERE id=$2 AND is_archived=false
	`, archivedBy, id)
	return err
}

// Restore un-archives an order.
func (r *OrderRepository) Restore(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE orders SET is_archived=false, archived_at=NULL, archived_by=NULL, updated_at=NOW()
		WHERE id=$1
	`, id)
	return err
}

// TrashOrder is a lightweight struct for the trash list.
type TrashOrder struct {
	ID             string  `db:"id"              json:"id"`
	OrderNumber    int     `db:"order_number"    json:"order_number"`
	Title          string  `db:"title"           json:"title"`
	CustomerName   string  `db:"customer_name"   json:"customer_name"`
	Status         string  `db:"status"          json:"status"`
	ArchivedAt     *string `db:"archived_at"     json:"archived_at"`
	ArchivedByName *string `db:"archived_by_name" json:"archived_by_name"`
	CompletedDate  *string `db:"completed_date"  json:"completed_date"`
}

// ListTrash returns all archived orders.
func (r *OrderRepository) ListTrash(ctx context.Context) ([]*TrashOrder, error) {
	var orders []*TrashOrder
	err := r.db.SelectContext(ctx, &orders, `
		SELECT
			o.id, o.order_number, o.title, o.customer_name, o.status,
			TO_CHAR(o.archived_at, 'YYYY-MM-DD HH24:MI') AS archived_at,
			CASE WHEN o.archived_by IS NOT NULL
				THEN TRIM(CONCAT(au.first_name, ' ', COALESCE(au.last_name, '')))
				ELSE NULL
			END AS archived_by_name,
			NULL::text AS completed_date
		FROM orders o
		LEFT JOIN users au ON o.archived_by = au.id
		WHERE o.is_archived = true
		ORDER BY o.archived_at DESC
	`)
	return orders, err
}

// PermanentDelete deletes an order and all related data from the database.
// All child tables have ON DELETE CASCADE so deleting the order handles everything.
// R2 file keys are returned so the caller can delete them from storage.
func (r *OrderRepository) PermanentDelete(ctx context.Context, id string) ([]string, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Collect R2 keys before deletion
	var r2Keys []string
	var attKeys []string
	if err := tx.SelectContext(ctx, &attKeys, `SELECT file_key FROM order_attachments WHERE order_id=$1`, id); err == nil {
		r2Keys = append(r2Keys, attKeys...)
	}
	var portalKeys []string
	if err := tx.SelectContext(ctx, &portalKeys, `SELECT s3_key FROM portal_attachments WHERE order_id=$1`, id); err == nil {
		r2Keys = append(r2Keys, portalKeys...)
	}

	// CASCADE handles all child rows — just delete the order
	if _, err := tx.ExecContext(ctx, `DELETE FROM orders WHERE id=$1`, id); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r2Keys, nil
}
