package v1

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/company/app/backend/internal/realtime"
	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type PortalHandler struct {
	svc *services.PortalService
	hub *realtime.Hub
}

func NewPortalHandler(svc *services.PortalService, hub *realtime.Hub) *PortalHandler {
	return &PortalHandler{svc: svc, hub: hub}
}

// ── Public (token-based, no auth) ────────────────────────────────────────────

func (h *PortalHandler) GetPortal(c *gin.Context) {
	token := c.Param("token")
	portal, err := h.svc.ValidateToken(c.Request.Context(), token)
	if err != nil {
		if errors.Is(err, services.ErrPortalNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "portal not found"})
			return
		}
		if errors.Is(err, services.ErrPortalDisabled) {
			c.JSON(http.StatusForbidden, gin.H{"error": "portal link is inactive"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load portal"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"order_id":      portal.OrderID,
		"customer_name": portal.CustomerName,
		"enabled":       portal.Enabled,
	})
}

func (h *PortalHandler) GetMessages(c *gin.Context) {
	token := c.Param("token")
	portal, err := h.svc.ValidateToken(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or inactive portal link"})
		return
	}
	msgs, err := h.svc.ListMessages(c.Request.Context(), portal.OrderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch messages"})
		return
	}
	type msgResp struct {
		ID           int64  `json:"id"`
		Message      string `json:"message"`
		PortalSender string `json:"portal_sender"`
		SenderType   string `json:"sender_type"`
		CreatedAt    string `json:"created_at"`
	}
	items := make([]msgResp, len(msgs))
	for i, m := range msgs {
		items[i] = msgResp{
			ID:           m.ID,
			Message:      m.Message,
			PortalSender: m.PortalSender,
			SenderType:   m.SenderType,
			CreatedAt:    m.CreatedAt.Format(time.RFC3339),
		}
	}
	c.JSON(http.StatusOK, gin.H{"messages": items})
}

func (h *PortalHandler) SendMessage(c *gin.Context) {
	token := c.Param("token")
	portal, err := h.svc.ValidateToken(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or inactive portal link"})
		return
	}
	var req struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}
	msg, ev, err := h.svc.SendCustomerMessage(c.Request.Context(), portal, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send message"})
		return
	}
	if ev != nil {
		h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, portal.OrderID, toEventResponse(ev)))
	}
	c.JSON(http.StatusCreated, gin.H{
		"id":            msg.ID,
		"message":       msg.Message,
		"portal_sender": msg.PortalSender,
		"sender_type":   msg.SenderType,
		"created_at":    msg.CreatedAt.Format(time.RFC3339),
	})
}

func (h *PortalHandler) GetAttachments(c *gin.Context) {
	token := c.Param("token")
	portal, err := h.svc.ValidateToken(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or inactive portal link"})
		return
	}
	atts, err := h.svc.ListAttachments(c.Request.Context(), portal.OrderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch attachments"})
		return
	}
	type attResp struct {
		ID        int64  `json:"id"`
		FileName  string `json:"file_name"`
		FileType  string `json:"file_type"`
		FileSize  int64  `json:"file_size"`
		ViewURL   string `json:"view_url"`
		CreatedAt string `json:"created_at"`
	}
	items := make([]attResp, len(atts))
	for i, a := range atts {
		items[i] = attResp{
			ID:        a.ID,
			FileName:  a.FileName,
			FileType:  a.FileType,
			FileSize:  a.FileSize,
			ViewURL:   a.ViewURL,
			CreatedAt: a.CreatedAt.Format(time.RFC3339),
		}
	}
	c.JSON(http.StatusOK, gin.H{"attachments": items})
}

