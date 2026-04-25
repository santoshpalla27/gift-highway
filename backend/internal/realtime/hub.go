package realtime

import (
	"database/sql"
	"encoding/json"
	"sync"
)

type Hub struct {
	clients    map[*Client]struct{}
	mu         sync.RWMutex
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	db         *sql.DB
}

// SetDB wires a database connection so Broadcast also emits pg_notify for the push service.
func (h *Hub) SetDB(db *sql.DB) {
	h.db = db
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]struct{}),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Register(c *Client) {
	h.register <- c
}

func (h *Hub) Unregister(c *Client) {
	h.unregister <- c
}

func (h *Hub) Broadcast(event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	select {
	case h.broadcast <- data:
	default:
	}
	if h.db != nil {
		payload := string(data)
		go func() {
			h.db.Exec("SELECT pg_notify('gh_realtime', $1)", payload)
		}()
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = struct{}{}
			h.mu.Unlock()

		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.send <- msg:
				default:
					// slow client — drop message
				}
			}
			h.mu.RUnlock()
		}
	}
}
