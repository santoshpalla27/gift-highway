package models

import "time"

type CustomerPortal struct {
	ID           string    `db:"id"`
	OrderID      string    `db:"order_id"`
	Token        string    `db:"token"`
	CustomerName string    `db:"customer_name"`
	Enabled      bool      `db:"enabled"`
	CreatedAt    time.Time `db:"created_at"`
}

type PortalMessage struct {
	ID           int64     `db:"id"`
	OrderID      string    `db:"order_id"`
	Message      string    `db:"message"`
	PortalSender string    `db:"portal_sender"`
	SenderType   string    `db:"sender_type"`
	CreatedAt    time.Time `db:"created_at"`
}

type PortalAttachment struct {
	ID        int64     `db:"id"`
	OrderID   string    `db:"order_id"`
	S3Key     string    `db:"s3_key"`
	FileName  string    `db:"file_name"`
	FileType  string    `db:"file_type"`
	FileSize  int64     `db:"file_size"`
	CreatedAt time.Time `db:"created_at"`
}
