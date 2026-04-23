package repositories

import (
	"context"
	"crypto/rand"
	"encoding/hex"

	"github.com/company/app/backend/internal/models"
	"github.com/jmoiron/sqlx"
)

type PortalRepository struct {
	db *sqlx.DB
}

func NewPortalRepository(db *sqlx.DB) *PortalRepository {
	return &PortalRepository{db: db}
}

func generatePortalToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ── Portal ────────────────────────────────────────────────────────────────────

func (r *PortalRepository) Create(ctx context.Context, orderID, customerName string) (*models.CustomerPortal, error) {
	token, err := generatePortalToken()
	if err != nil {
		return nil, err
	}
	var p models.CustomerPortal
	err = r.db.QueryRowxContext(ctx, `
		INSERT INTO customer_portals (order_id, token, customer_name, enabled)
		VALUES ($1, $2, $3, true)
		RETURNING id, order_id, token, customer_name, enabled, created_at
	`, orderID, token, customerName).StructScan(&p)
	return &p, err
}

func (r *PortalRepository) GetByToken(ctx context.Context, token string) (*models.CustomerPortal, error) {
	var p models.CustomerPortal
	err := r.db.QueryRowxContext(ctx,
		`SELECT id, order_id, token, customer_name, enabled, created_at FROM customer_portals WHERE token = $1`,
		token,
	).StructScan(&p)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PortalRepository) GetByOrderID(ctx context.Context, orderID string) (*models.CustomerPortal, error) {
	var p models.CustomerPortal
	err := r.db.QueryRowxContext(ctx,
		`SELECT id, order_id, token, customer_name, enabled, created_at FROM customer_portals WHERE order_id = $1`,
		orderID,
	).StructScan(&p)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PortalRepository) Revoke(ctx context.Context, orderID string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE customer_portals SET enabled = false WHERE order_id = $1`, orderID)
	return err
}

func (r *PortalRepository) RegenerateToken(ctx context.Context, orderID string) (*models.CustomerPortal, error) {
	token, err := generatePortalToken()
	if err != nil {
		return nil, err
	}
	var p models.CustomerPortal
	err = r.db.QueryRowxContext(ctx, `
		UPDATE customer_portals SET token = $1, enabled = true
		WHERE order_id = $2
		RETURNING id, order_id, token, customer_name, enabled, created_at
	`, token, orderID).StructScan(&p)
	return &p, err
}

// ── Messages ──────────────────────────────────────────────────────────────────

func (r *PortalRepository) CreateMessage(ctx context.Context, orderID, message, portalSender, senderType string) (*models.PortalMessage, error) {
	var m models.PortalMessage
	err := r.db.QueryRowxContext(ctx, `
		INSERT INTO portal_messages (order_id, message, portal_sender, sender_type)
		VALUES ($1, $2, $3, $4)
		RETURNING id, order_id, message, portal_sender, sender_type, created_at
	`, orderID, message, portalSender, senderType).StructScan(&m)
	return &m, err
}

func (r *PortalRepository) ListMessages(ctx context.Context, orderID string) ([]*models.PortalMessage, error) {
	var msgs []*models.PortalMessage
	err := r.db.SelectContext(ctx, &msgs,
		`SELECT id, order_id, message, portal_sender, sender_type, created_at FROM portal_messages WHERE order_id = $1 ORDER BY created_at ASC`,
		orderID,
	)
	return msgs, err
}

// ── Attachments ───────────────────────────────────────────────────────────────

func (r *PortalRepository) CreateAttachment(ctx context.Context, a *models.PortalAttachment) (*models.PortalAttachment, error) {
	var out models.PortalAttachment
	err := r.db.QueryRowxContext(ctx, `
		INSERT INTO portal_attachments (order_id, s3_key, file_name, file_type, file_size)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, order_id, s3_key, file_name, file_type, file_size, created_at
	`, a.OrderID, a.S3Key, a.FileName, a.FileType, a.FileSize).StructScan(&out)
	return &out, err
}

func (r *PortalRepository) ListAttachments(ctx context.Context, orderID string) ([]*models.PortalAttachment, error) {
	var list []*models.PortalAttachment
	err := r.db.SelectContext(ctx, &list,
		`SELECT id, order_id, s3_key, file_name, file_type, file_size, created_at FROM portal_attachments WHERE order_id = $1 ORDER BY created_at ASC`,
		orderID,
	)
	return list, err
}

func (r *PortalRepository) GetAttachment(ctx context.Context, id int64) (*models.PortalAttachment, error) {
	var a models.PortalAttachment
	err := r.db.QueryRowxContext(ctx,
		`SELECT id, order_id, s3_key, file_name, file_type, file_size, created_at FROM portal_attachments WHERE id = $1`,
		id,
	).StructScan(&a)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *PortalRepository) DeleteAttachment(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM portal_attachments WHERE id = $1`, id)
	return err
}

func (r *PortalRepository) DeleteMessage(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM portal_messages WHERE id = $1`, id)
	return err
}
