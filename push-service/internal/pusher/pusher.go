package pusher

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/company/app/push-service/internal/expo"
	"github.com/lib/pq"
)

// notifiableTypes mirrors the backend's notifiable event types.
var notifiableTypes = pq.Array([]string{
	"comment_added", "attachment_added", "status_changed",
	"due_date_changed", "priority_changed", "assignees_changed",
	"customer_message", "customer_attachment", "staff_portal_reply",
	"order_updated", "user_mentioned", "order_created",
})

// pushWorthy are the types that trigger a push notification.
var pushWorthy = map[string]bool{
	"order_created":       true,
	"status_changed":      true,
	"assignees_changed":   true,
	"comment_added":       true,
	"user_mentioned":      true,
	"attachment_added":    true,
	"customer_message":    true,
	"customer_attachment": true,
	"staff_portal_reply":  true,
}

// defaultEnabled mirrors DEFAULT_TYPE_PREFS from the mobile app.
var defaultEnabled = map[string]bool{
	"user_mentioned":      true,
	"customer_message":    true,
	"customer_attachment": true,
	"assignees_changed":   true,
	"status_changed":      true,
	"due_date_changed":    false,
	"comment_added":       true,
	"attachment_added":    true,
	"staff_portal_reply":  true,
	"order_updated":       false,
	"priority_changed":    false,
	"order_created":       true,
}

type Pusher struct {
	databaseURL string
	expo        *expo.Client
	db          *sql.DB
	listener    *pq.Listener
	done        chan struct{}

	// rate limiting: one push per (user, order) per 30 seconds
	rlMu   sync.Mutex
	rlLast map[string]time.Time
}

func New(databaseURL string, expoClient *expo.Client) *Pusher {
	return &Pusher{
		databaseURL: databaseURL,
		expo:        expoClient,
		done:        make(chan struct{}),
		rlLast:      make(map[string]time.Time),
	}
}

// rateLimited returns true if a push was already sent for this user+order within 30s.
func (p *Pusher) rateLimited(userID, orderID string) bool {
	key := userID + ":" + orderID
	p.rlMu.Lock()
	defer p.rlMu.Unlock()
	if t, ok := p.rlLast[key]; ok && time.Since(t) < 30*time.Second {
		return true
	}
	p.rlLast[key] = time.Now()
	return false
}

func (p *Pusher) Start() error {
	db, err := sql.Open("postgres", p.databaseURL)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping db: %w", err)
	}
	p.db = db

	if err := p.ensureTable(); err != nil {
		log.Printf("push: ensure table warning: %v", err)
	}

	listener := pq.NewListener(p.databaseURL, 2*time.Second, time.Minute,
		func(ev pq.ListenerEventType, err error) {
			if err != nil {
				log.Printf("push listener: %v", err)
			}
		},
	)
	if err := listener.Listen("gh_realtime"); err != nil {
		return fmt.Errorf("listen gh_realtime: %w", err)
	}
	p.listener = listener
	log.Println("push service: LISTEN gh_realtime")

	go p.loop()
	return nil
}

func (p *Pusher) Stop() {
	close(p.done)
	if p.listener != nil {
		p.listener.Close()
	}
	if p.db != nil {
		p.db.Close()
	}
}

func (p *Pusher) loop() {
	for {
		select {
		case <-p.done:
			return
		case msg, ok := <-p.listener.Notify:
			if !ok {
				return
			}
			if msg == nil {
				continue // keepalive ping
			}
			go p.handle(msg)
		}
	}
}

func (p *Pusher) ensureTable() error {
	_, err := p.db.Exec(`
		CREATE TABLE IF NOT EXISTS device_push_tokens (
			id         SERIAL      PRIMARY KEY,
			user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			token      TEXT        NOT NULL,
			platform   TEXT        NOT NULL DEFAULT 'unknown',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			CONSTRAINT device_push_tokens_user_token UNIQUE (user_id, token)
		)`)
	return err
}

// ── Event types from the backend ─────────────────────────────────────────────

type rtEvent struct {
	Type     string          `json:"type"`
	EntityID string          `json:"entity_id"`
	Payload  json.RawMessage `json:"payload"`
}

type eventPayload struct {
	OrderID   string          `json:"order_id"`
	Type      string          `json:"type"`
	ActorID   *string         `json:"actor_id"`
	ActorName string          `json:"actor_name"`
	Payload   json.RawMessage `json:"payload"`
}

// ── Main handler ─────────────────────────────────────────────────────────────

