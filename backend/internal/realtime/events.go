package realtime

import (
	"time"

	"github.com/google/uuid"
)

type EventType string

const (
	EventOrderCreated EventType = "order.created"
	EventOrderUpdated EventType = "order.updated"
	EventOrderStatus  EventType = "order.status_changed"
)

type Event struct {
	EventID   string      `json:"event_id"`
	Type      EventType   `json:"type"`
	EntityID  string      `json:"entity_id,omitempty"`
	Timestamp string      `json:"timestamp"`
	Payload   interface{} `json:"payload"`
}

func NewEvent(eventType EventType, entityID string, payload interface{}) Event {
	return Event{
		EventID:   uuid.New().String(),
		Type:      eventType,
		EntityID:  entityID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload:   payload,
	}
}
