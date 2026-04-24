package v1

import (
	"net/http"
	"strconv"

	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type NotificationHandler struct {
	svc *services.NotificationService
}

func NewNotificationHandler(svc *services.NotificationService) *NotificationHandler {
	return &NotificationHandler{svc: svc}
}

func (h *NotificationHandler) userID(c *gin.Context) string {
	v, _ := c.Get("user_id")
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// GET /api/v1/notifications — bell dropdown data (unread groups, top 10)
// ?mine=true → only my orders. ?others=true → only orders not mine.
func (h *NotificationHandler) GetUnread(c *gin.Context) {
	uid := h.userID(c)
	mineOnly := c.Query("mine") == "true"
	othersOnly := c.Query("others") == "true"
	groups, total, err := h.svc.GetUnreadGroups(c.Request.Context(), uid, mineOnly, othersOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch notifications"})
		return
	}
	if len(groups) > 10 {
		groups = groups[:10]
	}
	c.JSON(http.StatusOK, gin.H{
		"groups":      groups,
		"total_count": total,
	})
}

// GET /api/v1/notifications/history — full history page
func (h *NotificationHandler) GetHistory(c *gin.Context) {
	uid := h.userID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	groups, total, err := h.svc.GetHistoryGroups(c.Request.Context(), uid, page)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch history"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"groups": groups,
		"total":  total,
		"page":   page,
	})
}

// GET /api/v1/notifications/order/:orderId/last-seen — last_seen_at for one order
func (h *NotificationHandler) GetLastSeen(c *gin.Context) {
	uid := h.userID(c)
	orderID := c.Param("orderId")
	t, err := h.svc.GetLastSeenAt(c.Request.Context(), uid, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch last seen"})
		return
	}
	if t == nil {
		c.JSON(http.StatusOK, gin.H{"last_seen_at": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"last_seen_at": t.UTC().Format("2006-01-02T15:04:05Z07:00")})
}

// POST /api/v1/notifications/read/:orderId — mark one order as read
func (h *NotificationHandler) MarkOrderRead(c *gin.Context) {
	uid := h.userID(c)
	orderID := c.Param("orderId")
	if err := h.svc.MarkOrderRead(c.Request.Context(), uid, orderID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark read"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// POST /api/v1/notifications/read-all — mark all orders as read
func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	uid := h.userID(c)
	if err := h.svc.MarkAllRead(c.Request.Context(), uid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark all read"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /api/v1/notifications/orders — per-order summary table
func (h *NotificationHandler) GetOrderSummaries(c *gin.Context) {
	uid := h.userID(c)
	summaries, err := h.svc.GetOrderSummaries(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch summaries"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"orders": summaries})
}

// GET /api/v1/notifications/order/:orderId — all events for one order
func (h *NotificationHandler) GetOrderNotifications(c *gin.Context) {
	uid := h.userID(c)
	orderID := c.Param("orderId")
	events, err := h.svc.GetOrderNotificationEvents(c.Request.Context(), uid, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch notifications"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"events": events})
}
