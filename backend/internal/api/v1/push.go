package v1

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

type PushHandler struct {
	db *sqlx.DB
}

func NewPushHandler(db *sqlx.DB) *PushHandler {
	return &PushHandler{db: db}
}

// RegisterToken stores an Expo push token for the authenticated user.
// POST /api/v1/push/register
func (h *PushHandler) RegisterToken(c *gin.Context) {
	var req struct {
		Token    string `json:"token"    binding:"required"`
		Platform string `json:"platform"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, _ := c.Get("user_id")
	platform := req.Platform
	if platform == "" {
		platform = "unknown"
	}
	_, err := h.db.ExecContext(c.Request.Context(), `
		INSERT INTO device_push_tokens (user_id, token, platform)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, token) DO UPDATE SET updated_at = NOW()
	`, userID, req.Token, platform)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UnregisterToken removes a push token (called on logout).
// DELETE /api/v1/push/unregister
func (h *PushHandler) UnregisterToken(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.db.ExecContext(c.Request.Context(), `DELETE FROM device_push_tokens WHERE token = $1`, req.Token)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SavePrefs persists notification preferences so the push service can respect them.
// PATCH /api/v1/push/prefs
func (h *PushHandler) SavePrefs(c *gin.Context) {
	var prefs interface{}
	if err := c.ShouldBindJSON(&prefs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	prefsJSON, _ := json.Marshal(prefs)
	userID, _ := c.Get("user_id")
	_, err := h.db.ExecContext(c.Request.Context(),
		`UPDATE users SET notification_prefs = $1 WHERE id = $2`,
		prefsJSON, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save prefs"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MarkNotificationRead clears the push-service's in-memory batch for this
// (user, order) pair so the next event starts a fresh notification.
// POST /api/v1/push/mark-read
func (h *PushHandler) MarkNotificationRead(c *gin.Context) {
	var req struct {
		OrderID string `json:"order_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, _ := c.Get("user_id")

	payload, _ := json.Marshal(map[string]interface{}{
		"type":      "order.notification_read",
		"entity_id": req.OrderID,
		"payload": map[string]string{
			"order_id": req.OrderID,
			"user_id":  userID.(string),
		},
	})
	h.db.ExecContext(c.Request.Context(), "SELECT pg_notify('gh_realtime', $1)", string(payload))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetPrefs returns the user's saved notification preferences.
// GET /api/v1/push/prefs
func (h *PushHandler) GetPrefs(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var prefsRaw []byte
	err := h.db.QueryRowContext(c.Request.Context(),
		`SELECT notification_prefs FROM users WHERE id = $1`, userID,
	).Scan(&prefsRaw)
	if err != nil || len(prefsRaw) == 0 {
		c.JSON(http.StatusOK, gin.H{"prefs": nil})
		return
	}
	var prefs interface{}
	if err := json.Unmarshal(prefsRaw, &prefs); err != nil {
		c.JSON(http.StatusOK, gin.H{"prefs": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"prefs": prefs})
}
