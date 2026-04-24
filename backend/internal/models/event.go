package models

import (
	"encoding/json"
	"time"
)

const (
	EvtOrderCreated     = "order_created"
	EvtCommentAdded     = "comment_added"
	EvtStatusChanged    = "status_changed"
	EvtAssigneesChanged = "assignees_changed"
	EvtDueDateChanged   = "due_date_changed"
	EvtPriorityChanged  = "priority_changed"
	EvtOrderUpdated     = "order_updated"
	EvtAttachmentAdded    = "attachment_added"
	EvtAttachmentDeleted  = "attachment_deleted"
	EvtCustomerMessage      = "customer_message"
	EvtCustomerAttachment   = "customer_attachment"
	EvtStaffPortalReply     = "staff_portal_reply"
	EvtPortalMessageDeleted = "portal_message_deleted"
	EvtUserMentioned        = "user_mentioned"
)

type OrderEvent struct {
	ID        string          `db:"id"`
	OrderID   string          `db:"order_id"`
	Type      string          `db:"type"`
	ActorID   *string         `db:"actor_id"`
	ActorName string          `db:"actor_name"`
	Payload   json.RawMessage `db:"payload"`
	CreatedAt time.Time       `db:"created_at"`
}
