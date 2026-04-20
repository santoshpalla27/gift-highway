package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/company/app/backend/internal/config"
	"github.com/company/app/backend/internal/models"
	"github.com/company/app/backend/internal/repositories"
	"github.com/google/uuid"
)

var (
	ErrFileTooLarge    = errors.New("file exceeds 50 MB limit")
	ErrInvalidMIMEType = errors.New("file type not allowed")
	ErrForbidden       = errors.New("forbidden")
)

var allowedMIMETypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"application/pdf": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       true,
	"application/msword":       true,
	"application/vnd.ms-excel": true,
	"text/plain":               true,
}

const maxFileSizeBytes = 50 * 1024 * 1024 // 50 MB

type AttachmentService struct {
	repo      *repositories.AttachmentRepository
	eventRepo *repositories.EventRepository
	cfg       *config.Config
}

func NewAttachmentService(repo *repositories.AttachmentRepository, eventRepo *repositories.EventRepository, cfg *config.Config) *AttachmentService {
	return &AttachmentService{repo: repo, eventRepo: eventRepo, cfg: cfg}
}

type UploadURLRequest struct {
	FileName  string `json:"file_name"`
	MimeType  string `json:"mime_type"`
	SizeBytes int64  `json:"size_bytes"`
}

type UploadURLResponse struct {
	UploadURL string `json:"upload_url"`
	FileKey   string `json:"file_key"`
	FileURL   string `json:"file_url"`
}

type ConfirmUploadRequest struct {
	FileName  string `json:"file_name"`
	FileKey   string `json:"file_key"`
	FileURL   string `json:"file_url"`
	MimeType  string `json:"mime_type"`
	SizeBytes int64  `json:"size_bytes"`
}

func sanitizeFilename(name string) string {
	var b strings.Builder
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '-' || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}

func (s *AttachmentService) newR2Client(ctx context.Context) (*s3.Client, error) {
	if s.cfg.R2AccountID == "" || s.cfg.R2AccessKey == "" {
		return nil, ErrStorageNotConfigured
	}
	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", s.cfg.R2AccountID)
	r2cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			s.cfg.R2AccessKey, s.cfg.R2SecretKey, "",
		)),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return nil, err
	}
	return s3.NewFromConfig(r2cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	}), nil
}

func (s *AttachmentService) GetUploadURL(ctx context.Context, orderID string, req UploadURLRequest) (*UploadURLResponse, error) {
	if req.SizeBytes > maxFileSizeBytes {
		return nil, ErrFileTooLarge
	}
	if !allowedMIMETypes[req.MimeType] {
		return nil, ErrInvalidMIMEType
	}

	safe := sanitizeFilename(req.FileName)
	fileKey := fmt.Sprintf("orders/%s/%s-%s", orderID, uuid.New().String(), safe)

	client, err := s.newR2Client(ctx)
	if err != nil {
		return nil, err
	}
	presignClient := s3.NewPresignClient(client)

	// PUT URL for the direct upload (5 min)
	putReq, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.cfg.R2Bucket),
		Key:           aws.String(fileKey),
		ContentType:   aws.String(req.MimeType),
		ContentLength: aws.Int64(req.SizeBytes),
	}, s3.WithPresignExpires(5*time.Minute))
	if err != nil {
		return nil, err
	}

	// GET URL for viewing — 7 days. This is stored in the DB as file_url.
	getReq, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.R2Bucket),
		Key:    aws.String(fileKey),
	}, s3.WithPresignExpires(7*24*time.Hour))
	if err != nil {
		return nil, err
	}

	return &UploadURLResponse{
		UploadURL: putReq.URL,
		FileKey:   fileKey,
		FileURL:   getReq.URL,
	}, nil
}

// GetSignedURL returns a fresh 7-day presigned GET URL for an existing attachment.
func (s *AttachmentService) GetSignedURL(ctx context.Context, fileKey string) (string, error) {
	client, err := s.newR2Client(ctx)
	if err != nil {
		return "", err
	}
	presignClient := s3.NewPresignClient(client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.R2Bucket),
		Key:    aws.String(fileKey),
	}, s3.WithPresignExpires(7*24*time.Hour))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}


// GetDownloadURL generates a short-lived presigned GET URL with Content-Disposition: attachment
// so the browser triggers a direct download without any fetch/blob tricks.
func (s *AttachmentService) GetDownloadURL(ctx context.Context, fileKey, fileName string) (string, error) {
	client, err := s.newR2Client(ctx)
	if err != nil {
		return "", err
	}
	presignClient := s3.NewPresignClient(client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket:                     aws.String(s.cfg.R2Bucket),
		Key:                        aws.String(fileKey),
		ResponseContentDisposition: aws.String(fmt.Sprintf(`attachment; filename="%s"`, fileName)),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (s *AttachmentService) ConfirmUpload(ctx context.Context, orderID, userID string, req ConfirmUploadRequest) (*models.OrderAttachment, *models.OrderEvent, error) {
	// Create the timeline event first so we can link its ID
	ev, err := s.eventRepo.Create(ctx, orderID, &userID, models.EvtAttachmentAdded, map[string]interface{}{
		"file_name":  req.FileName,
		"file_key":   req.FileKey,
		"file_url":   req.FileURL,
		"mime_type":  req.MimeType,
		"size_bytes": req.SizeBytes,
	})
	if err != nil {
		return nil, nil, err
	}

	attachment := &models.OrderAttachment{
		OrderID:    orderID,
		EventID:    &ev.ID,
		UploadedBy: &userID,
		FileName:   req.FileName,
		FileKey:    req.FileKey,
		FileURL:    req.FileURL,
		MimeType:   req.MimeType,
		SizeBytes:  req.SizeBytes,
	}
	att, err := s.repo.Create(ctx, attachment)
	if err != nil {
		return nil, nil, err
	}
	return att, ev, nil
}

func (s *AttachmentService) ListAttachments(ctx context.Context, orderID string) ([]*models.OrderAttachment, error) {
	return s.repo.ListByOrder(ctx, orderID)
}

func (s *AttachmentService) DeleteAttachmentByEventID(ctx context.Context, eventID, userID, role string) (*models.OrderAttachment, error) {
	att, err := s.repo.GetByEventID(ctx, eventID)
	if err != nil {
		return nil, repositories.ErrNotFound
	}
	return s.DeleteAttachment(ctx, att.ID, userID, role)
}

func (s *AttachmentService) DeleteAttachment(ctx context.Context, attachmentID, userID, role string) (*models.OrderAttachment, error) {
	att, err := s.repo.GetByID(ctx, attachmentID)
	if err != nil {
		return nil, repositories.ErrNotFound
	}

	uploaderID := ""
	if att.UploadedBy != nil {
		uploaderID = *att.UploadedBy
	}
	if role != "admin" && uploaderID != userID {
		return nil, ErrForbidden
	}

	if err := s.repo.Delete(ctx, attachmentID); err != nil {
		return nil, err
	}

	// Replace the timeline event with a tombstone instead of deleting it
	if att.EventID != nil {
		_ = s.eventRepo.UpdateTypeAndPayload(ctx, *att.EventID, models.EvtAttachmentDeleted, map[string]interface{}{
			"file_name": att.FileName,
		})
	}

	// Delete the object from R2 to avoid orphan files
	if r2Client, err := s.newR2Client(ctx); err == nil {
		_, _ = r2Client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(s.cfg.R2Bucket),
			Key:    aws.String(att.FileKey),
		})
	}

	return att, nil
}

