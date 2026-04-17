package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/company/app/backend/internal/auth"
	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserInactive       = errors.New("user account is inactive")
	ErrTokenExpired       = errors.New("token expired")
	ErrTokenInvalid       = errors.New("token invalid")
)

type AuthService struct {
	userRepo      *repositories.UserRepository
	jwtManager    *auth.JWTManager
	refreshExpiry time.Duration
}

func NewAuthService(userRepo *repositories.UserRepository, jwtManager *auth.JWTManager, refreshExpiry time.Duration) *AuthService {
	return &AuthService{
		userRepo:      userRepo,
		jwtManager:    jwtManager,
		refreshExpiry: refreshExpiry,
	}
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

type LoginResponse struct {
	User   models.UserResponse `json:"user"`
	Tokens models.TokenPair    `json:"tokens"`
}

func (s *AuthService) Login(ctx context.Context, req LoginRequest, userAgent, ipAddress string) (*LoginResponse, error) {
	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, repositories.ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if !user.IsActive {
		return nil, ErrUserInactive
	}

	if !auth.CheckPassword(req.Password, user.PasswordHash) {
		log.Warn().Str("email", req.Email).Str("ip", ipAddress).Msg("failed login attempt")
		return nil, ErrInvalidCredentials
	}

	accessToken, err := s.jwtManager.Generate(user.ID, user.Email, user.Role)
	if err != nil {
		return nil, err
	}

	rawToken, tokenHash, err := generateRefreshToken()
	if err != nil {
		return nil, err
	}

	rt := &models.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(s.refreshExpiry),
		UserAgent: userAgent,
		IPAddress: ipAddress,
	}

	if err := s.userRepo.SaveRefreshToken(ctx, rt); err != nil {
		return nil, err
	}

	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)

	log.Info().Str("user_id", user.ID).Str("ip", ipAddress).Msg("user logged in")

	return &LoginResponse{
		User: user.ToResponse(),
		Tokens: models.TokenPair{
			AccessToken:  accessToken,
			RefreshToken: rawToken,
			ExpiresIn:    int64(15 * 60),
		},
	}, nil
}

func (s *AuthService) Logout(ctx context.Context, refreshTokenHash string, userID string) error {
	return s.userRepo.RevokeAllUserTokens(ctx, userID)
}

func (s *AuthService) Refresh(ctx context.Context, tokenHash string, userAgent, ipAddress string) (*LoginResponse, error) {
	rt, err := s.userRepo.FindRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, ErrTokenInvalid
	}

	if time.Now().After(rt.ExpiresAt) {
		return nil, ErrTokenExpired
	}

	// Revoke old token (rotation)
	_ = s.userRepo.RevokeRefreshToken(ctx, tokenHash)

	user, err := s.userRepo.FindByID(ctx, rt.UserID)
	if err != nil {
		return nil, err
	}

	accessToken, err := s.jwtManager.Generate(user.ID, user.Email, user.Role)
	if err != nil {
		return nil, err
	}

	rawToken, newTokenHash, err := generateRefreshToken()
	if err != nil {
		return nil, err
	}

	newRt := &models.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: newTokenHash,
		ExpiresAt: time.Now().Add(s.refreshExpiry),
		UserAgent: userAgent,
		IPAddress: ipAddress,
	}

	if err := s.userRepo.SaveRefreshToken(ctx, newRt); err != nil {
		return nil, err
	}

	return &LoginResponse{
		User: user.ToResponse(),
		Tokens: models.TokenPair{
			AccessToken:  accessToken,
			RefreshToken: rawToken,
			ExpiresIn:    int64(15 * 60),
		},
	}, nil
}

func generateRefreshToken() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return
	}
	raw = hex.EncodeToString(b)
	h := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(h[:])
	return
}
