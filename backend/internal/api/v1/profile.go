package v1

import (
	"errors"
	"net/http"

	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type ProfileHandler struct {
	profileService *services.ProfileService
}

func NewProfileHandler(profileService *services.ProfileService) *ProfileHandler {
	return &ProfileHandler{profileService: profileService}
}

func (h *ProfileHandler) GetProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	user, err := h.profileService.GetProfile(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get profile"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"profile": user.ToResponse()})
}

func (h *ProfileHandler) GetAvatarUploadURL(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		Filename    string `json:"filename" binding:"required"`
		ContentType string `json:"content_type" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.profileService.GetAvatarUploadURL(c.Request.Context(), userID.(string), req.Filename, req.ContentType)
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

func (h *ProfileHandler) UpdateAvatarURL(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		ObjectKey string `json:"object_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.profileService.UpdateAvatarURL(c.Request.Context(), userID.(string), req.ObjectKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update avatar"})
		return
	}

	// Return a fresh signed URL so the frontend can display immediately
	signedURL, err := h.profileService.GetAvatarSignedURL(c.Request.Context(), req.ObjectKey)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "avatar updated"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "avatar updated", "signed_url": signedURL})
}

func (h *ProfileHandler) GetAvatarSignedURL(c *gin.Context) {
	userID, _ := c.Get("user_id")

	user, err := h.profileService.GetProfile(c.Request.Context(), userID.(string))
	if err != nil || user.AvatarURL == nil || *user.AvatarURL == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no avatar"})
		return
	}

	signedURL, err := h.profileService.GetAvatarSignedURL(c.Request.Context(), *user.AvatarURL)
	if err != nil {
		if errors.Is(err, services.ErrStorageNotConfigured) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not configured"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate URL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"signed_url": signedURL})
}
