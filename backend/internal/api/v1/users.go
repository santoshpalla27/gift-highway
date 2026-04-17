package v1

import (
	"net/http"

	"github.com/company/app/backend/internal/repositories"
	"github.com/gin-gonic/gin"
)

type UsersHandler struct {
	userRepo *repositories.UserRepository
}

func NewUsersHandler(userRepo *repositories.UserRepository) *UsersHandler {
	return &UsersHandler{userRepo: userRepo}
}

func (h *UsersHandler) ListForAssignment(c *gin.Context) {
	users, err := h.userRepo.ListUsers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch users"})
		return
	}

	type userItem struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	items := make([]userItem, 0, len(users))
	for _, u := range users {
		if !u.IsActive {
			continue
		}
		name := u.FirstName
		if u.LastName != "" {
			name += " " + u.LastName
		}
		items = append(items, userItem{ID: u.ID, Name: name})
	}
	c.JSON(http.StatusOK, gin.H{"users": items})
}
