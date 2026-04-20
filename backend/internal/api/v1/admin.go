package v1

import (
	"errors"
	"net/http"
	"time"

	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	adminService *services.AdminService
}

func NewAdminHandler(adminService *services.AdminService) *AdminHandler {
	return &AdminHandler{adminService: adminService}
}

type userListItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

func toListItem(u *models.User) userListItem {
	name := u.FirstName
	if u.LastName != "" {
		name += " " + u.LastName
	}
	return userListItem{
		ID:        u.ID,
		Name:      name,
		Email:     u.Email,
		Role:      u.Role,
		IsActive:  u.IsActive,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
	}
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	users, err := h.adminService.ListUsers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch users"})
		return
	}
	items := make([]userListItem, len(users))
	for i, u := range users {
		items[i] = toListItem(u)
	}
	c.JSON(http.StatusOK, gin.H{"users": items})
}

func (h *AdminHandler) CreateUser(c *gin.Context) {
	var req services.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, err := h.adminService.CreateUser(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, services.ErrEmailTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": "email already in use"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": toListItem(user)})
}

func (h *AdminHandler) UpdateUser(c *gin.Context) {
	id := c.Param("id")
	var req services.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.adminService.UpdateUser(c.Request.Context(), id, req); err != nil {
		if errors.Is(err, services.ErrEmailTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": "email already in use"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *AdminHandler) ChangePassword(c *gin.Context) {
	id := c.Param("id")
	var req services.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.adminService.ChangePassword(c.Request.Context(), id, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to change password"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}

func (h *AdminHandler) DisableUser(c *gin.Context) {
	id := c.Param("id")
	requestorID, _ := c.Get("user_id")
	if err := h.adminService.DisableUser(c.Request.Context(), id, requestorID.(string)); err != nil {
		switch {
		case errors.Is(err, services.ErrCannotDisableSelf):
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot disable yourself"})
		case errors.Is(err, services.ErrLastAdmin):
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot remove the last admin"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to disable user"})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "user disabled"})
}

func (h *AdminHandler) EnableUser(c *gin.Context) {
	id := c.Param("id")
	if err := h.adminService.EnableUser(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enable user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "user enabled"})
}

func (h *AdminHandler) DeleteUser(c *gin.Context) {
	id := c.Param("id")
	requestorID, _ := c.Get("user_id")
	if err := h.adminService.HardDeleteUser(c.Request.Context(), id, requestorID.(string)); err != nil {
		switch {
		case errors.Is(err, services.ErrCannotDeleteSelf):
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete yourself"})
		case errors.Is(err, services.ErrLastAdmin):
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot remove the last admin"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}
