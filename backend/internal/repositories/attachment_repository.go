package repositories

import (
	"context"

	"github.com/company/app/backend/internal/models"
	"github.com/jmoiron/sqlx"
)

const attachmentSelectSQL = `
	SELECT
		a.id, a.order_id, a.event_id, a.uploaded_by,
		a.file_name, a.file_key, a.file_url, a.mime_type, a.size_bytes, a.created_at,
		a.is_annotation, a.source_attachment_id,
		COALESCE(CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')), 'Unknown') AS uploader_name
	FROM order_attachments a
	LEFT JOIN users u ON a.uploaded_by = u.id
`

type AttachmentRepository struct {
	db *sqlx.DB
}

func NewAttachmentRepository(db *sqlx.DB) *AttachmentRepository {
	return &AttachmentRepository{db: db}
}

func (r *AttachmentRepository) Create(ctx context.Context, a *models.OrderAttachment) (*models.OrderAttachment, error) {
	var out models.OrderAttachment
	err := r.db.QueryRowxContext(ctx, `
		WITH ins AS (
			INSERT INTO order_attachments
				(order_id, event_id, uploaded_by, file_name, file_key, file_url, mime_type, size_bytes, is_annotation, source_attachment_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING *
		)
		SELECT
			ins.id, ins.order_id, ins.event_id, ins.uploaded_by,
			ins.file_name, ins.file_key, ins.file_url, ins.mime_type, ins.size_bytes, ins.created_at,
			ins.is_annotation, ins.source_attachment_id,
			COALESCE(CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')), 'Unknown') AS uploader_name
		FROM ins
		LEFT JOIN users u ON ins.uploaded_by = u.id
	`, a.OrderID, a.EventID, a.UploadedBy, a.FileName, a.FileKey, a.FileURL, a.MimeType, a.SizeBytes,
		a.IsAnnotation, a.SourceAttachmentID,
	).StructScan(&out)
	return &out, err
}

func (r *AttachmentRepository) GetByID(ctx context.Context, id string) (*models.OrderAttachment, error) {
	var a models.OrderAttachment
	err := r.db.QueryRowxContext(ctx, attachmentSelectSQL+`WHERE a.id = $1`, id).StructScan(&a)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *AttachmentRepository) ListByOrder(ctx context.Context, orderID string) ([]*models.OrderAttachment, error) {
	var list []*models.OrderAttachment
	err := r.db.SelectContext(ctx, &list, attachmentSelectSQL+`WHERE a.order_id = $1 ORDER BY a.created_at ASC`, orderID)
	return list, err
}

func (r *AttachmentRepository) GetByEventID(ctx context.Context, eventID string) (*models.OrderAttachment, error) {
	var a models.OrderAttachment
	err := r.db.QueryRowxContext(ctx, attachmentSelectSQL+`WHERE a.event_id = $1`, eventID).StructScan(&a)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *AttachmentRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM order_attachments WHERE id = $1`, id)
	return err
}
