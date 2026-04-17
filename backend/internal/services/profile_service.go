package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/company/app/backend/internal/config"
	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
	"github.com/google/uuid"
)

var ErrStorageNotConfigured = errors.New("storage not configured")

type ProfileService struct {
	userRepo *repositories.UserRepository
	cfg      *config.Config
}

func NewProfileService(userRepo *repositories.UserRepository, cfg *config.Config) *ProfileService {
	return &ProfileService{userRepo: userRepo, cfg: cfg}
}

type AvatarUploadURLResponse struct {
	UploadURL string `json:"upload_url"`
	ObjectKey string `json:"object_key"`
}

func (s *ProfileService) GetProfile(ctx context.Context, userID string) (*models.User, error) {
	return s.userRepo.GetProfile(ctx, userID)
}

func (s *ProfileService) GetAvatarUploadURL(ctx context.Context, userID, filename, contentType string) (*AvatarUploadURLResponse, error) {
	if s.cfg.R2AccountID == "" || s.cfg.R2AccessKey == "" {
		return nil, ErrStorageNotConfigured
	}

	objectKey := fmt.Sprintf("avatars/%s/%s-%s", userID, uuid.New().String(), filename)

	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", s.cfg.R2AccountID)

	r2config, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			s.cfg.R2AccessKey, s.cfg.R2SecretKey, "",
		)),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(r2config, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})

	presignClient := s3.NewPresignClient(client)
	req, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.cfg.R2Bucket),
		Key:         aws.String(objectKey),
		ContentType: aws.String(contentType),
	}, s3.WithPresignExpires(5*time.Minute))
	if err != nil {
		return nil, err
	}

	return &AvatarUploadURLResponse{
		UploadURL: req.URL,
		ObjectKey: objectKey,
	}, nil
}

func (s *ProfileService) UpdateAvatarURL(ctx context.Context, userID, objectKey string) error {
	return s.userRepo.UpdateAvatarURL(ctx, userID, objectKey)
}

func (s *ProfileService) GetAvatarSignedURL(ctx context.Context, objectKey string) (string, error) {
	if s.cfg.R2AccountID == "" || s.cfg.R2AccessKey == "" {
		return "", ErrStorageNotConfigured
	}

	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", s.cfg.R2AccountID)

	r2config, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			s.cfg.R2AccessKey, s.cfg.R2SecretKey, "",
		)),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return "", err
	}

	client := s3.NewFromConfig(r2config, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})

	presignClient := s3.NewPresignClient(client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.R2Bucket),
		Key:    aws.String(objectKey),
	}, s3.WithPresignExpires(1*time.Hour))
	if err != nil {
		return "", err
	}

	return req.URL, nil
}