func (p *Pusher) handle(msg *pq.Notification) {
	if msg.Channel != "gh_realtime" {
		return
	}

	var event rtEvent
	if err := json.Unmarshal([]byte(msg.Extra), &event); err != nil {
		log.Printf("push: json unmarshal event: %v | raw: %.200s", err, msg.Extra)
		return
	}

	log.Printf("push: received event type=%s", event.Type)

	// Only handle timeline events — they cover all notification-worthy activity.
	if event.Type != "order.event_added" {
		return
	}

	var ep eventPayload
	if err := json.Unmarshal(event.Payload, &ep); err != nil {
		log.Printf("push: json unmarshal payload: %v", err)
		return
	}

	log.Printf("push: event_type=%s order_id=%s", ep.Type, ep.OrderID)

	if !pushWorthy[ep.Type] {
		log.Printf("push: skipping non-worthy event type=%s", ep.Type)
		return
	}

	actorID := ""
	if ep.ActorID != nil {
		actorID = *ep.ActorID
	}

	// Mentions: send only to the mentioned user, always (bypass pref filter).
	if ep.Type == "user_mentioned" {
		var mp struct {
			MentionedUserID string `json:"mentioned_user_id"`
		}
		if err := json.Unmarshal(ep.Payload, &mp); err == nil && mp.MentionedUserID != "" && mp.MentionedUserID != actorID {
			p.sendToUser(mp.MentionedUserID, ep.OrderID, ep.Type, ep.ActorName, ep.Payload)
		}
		return
	}

	// All other types: fan out to all users with tokens except the actor.
	userIDs, err := p.getPushUserIDs(actorID)
	if err != nil {
		log.Printf("push: get users: %v", err)
		return
	}

	for _, uid := range userIDs {
		if !p.shouldPush(uid, ep.OrderID, ep.Type) {
			continue
		}
		p.sendToUser(uid, ep.OrderID, ep.Type, ep.ActorName, ep.Payload)
	}
}

// ── Preference check ─────────────────────────────────────────────────────────

