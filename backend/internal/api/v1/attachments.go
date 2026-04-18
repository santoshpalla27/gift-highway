package v1

import (
	"errors"
	"net/http"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/realtime"
	"github.com/company/app/backend/internal/repositories"
	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type AttachmentHandler struct {
	svc *services.AttachmentService
	hub *realtime.Hub
}

func NewAttachmentHandler(svc *services.AttachmentService, hub *realtime.Hub) *AttachmentHandler {
	return &AttachmentHandler{svc: svc, hub: hub}
}

func (h *AttachmentHandler) GetUploadURL(c *gin.Context) {
	orderID := c.Param("id")
	var req services.UploadURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name, mime_type, and size_bytes are required"})
		return
	}

	resp, err := h.svc.GetUploadURL(c.Request.Context(), orderID, req)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrFileTooLarge):
			c.JSON(http.StatusBadRequest, gin.H{"error": "file exceeds 20 MB limit"})
		case errors.Is(err, services.ErrInvalidMIMEType):
			c.JSON(http.StatusBadRequest, gin.H{"error": "file type not allowed"})
		case errors.Is(err, services.ErrStorageNotConfigured):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not configured"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate upload URL"})
		}
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AttachmentHandler) ConfirmUpload(c *gin.Context) {
	orderID := c.Param("id")
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	var req services.ConfirmUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	att, ev, err := h.svc.ConfirmUpload(c.Request.Context(), orderID, uid, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save attachment"})
		return
	}

	h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEvent, orderID, toEventResponse(ev)))
	c.JSON(http.StatusCreated, gin.H{"attachment": toAttachmentResponse(att)})
}

func (h *AttachmentHandler) ListAttachments(c *gin.Context) {
	orderID := c.Param("id")
	list, err := h.svc.ListAttachments(c.Request.Context(), orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch attachments"})
		return
	}
	items := make([]attachmentResponse, len(list))
	for i, a := range list {
		items[i] = toAttachmentResponse(a)
	}
	c.JSON(http.StatusOK, gin.H{"attachments": items})
}

func (h *AttachmentHandler) GetSignedURL(c *gin.Context) {
	fileKey := c.Query("key")
	if fileKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key is required"})
		return
	}
	url, err := h.svc.GetSignedURL(c.Request.Context(), fileKey)
	if err != nil {
		if errors.Is(err, services.ErrStorageNotConfigured) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not configured"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate signed URL"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": url})
}

func (h *AttachmentHandler) DeleteAttachment(c *gin.Context) {
	orderID := c.Param("id")
	attachmentID := c.Param("attachmentId")
	userID, _ := c.Get("user_id")
	role, _ := c.Get("user_role")

	att, err := h.svc.DeleteAttachment(c.Request.Context(), attachmentID, userID.(string), role.(string))
	if err != nil {
		switch {
		case errors.Is(err, repositories.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
		case err.Error() == "forbidden":
			c.JSON(http.StatusForbidden, gin.H{"error": "only the uploader or an admin can delete this file"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete attachment"})
		}
		return
	}

	// Notify clients so they remove the event from the timeline
	if att.EventID != nil {
		h.hub.Broadcast(realtime.NewEvent(realtime.EventTimelineEventDeleted, orderID, gin.H{
			"event_id": *att.EventID,
		}))
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

type attachmentResponse struct {
	ID           string `json:"id"`
	OrderID      string `json:"order_id"`
	UploadedBy   string `json:"uploaded_by"`
	UploaderName string `json:"uploader_name"`
	FileName     string `json:"file_name"`
	FileKey      string `json:"file_key"`
	FileURL      string `json:"file_url"`
	MimeType     string `json:"mime_type"`
	SizeBytes    int64  `json:"size_bytes"`
	CreatedAt    string `json:"created_at"`
}

func toAttachmentResponse(a *models.OrderAttachment) attachmentResponse {
	uploaderID := ""
	if a.UploadedBy != nil {
		uploaderID = *a.UploadedBy
	}
	return attachmentResponse{
		ID:           a.ID,
		OrderID:      a.OrderID,
		UploadedBy:   uploaderID,
		UploaderName: a.UploaderName,
		FileName:     a.FileName,
		FileKey:      a.FileKey,
		FileURL:      a.FileURL,
		MimeType:     a.MimeType,
		SizeBytes:    a.SizeBytes,
		CreatedAt:    a.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
