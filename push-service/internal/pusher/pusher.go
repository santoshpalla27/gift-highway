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

const debounceDelay = 5 * time.Second

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

// highPriority events skip the debounce buffer and send immediately.
var highPriority = map[string]bool{
	"customer_message":    true,
	"customer_attachment": true,
	"user_mentioned":      true,
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

// bufferedEvent holds one pending event for a user+order batch.
type bufferedEvent struct {
	evType    string
	actorName string
	payload   json.RawMessage
}

// orderBatch accumulates events for one (user, order) pair.
// The first event is sent immediately; every subsequent event (even across
// multiple timer flushes) resets the debounce and updates the same notification.
// The batch is kept alive until 30 min of inactivity so that re-arriving events
// keep counting up rather than starting fresh.
type orderBatch struct {
	mu           sync.Mutex
	allEvents    []bufferedEvent // grows across flushes until the cleanup timer fires
	timer        *time.Timer    // debounce timer
	cleanupTimer *time.Timer    // resets the batch after 30 min of no activity
	notified     bool           // true once any notification has been sent
}

type Pusher struct {
	databaseURL string
	expo        *expo.Client
	db          *sql.DB
	listener    *pq.Listener
	done        chan struct{}

	bufMu sync.Mutex
	buf   map[string]*orderBatch // key: "userID:orderID"
}

func New(databaseURL string, expoClient *expo.Client) *Pusher {
	return &Pusher{
		databaseURL: databaseURL,
		expo:        expoClient,
		done:        make(chan struct{}),
		buf:         make(map[string]*orderBatch),
	}
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

	// Cancel all pending timers to avoid goroutine leaks.
	p.bufMu.Lock()
	for _, batch := range p.buf {
		batch.mu.Lock()
		if batch.timer != nil {
			batch.timer.Stop()
		}
		if batch.cleanupTimer != nil {
			batch.cleanupTimer.Stop()
		}
		batch.mu.Unlock()
	}
	p.buf = make(map[string]*orderBatch)
	p.bufMu.Unlock()

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

// ── Event types ───────────────────────────────────────────────────────────────

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

// ── Main handler ──────────────────────────────────────────────────────────────

func (p *Pusher) handle(msg *pq.Notification) {
	if msg.Channel != "gh_realtime" {
		return
	}

	var event rtEvent
	if err := json.Unmarshal([]byte(msg.Extra), &event); err != nil {
		log.Printf("push: unmarshal event: %v | raw: %.200s", err, msg.Extra)
		return
	}

	// User opened the order — clear the in-memory batch so the next event
	// starts a fresh notification instead of incrementing the old count.
	if event.Type == "order.notification_read" {
		var rp struct {
			OrderID string `json:"order_id"`
			UserID  string `json:"user_id"`
		}
		if err := json.Unmarshal(event.Payload, &rp); err == nil && rp.OrderID != "" && rp.UserID != "" {
			p.cleanupBatch(rp.UserID, rp.OrderID)
			log.Printf("push: notification read user=%s order=%s — batch cleared", rp.UserID, rp.OrderID)
		}
		return
	}

	if event.Type != "order.event_added" {
		return
	}

	var ep eventPayload
	if err := json.Unmarshal(event.Payload, &ep); err != nil {
		log.Printf("push: unmarshal payload: %v", err)
		return
	}

	log.Printf("push: event_type=%s order_id=%s", ep.Type, ep.OrderID)

	if !pushWorthy[ep.Type] {
		return
	}

	actorID := ""
	if ep.ActorID != nil {
		actorID = *ep.ActorID
	}

	ev := bufferedEvent{
		evType:    ep.Type,
		actorName: ep.ActorName,
		payload:   ep.Payload,
	}

	// Mentions: personal — send immediately only to the mentioned user.
	if ep.Type == "user_mentioned" {
		var mp struct {
			MentionedUserID string `json:"mentioned_user_id"`
		}
		if err := json.Unmarshal(ep.Payload, &mp); err == nil &&
			mp.MentionedUserID != "" &&
			mp.MentionedUserID != actorID {
			p.sendBatch(mp.MentionedUserID, ep.OrderID, []bufferedEvent{ev})
		}
		return
	}

	// Fan out to all users with tokens except the actor.
	userIDs, err := p.getPushUserIDs(actorID)
	if err != nil {
		log.Printf("push: get users: %v", err)
		return
	}

	for _, uid := range userIDs {
		if !p.shouldPush(uid, ep.OrderID, ep.Type) {
			continue
		}
		if highPriority[ep.Type] {
			// Customer messages and attachments are time-sensitive — bypass buffer.
			p.sendBatch(uid, ep.OrderID, []bufferedEvent{ev})
		} else {
			p.bufferEvent(uid, ep.OrderID, ev)
		}
	}
}

// ── Debounce buffer ───────────────────────────────────────────────────────────

func (p *Pusher) bufferEvent(userID, orderID string, ev bufferedEvent) {
	key := userID + ":" + orderID

	p.bufMu.Lock()
	batch, ok := p.buf[key]
	if !ok {
		batch = &orderBatch{}
		p.buf[key] = batch
	}
	p.bufMu.Unlock()

	batch.mu.Lock()
	batch.allEvents = append(batch.allEvents, ev)

	// Cancel any pending cleanup timer — there is fresh activity.
	if batch.cleanupTimer != nil {
		batch.cleanupTimer.Stop()
		batch.cleanupTimer = nil
	}

	if !batch.notified {
		// Very first notification for this order (or after a 30-min reset):
		// send detailed content immediately, then arm the debounce timer so
		// follow-up events can update the same notification.
		batch.notified = true
		batch.timer = time.AfterFunc(debounceDelay, func() {
			p.flushBatch(userID, orderID)
		})
		batch.mu.Unlock()
		log.Printf("push: immediate send event=%s user=%s order=%s", ev.evType, userID, orderID)
		p.sendBatch(userID, orderID, []bufferedEvent{ev})
	} else {
		// A notification is already in the tray — buffer this event and reset
		// the timer so we keep updating the count rather than starting fresh.
		if batch.timer != nil {
			batch.timer.Reset(debounceDelay)
		} else {
			batch.timer = time.AfterFunc(debounceDelay, func() {
				p.flushBatch(userID, orderID)
			})
		}
		batch.mu.Unlock()
		log.Printf("push: buffered event=%s user=%s order=%s total=%d (timer reset)", ev.evType, userID, orderID, len(batch.allEvents))
	}
}

func (p *Pusher) flushBatch(userID, orderID string) {
	key := userID + ":" + orderID

	// Do NOT delete the batch — keep it alive so future events know a
	// notification is already in the tray and continue counting up.
	p.bufMu.Lock()
	batch, ok := p.buf[key]
	p.bufMu.Unlock()
	if !ok {
		return
	}

	batch.mu.Lock()
	events := make([]bufferedEvent, len(batch.allEvents))
	copy(events, batch.allEvents)
	batch.timer = nil

	// Arm a cleanup timer: if nothing arrives for 30 min we assume the user
	// read the notification and the next event should start fresh.
	batch.cleanupTimer = time.AfterFunc(30*time.Minute, func() {
		p.cleanupBatch(userID, orderID)
	})
	batch.mu.Unlock()

	// The first event was already sent immediately — only send an update if
	// follow-up events arrived.
	if len(events) < 2 {
		return
	}

	log.Printf("push: flushing batch of %d event(s) for user=%s order=%s", len(events), userID, orderID)
	p.sendBatch(userID, orderID, events)
}

// cleanupBatch removes a batch after 30 min of inactivity so the next event
// for that order starts a fresh notification thread.
func (p *Pusher) cleanupBatch(userID, orderID string) {
	key := userID + ":" + orderID
	p.bufMu.Lock()
	delete(p.buf, key)
	p.bufMu.Unlock()
	log.Printf("push: batch expired user=%s order=%s", userID, orderID)
}

// ── Send aggregated batch ─────────────────────────────────────────────────────

func (p *Pusher) sendBatch(userID, orderID string, events []bufferedEvent) {
	tokens, err := p.getTokens(userID)
	if err != nil || len(tokens) == 0 {
		return
	}

	var orderNum int
	var orderTitle string
	p.db.QueryRow(`SELECT order_number, title FROM orders WHERE id::text = $1`, orderID).
		Scan(&orderNum, &orderTitle)

	// 1 event  → full detail (immediate send)
	// 2+ events → count summary (timer flush replacing the first notification)
	var title, body string
	if len(events) == 1 {
		title, body = buildContent(events[0].evType, events[0].actorName, events[0].payload, orderNum)
	} else {
		title = fmt.Sprintf("Order #%d", orderNum)
		body = fmt.Sprintf("%d new messages", len(events))
	}

	// collapseId (iOS apns-collapse-id) + tag (Android notification tag) share the
	// same value so the OS replaces the previous notification for this order
	// instead of stacking a new one.
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
				Tag:        collapseID,
				Data: map[string]interface{}{
					"order_id":   orderID,
					"event_type": events[len(events)-1].evType,
					"screen":     "order",
				},
			})
		}
	}
	if len(msgs) == 0 {
		return
	}

	log.Printf("push: sending batch(%d) to user=%s order=%s title=%q", len(events), userID, orderID, title)
	invalid, err := p.expo.Send(msgs)
	if err != nil {
		log.Printf("push: send error user=%s: %v", userID, err)
		return
	}
	log.Printf("push: sent ok invalid_tokens=%d", len(invalid))
	if len(invalid) > 0 {
		p.deleteTokens(invalid)
	}
}

