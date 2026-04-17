package services

import (
	"context"
	"errors"

	"github.com/company/app/backend/internal/auth"
	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
	"github.com/google/uuid"
)

var (
	ErrEmailTaken        = errors.New("email already in use")
	ErrCannotDeleteSelf  = errors.New("cannot delete yourself")
	ErrLastAdmin         = errors.New("cannot remove the last admin")
	ErrCannotDisableSelf = errors.New("cannot disable yourself")
)

type AdminService struct {
	userRepo *repositories.UserRepository
}

func NewAdminService(userRepo *repositories.UserRepository) *AdminService {
	return &AdminService{userRepo: userRepo}
}

type CreateUserRequest struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Role     string `json:"role" binding:"required,oneof=admin user"`
}

type UpdateUserRequest struct {
	Name  string `json:"name" binding:"required"`
	Email string `json:"email" binding:"required,email"`
	Role  string `json:"role" binding:"required,oneof=admin user"`
}

type ChangePasswordRequest struct {
	Password string `json:"password" binding:"required,min=8"`
}

func (s *AdminService) ListUsers(ctx context.Context) ([]*models.User, error) {
	return s.userRepo.ListUsers(ctx)
}

func (s *AdminService) CreateUser(ctx context.Context, req CreateUserRequest) (*models.User, error) {
	exists, err := s.userRepo.EmailExists(ctx, req.Email, "")
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmailTaken
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	firstName, lastName := splitName(req.Name)

	user := &models.User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		PasswordHash: hash,
		FirstName:    firstName,
		LastName:     lastName,
		Role:         req.Role,
		IsActive:     true,
	}

	if err := s.userRepo.CreateUser(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *AdminService) UpdateUser(ctx context.Context, id string, req UpdateUserRequest) error {
	exists, err := s.userRepo.EmailExists(ctx, req.Email, id)
	if err != nil {
		return err
	}
	if exists {
		return ErrEmailTaken
	}

	firstName, lastName := splitName(req.Name)
	return s.userRepo.UpdateUser(ctx, id, req.Email, firstName, lastName, req.Role)
}

func (s *AdminService) ChangePassword(ctx context.Context, id string, req ChangePasswordRequest) error {
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		return err
	}
	return s.userRepo.UpdatePassword(ctx, id, hash)
}

func (s *AdminService) DisableUser(ctx context.Context, id, requestorID string) error {
	if id == requestorID {
		return ErrCannotDisableSelf
	}

	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}

	if user.Role == "admin" {
		count, err := s.userRepo.CountAdmins(ctx)
		if err != nil {
			return err
		}
		if count <= 1 {
			return ErrLastAdmin
		}
	}

	if err := s.userRepo.DisableUser(ctx, id); err != nil {
		return err
	}
	return s.userRepo.RevokeAllUserTokens(ctx, id)
}

func (s *AdminService) EnableUser(ctx context.Context, id string) error {
	return s.userRepo.EnableUser(ctx, id)
}

func (s *AdminService) HardDeleteUser(ctx context.Context, id, requestorID string) error {
	if id == requestorID {
		return ErrCannotDeleteSelf
	}

	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}

	if user.Role == "admin" {
		count, err := s.userRepo.CountAdmins(ctx)
		if err != nil {
			return err
		}
		if count <= 1 {
			return ErrLastAdmin
		}
	}

	return s.userRepo.HardDeleteUser(ctx, id)
}

func splitName(name string) (first, last string) {
	for i, ch := range name {
		if ch == ' ' {
			return name[:i], name[i+1:]
		}
	}
	return name, ""
}