func (h *PortalHandler) GetAttachmentUploadURL(c *gin.Context) {
	token := c.Param("token")
	portal, err := h.svc.ValidateToken(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or inactive portal link"})
		return
	}
	var req struct {
		FileName string `json:"file_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name is required"})
		return
	}
	resp, err := h.svc.GetUploadURL(c.Request.Context(), portal.OrderID, req.FileName)
	if err != nil {
		if errors.Is(err, services.ErrStorageNotConfigured) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not configured"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate upload URL"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *PortalHandler) DeletePortalAttachmentPublic(c *gin.Context) {
	token := c.Param("token")
	if _, err := h.svc.ValidateToken(c.Request.Context(), token); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or inactive portal link"})
		return
	}
	attIDStr := c.Param("attId")
	attID, err := strconv.ParseInt(attIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attachment id"})
		return
	}
	if err := h.svc.DeleteAttachment(c.Request.Context(), attID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete attachment"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *PortalHandler) ConfirmAttachment(c *gin.Context) {
	token := c.Param("token")
	portal, err := h.svc.ValidateToken(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or inactive portal link"})
		return
	}
	var req struct {
		S3Key    string `json:"s3_key" binding:"required"`
		FileName string `json:"file_name" binding:"required"`
		FileType string `json:"file_type" binding:"required"`
		FileSize int64  `json:"file_size" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	att, err := h.svc.ConfirmAttachment(c.Request.Context(), portal, req.S3Key, req.FileName, req.FileType, req.FileSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save attachment"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"id":        att.ID,
		"file_name": att.FileName,
		"file_type": att.FileType,
		"file_size": att.FileSize,
		"view_url":  att.ViewURL,
		"created_at": att.CreatedAt.Format(time.RFC3339),
	})
}

// ── Protected (staff, per-order) ─────────────────────────────────────────────

func (h *PortalHandler) CreatePortal(c *gin.Context) {
	orderID := c.Param("id")
	var req struct {
		CustomerName string `json:"customer_name"`
	}
	_ = c.ShouldBindJSON(&req)

	portal, err := h.svc.CreatePortal(c.Request.Context(), orderID, req.CustomerName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create portal"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"token":         portal.Token,
		"customer_name": portal.CustomerName,
		"enabled":       portal.Enabled,
		"created_at":    portal.CreatedAt.Format(time.RFC3339),
	})
}

func (h *PortalHandler) GetOrderPortal(c *gin.Context) {
	orderID := c.Param("id")
	portal, err := h.svc.GetByOrderID(c.Request.Context(), orderID)
	if err != nil {
		if errors.Is(err, services.ErrPortalNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "portal not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch portal"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token":         portal.Token,
		"customer_name": portal.CustomerName,
		"enabled":       portal.Enabled,
		"created_at":    portal.CreatedAt.Format(time.RFC3339),
	})
}

func (h *PortalHandler) RevokePortal(c *gin.Context) {
	orderID := c.Param("id")
	if err := h.svc.RevokePortal(c.Request.Context(), orderID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to revoke portal"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "portal revoked"})
}

func (h *PortalHandler) RegenerateToken(c *gin.Context) {
	orderID := c.Param("id")
	portal, err := h.svc.RegenerateToken(c.Request.Context(), orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to regenerate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token":         portal.Token,
		"customer_name": portal.CustomerName,
		"enabled":       portal.Enabled,
		"created_at":    portal.CreatedAt.Format(time.RFC3339),
	})
}

func (h *PortalHandler) StaffReply(c *gin.Context) {
	orderID := c.Param("id")
	staffID, _ := c.Get("user_id")
	staffEmail, _ := c.Get("user_email")
	uid := staffID.(string)
	sname, _ := staffEmail.(string)

	var req struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}

	portal, err := h.svc.GetByOrderID(c.Request.Context(), orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "portal not found for this order"})
		return
	}

	msg, ev, err := h.svc.SendStaffReply(c.Request.Context(), portal, req.Message, sname, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send reply"})
		return
	}
	if ev != nil {
		h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, portal.OrderID, toEventResponse(ev)))
	}
	c.JSON(http.StatusCreated, gin.H{
		"id":            msg.ID,
		"message":       msg.Message,
		"portal_sender": msg.PortalSender,
		"sender_type":   msg.SenderType,
		"created_at":    msg.CreatedAt.Format(time.RFC3339),
	})
}