// ── Preference check ──────────────────────────────────────────────────────────

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

	var isAssigned bool
	p.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM order_assignees WHERE order_id::text = $1 AND user_id::text = $2)`,
		orderID, userID,
	).Scan(&isAssigned)

	if scope == "my_orders" && !isAssigned {
		return false
	}

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

// ── Content builders ──────────────────────────────────────────────────────────

func buildShortLine(eventType, actorName string, payload json.RawMessage) string {
	trunc := func(s string, n int) string {
		r := []rune(s)
		if len(r) > n {
			return string(r[:n-1]) + "…"
		}
		return s
	}
	switch eventType {
	case "comment_added", "user_mentioned", "staff_portal_reply", "customer_message":
		var p struct {
			Text string `json:"text"`
		}
		json.Unmarshal(payload, &p)
		if p.Text != "" {
			return trunc(actorName+": "+p.Text, 60)
		}
		return actorName + " left a message"
	case "status_changed":
		var p struct {
			From string `json:"from"`
			To   string `json:"to"`
		}
		json.Unmarshal(payload, &p)
		return "Status: " + p.From + " → " + p.To
	case "attachment_added", "customer_attachment":
		return actorName + " uploaded a file"
	case "assignees_changed":
		return actorName + " updated assignees"
	case "order_created":
		return actorName + " created this order"
	default:
		return actorName + " made an update"
	}
}

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
		var p struct{ CustomerName string `json:"customer_name"` }
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
		var p struct{ Text string `json:"text"` }
		json.Unmarshal(payload, &p)
		title = "💬 New Comment"
		body = trunc(actorName+": "+p.Text, 100)
	case "user_mentioned":
		var p struct{ Text string `json:"text"` }
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
		var p struct{ Text string `json:"text"` }
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

// ── DB helpers ────────────────────────────────────────────────────────────────

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
