package realtime

type EventType string

const (
	EventOrderCreated EventType = "order.created"
	EventOrderUpdated EventType = "order.updated"
	EventOrderStatus  EventType = "order.status_changed"
)

type Event struct {
	Type    EventType   `json:"type"`
	Payload interface{} `json:"payload"`
}
