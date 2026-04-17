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

func (r *UserRepository) ListUsers(ctx context.Context) ([]*models.User, error) {
	var users []*models.User
	err := r.db.SelectContext(ctx, &users, `
		SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at
		FROM users ORDER BY created_at DESC
	`)
	return users, err
}

func (r *UserRepository) CreateUser(ctx context.Context, user *models.User) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, user.ID, user.Email, user.PasswordHash, user.FirstName, user.LastName, user.Role, user.IsActive)
	return err
}

func (r *UserRepository) UpdateUser(ctx context.Context, id string, email, firstName, lastName, role string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET email=$1, first_name=$2, last_name=$3, role=$4, updated_at=NOW()
		WHERE id=$5
	`, email, firstName, lastName, role, id)
	return err
}

func (r *UserRepository) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2
	`, passwordHash, id)
	return err
}

func (r *UserRepository) DeleteUser(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET is_active=false, updated_at=NOW() WHERE id=$1
	`, id)
	return err
}

func (r *UserRepository) CountAdmins(ctx context.Context) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=true`)
	return count, err
}

func (r *UserRepository) EmailExists(ctx context.Context, email, excludeID string) (bool, error) {
	var count int
	var err error
	if excludeID == "" {
		err = r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM users WHERE email=$1`, email)
	} else {
		err = r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM users WHERE email=$1 AND id != $2`, email, excludeID)
	}
	return count > 0, err
}

func (r *UserRepository) UpdateAvatarURL(ctx context.Context, userID string, avatarURL string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2`, avatarURL, userID)
	return err
}

func (r *UserRepository) GetProfile(ctx context.Context, userID string) (*models.User, error) {
	user := &models.User{}
	err := r.db.GetContext(ctx, user, `
		SELECT id, email, password_hash, first_name, last_name, role, is_active, avatar_url, created_at, updated_at, last_login_at
		FROM users WHERE id=$1
	`, userID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return user, err
}
