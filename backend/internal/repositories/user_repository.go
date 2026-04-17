package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/company/app/backend/internal/models"
	"github.com/jmoiron/sqlx"
)

var ErrNotFound = errors.New("not found")

type UserRepository struct {
	db *sqlx.DB
}

func NewUserRepository(db *sqlx.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	user := &models.User{}
	err := r.db.GetContext(ctx, user, `
		SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at
		FROM users WHERE email = $1 AND is_active = true
	`, email)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return user, err
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*models.User, error) {
	user := &models.User{}
	err := r.db.GetContext(ctx, user, `
		SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at
		FROM users WHERE id = $1
	`, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return user, err
}

func (r *UserRepository) UpdateLastLogin(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET last_login_at = NOW() WHERE id = $1
	`, userID)
	return err
}

func (r *UserRepository) SaveRefreshToken(ctx context.Context, token *models.RefreshToken) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, token.ID, token.UserID, token.TokenHash, token.ExpiresAt, token.UserAgent, token.IPAddress)
	return err
}

func (r *UserRepository) FindRefreshToken(ctx context.Context, tokenHash string) (*models.RefreshToken, error) {
	rt := &models.RefreshToken{}
	err := r.db.GetContext(ctx, rt, `
		SELECT id, user_id, token_hash, expires_at, created_at, revoked_at, user_agent, ip_address
		FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL
	`, tokenHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return rt, err
}

func (r *UserRepository) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1
	`, tokenHash)
	return err
}

func (r *UserRepository) RevokeAllUserTokens(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL
	`, userID)
	return err
}
