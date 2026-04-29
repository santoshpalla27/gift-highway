package models

import "time"

type OrderAttachment struct {
	ID                 string    `db:"id"`
	OrderID            string    `db:"order_id"`
	EventID            *string   `db:"event_id"`
	UploadedBy         *string   `db:"uploaded_by"`
	UploaderName       string    `db:"uploader_name"`
	FileName           string    `db:"file_name"`
	FileKey            string    `db:"file_key"`
	FileURL            string    `db:"file_url"`
	MimeType           string    `db:"mime_type"`
	SizeBytes          int64     `db:"size_bytes"`
	CreatedAt          time.Time `db:"created_at"`
	IsAnnotation       bool      `db:"is_annotation"`
	SourceAttachmentID *string   `db:"source_attachment_id"`
}