func (h *PortalHandler) GetPortalMessages(c *gin.Context) {
	orderID := c.Param("id")
	msgs, err := h.svc.ListMessages(c.Request.Context(), orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch messages"})
		return
	}
	type msgResp struct {
		ID           int64  `json:"id"`
		Message      string `json:"message"`
		PortalSender string `json:"portal_sender"`
		SenderType   string `json:"sender_type"`
		CreatedAt    string `json:"created_at"`
	}
	items := make([]msgResp, len(msgs))
	for i, m := range msgs {
		items[i] = msgResp{
			ID:           m.ID,
			Message:      m.Message,
			PortalSender: m.PortalSender,
			SenderType:   m.SenderType,
			CreatedAt:    m.CreatedAt.Format(time.RFC3339),
		}
	}
	c.JSON(http.StatusOK, gin.H{"messages": items})
}

func (h *PortalHandler) DeletePortalAttachment(c *gin.Context) {
	attIDStr := c.Param("attId")
	attID, err := strconv.ParseInt(attIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attachment id"})
		return
	}
	if err := h.svc.DeleteAttachment(c.Request.Context(), attID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete attachment"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *PortalHandler) StaffListAttachments(c *gin.Context) {
	orderID := c.Param("id")
	atts, err := h.svc.ListAttachments(c.Request.Context(), orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch attachments"})
		return
	}
	type attResp struct {
		ID        int64  `json:"id"`
		FileName  string `json:"file_name"`
		FileType  string `json:"file_type"`
		FileSize  int64  `json:"file_size"`
		ViewURL   string `json:"view_url"`
		CreatedAt string `json:"created_at"`
	}
	items := make([]attResp, len(atts))
	for i, a := range atts {
		items[i] = attResp{
			ID:        a.ID,
			FileName:  a.FileName,
			FileType:  a.FileType,
			FileSize:  a.FileSize,
			ViewURL:   a.ViewURL,
			CreatedAt: a.CreatedAt.Format(time.RFC3339),
		}
	}
	c.JSON(http.StatusOK, gin.H{"attachments": items})
}

func (h *PortalHandler) StaffGetUploadURL(c *gin.Context) {
	orderID := c.Param("id")
	var req struct {
		FileName string `json:"file_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name is required"})
		return
	}
	resp, err := h.svc.GetUploadURL(c.Request.Context(), orderID, req.FileName)
	if err != nil {
		if errors.Is(err, services.ErrStorageNotConfigured) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not configured"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate upload URL"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *PortalHandler) StaffConfirmAttachment(c *gin.Context) {
	orderID := c.Param("id")
	staffID, _ := c.Get("user_id")
	staffEmail, _ := c.Get("user_email")
	uid := staffID.(string)
	sname, _ := staffEmail.(string)

	var req struct {
		S3Key    string `json:"s3_key" binding:"required"`
		FileName string `json:"file_name" binding:"required"`
		FileType string `json:"file_type" binding:"required"`
		FileSize int64  `json:"file_size" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	att, err := h.svc.SaveAttachment(c.Request.Context(), orderID, req.S3Key, req.FileName, req.FileType, req.FileSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save attachment"})
		return
	}

	portal, err := h.svc.GetByOrderID(c.Request.Context(), orderID)
	if err == nil {
		msgText := "[attachment:" + strconv.FormatInt(att.ID, 10) + ":" + req.FileName + "]"
		_, ev, _ := h.svc.SendStaffReply(c.Request.Context(), portal, msgText, sname, uid)
		if ev != nil {
			h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, orderID, toEventResponse(ev)))
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":         att.ID,
		"file_name":  att.FileName,
		"file_type":  att.FileType,
		"file_size":  att.FileSize,
		"view_url":   att.ViewURL,
		"created_at": att.CreatedAt.Format(time.RFC3339),
	})
}

func (h *PortalHandler) StaffGetAttachmentDownloadURL(c *gin.Context) {
	attIDStr := c.Param("attId")
	attID, err := strconv.ParseInt(attIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attachment id"})
		return
	}
	fileName := c.Query("name")
	url, err := h.svc.GetAttachmentDownloadURL(c.Request.Context(), attID, fileName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": url})
}