func (p *Pusher) shouldPush(userID, orderID, eventType string) bool {
	var prefsRaw []byte
	err := p.db.QueryRow(`SELECT notification_prefs FROM users WHERE id::text = $1`, userID).Scan(&prefsRaw)
	if err != nil || len(prefsRaw) == 0 {
		return defaultEnabled[eventType]
	}

	var prefs struct {
		Scope string                     `json:"scope"`
		Types map[string]map[string]bool `json:"types"`
	}
	if err := json.Unmarshal(prefsRaw, &prefs); err != nil {
		return defaultEnabled[eventType]
	}

	scope := prefs.Scope
	if scope == "" {
		scope = "my_orders"
	}

	// Check if user is assigned to the order.
	var isAssigned bool
	p.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM order_assignees WHERE order_id::text = $1 AND user_id::text = $2)`,
		orderID, userID,
	).Scan(&isAssigned)

	// my_orders scope: only push for assigned orders.
	if scope == "my_orders" && !isAssigned {
		return false
	}

	// Use the type prefs for the relevant scope key.
	scopeKey := "my_orders"
	if scope == "all_orders" {
		scopeKey = "all_orders"
	}

	if typeMap, ok := prefs.Types[scopeKey]; ok {
		if enabled, ok := typeMap[eventType]; ok {
			return enabled
		}
	}
	return defaultEnabled[eventType]
}

// ── Send to a single user ────────────────────────────────────────────────────

func (p *Pusher) sendToUser(userID, orderID, eventType, actorName string, payload json.RawMessage) {
	if p.rateLimited(userID, orderID) {
		log.Printf("push: rate-limited user=%s order=%s", userID, orderID)
		return
	}

	tokens, err := p.getTokens(userID)
	if err != nil || len(tokens) == 0 {
		return
	}

	var orderNum int
	var orderTitle string
	p.db.QueryRow(`SELECT order_number, title FROM orders WHERE id::text = $1`, orderID).Scan(&orderNum, &orderTitle)

	// Count unread events for this user+order (including this new one).
	// Matches the exact query used by the in-app notification system.
	var unreadCount int
	p.db.QueryRow(`
		SELECT COUNT(*) FROM order_events e
		LEFT JOIN notification_reads nr ON nr.user_id::text = $1 AND nr.order_id::text = $2
		WHERE e.order_id::text = $2
		  AND e.type = ANY($3)
		  AND (e.actor_id IS NULL OR e.actor_id::text != $1)
		  AND (e.type != 'user_mentioned' OR e.payload->>'mentioned_user_id' = $1)
		  AND e.created_at > COALESCE(nr.last_seen_at, '1970-01-01 00:00:00 UTC'::timestamptz)
	`, userID, orderID, notifiableTypes).Scan(&unreadCount)

	var title, body string
	if unreadCount <= 1 {
		// Single update: show specific content.
		title, body = buildContent(eventType, actorName, payload, orderNum)
	} else {
		// Multiple unread: show count — same grouping pattern as the in-app bell.
		title = fmt.Sprintf("📦 %d updates", unreadCount)
		body = fmt.Sprintf("Order #%d · %s", orderNum, orderTitle)
	}

	// Collapse key per order so repeated notifications replace rather than stack.
	collapseID := fmt.Sprintf("order:%s", orderID)

	var msgs []expo.Message
	for _, tok := range tokens {
		if expo.IsValidToken(tok) {
			msgs = append(msgs, expo.Message{
				To:         tok,
				Title:      title,
				Body:       body,
				Sound:      "default",
				Priority:   "high",
				ChannelID:  "default",
				CollapseID: collapseID,
				Data: map[string]interface{}{
					"order_id":   orderID,
					"event_type": eventType,
				},
			})
		}
	}
	if len(msgs) == 0 {
		return
	}

	log.Printf("push: sending %d message(s) to user %s for order %s", len(msgs), userID, orderID)
	invalid, err := p.expo.Send(msgs)
	if err != nil {
		log.Printf("push: send error (user %s): %v", userID, err)
		return
	}
	log.Printf("push: sent ok, invalid_tokens=%d", len(invalid))
	if len(invalid) > 0 {
		log.Printf("push: removing %d invalid tokens", len(invalid))
		p.deleteTokens(invalid)
	}
}

// ── Content builders ─────────────────────────────────────────────────────────

func buildContent(eventType, actorName string, payload json.RawMessage, orderNum int) (title, body string) {
	trunc := func(s string, n int) string {
		r := []rune(s)
		if len(r) > n {
			return string(r[:n-1]) + "…"
		}
		return s
	}
	ref := fmt.Sprintf("Order #%d", orderNum)

	switch eventType {
	case "order_created":
		var p struct {
			CustomerName string `json:"customer_name"`
		}
		json.Unmarshal(payload, &p)
		title = "📦 New Order"
		body = actorName + " created " + ref
		if p.CustomerName != "" {
			body += " for " + p.CustomerName
		}

	case "status_changed":
		var p struct {
			From string `json:"from"`
			To   string `json:"to"`
		}
		json.Unmarshal(payload, &p)
		title = "🔄 Status Update"
		body = ref + ": " + p.From + " → " + p.To

	case "comment_added":
		var p struct {
			Text string `json:"text"`
		}
		json.Unmarshal(payload, &p)
		title = "💬 New Comment"
		body = trunc(actorName+": "+p.Text, 100)

	case "user_mentioned":
		var p struct {
			Text string `json:"text"`
		}
		json.Unmarshal(payload, &p)
		title = "💬 You were mentioned"
		body = trunc(actorName+" mentioned you: "+p.Text, 100)

	case "attachment_added":
		title = "📎 New Attachment"
		body = actorName + " uploaded a file on " + ref

	case "customer_message":
		var p struct {
			Text         string `json:"text"`
			CustomerName string `json:"customer_name"`
		}
		json.Unmarshal(payload, &p)
		title = "💬 Customer Message"
		sender := p.CustomerName
		if sender == "" {
			sender = "Customer"
		}
		if p.Text != "" {
			body = trunc(sender+": "+p.Text, 100)
		} else {
			body = sender + " sent a message on " + ref
		}

	case "customer_attachment":
		title = "📎 Customer File"
		body = "Customer uploaded a file on " + ref

	case "staff_portal_reply":
		var p struct {
			Text string `json:"text"`
		}
		json.Unmarshal(payload, &p)
		title = "💬 Portal Reply"
		if p.Text != "" {
			body = trunc(actorName+": "+p.Text, 100)
		} else {
			body = actorName + " replied on " + ref
		}

	case "assignees_changed":
		title = "👤 Assignment Updated"
		body = actorName + " updated assignees on " + ref

	default:
		title = "📦 Gift Highway"
		body = "New activity on " + ref
	}
	return
}

// ── DB helpers ───────────────────────────────────────────────────────────────

func (p *Pusher) getPushUserIDs(excludeID string) ([]string, error) {
	var rows *sql.Rows
	var err error
	if excludeID == "" {
		rows, err = p.db.Query(`SELECT DISTINCT user_id::text FROM device_push_tokens`)
	} else {
		rows, err = p.db.Query(`SELECT DISTINCT user_id::text FROM device_push_tokens WHERE user_id::text != $1`, excludeID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	return ids, nil
}

func (p *Pusher) getTokens(userID string) ([]string, error) {
	rows, err := p.db.Query(`SELECT token FROM device_push_tokens WHERE user_id::text = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tokens []string
	for rows.Next() {
		var t string
		rows.Scan(&t)
		tokens = append(tokens, t)
	}
	return tokens, nil
}

func (p *Pusher) deleteTokens(tokens []string) {
	p.db.Exec(`DELETE FROM device_push_tokens WHERE token = ANY($1)`, pq.Array(tokens))
}
