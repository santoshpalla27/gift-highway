package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
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

var ErrPortalNotFound = errors.New("portal not found")
var ErrPortalDisabled = errors.New("portal link is inactive")

var extToMime = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	".bmp":  "image/bmp",
	".pdf":  "application/pdf",
	".doc":  "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".txt":  "text/plain",
	".csv":  "text/csv",
	".zip":  "application/zip",
}

type PortalService struct {
	repo      *repositories.PortalRepository
	orderRepo *repositories.OrderRepository
	eventRepo *repositories.EventRepository
	cfg       *config.Config
}

func NewPortalService(
	repo *repositories.PortalRepository,
	orderRepo *repositories.OrderRepository,
	eventRepo *repositories.EventRepository,
	cfg *config.Config,
) *PortalService {
	return &PortalService{repo: repo, orderRepo: orderRepo, eventRepo: eventRepo, cfg: cfg}
}

func (s *PortalService) newR2Client(ctx context.Context) (*s3.Client, error) {
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

// ── Portal management ─────────────────────────────────────────────────────────

func (s *PortalService) CreatePortal(ctx context.Context, orderID, customerName string) (*models.CustomerPortal, error) {
	return s.repo.Create(ctx, orderID, customerName)
}

func (s *PortalService) GetByOrderID(ctx context.Context, orderID string) (*models.CustomerPortal, error) {
	p, err := s.repo.GetByOrderID(ctx, orderID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPortalNotFound
	}
	return p, err
}

func (s *PortalService) RevokePortal(ctx context.Context, orderID string) error {
	return s.repo.Revoke(ctx, orderID)
}

func (s *PortalService) RegenerateToken(ctx context.Context, orderID string) (*models.CustomerPortal, error) {
	return s.repo.RegenerateToken(ctx, orderID)
}

func (s *PortalService) GetOrderTitle(ctx context.Context, orderID string) string {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil || order == nil {
		return ""
	}
	return order.Title
}

// ValidateToken looks up the portal by token and verifies it is enabled.
func (s *PortalService) ValidateToken(ctx context.Context, token string) (*models.CustomerPortal, error) {
	p, err := s.repo.GetByToken(ctx, token)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrPortalNotFound
		}
		return nil, err
	}
	if !p.Enabled {
		return nil, ErrPortalDisabled
	}
	return p, nil
}

// ── Messages ──────────────────────────────────────────────────────────────────

func (s *PortalService) SendCustomerMessage(ctx context.Context, portal *models.CustomerPortal, message string) (*models.PortalMessage, *models.OrderEvent, error) {
	msg, err := s.repo.CreateMessage(ctx, portal.OrderID, message, portal.CustomerName, "customer")
	if err != nil {
		return nil, nil, err
	}
	ev, _ := s.eventRepo.Create(ctx, portal.OrderID, nil, models.EvtCustomerMessage, map[string]interface{}{
		"text":          message,
		"customer_name": portal.CustomerName,
		"msg_id":        msg.ID,
	})
	return msg, ev, nil
}

func (s *PortalService) SendStaffReply(ctx context.Context, portal *models.CustomerPortal, message, staffName, staffID string) (*models.PortalMessage, *models.OrderEvent, error) {
	msg, err := s.repo.CreateMessage(ctx, portal.OrderID, message, staffName, "staff")
	if err != nil {
		return nil, nil, err
	}
	sid := staffID
	ev, _ := s.eventRepo.Create(ctx, portal.OrderID, &sid, models.EvtStaffPortalReply, map[string]interface{}{
		"text":   message,
		"msg_id": msg.ID,
	})
	return msg, ev, nil
}

func (s *PortalService) ListMessages(ctx context.Context, orderID string) ([]*models.PortalMessage, error) {
	return s.repo.ListMessages(ctx, orderID)
}

func (s *PortalService) DeleteMessage(ctx context.Context, id int64) (*models.PortalMessage, *models.OrderEvent, error) {
	msg, err := s.repo.GetMessage(ctx, id)
	if err != nil {
		return nil, nil, repositories.ErrNotFound
	}
	if err := s.repo.DeleteMessage(ctx, id); err != nil {
		return nil, nil, err
	}
	ev, _ := s.eventRepo.Create(ctx, msg.OrderID, nil, models.EvtPortalMessageDeleted, map[string]interface{}{
		"msg_id":        id,
		"sender_type":   msg.SenderType,
		"portal_sender": msg.PortalSender,
	})
	return msg, ev, nil
}

// ── Attachments ───────────────────────────────────────────────────────────────

type PortalUploadURLResponse struct {
	UploadURL   string `json:"upload_url"`
	ContentType string `json:"content_type"`
	S3Key       string `json:"s3_key"`
}

func (s *PortalService) GetUploadURL(ctx context.Context, orderID, fileName string) (*PortalUploadURLResponse, error) {
	ext := ""
	if idx := strings.LastIndex(fileName, "."); idx >= 0 {
		ext = strings.ToLower(fileName[idx:])
	}
	mime, ok := extToMime[ext]
	if !ok {
		mime = "application/octet-stream"
	}

	safe := sanitizeFilename(fileName)
	fileKey := fmt.Sprintf("portal/%s/%s-%s", orderID, uuid.New().String(), safe)

	client, err := s.newR2Client(ctx)
	if err != nil {
		return nil, err
	}
	presignClient := s3.NewPresignClient(client)
	putReq, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.cfg.R2Bucket),
		Key:         aws.String(fileKey),
		ContentType: aws.String(mime),
	}, s3.WithPresignExpires(10*time.Minute))
	if err != nil {
		return nil, err
	}
	return &PortalUploadURLResponse{
		UploadURL:   putReq.URL,
		ContentType: mime,
		S3Key:       fileKey,
	}, nil
}

type PortalAttachmentWithURL struct {
	models.PortalAttachment
	ViewURL string `json:"view_url"`
}

func (s *PortalService) ConfirmAttachment(ctx context.Context, portal *models.CustomerPortal, s3Key, fileName, fileType string, fileSize int64) (*PortalAttachmentWithURL, error) {
	att, err := s.repo.CreateAttachment(ctx, &models.PortalAttachment{
		OrderID:  portal.OrderID,
		S3Key:    s3Key,
		FileName: fileName,
		FileType: fileType,
		FileSize: fileSize,
	})
	if err != nil {
		return nil, err
	}

	// Inject into order timeline
	_, _ = s.eventRepo.Create(ctx, portal.OrderID, nil, models.EvtCustomerAttachment, map[string]interface{}{
		"file_name":     fileName,
		"file_type":     fileType,
		"size_bytes":    fileSize,
		"s3_key":        s3Key,
		"att_id":        att.ID,
		"customer_name": portal.CustomerName,
	})

	viewURL, _ := s.getViewURL(ctx, s3Key)
	return &PortalAttachmentWithURL{PortalAttachment: *att, ViewURL: viewURL}, nil
}

func (s *PortalService) SaveAttachment(ctx context.Context, orderID, s3Key, fileName, fileType string, fileSize int64) (*PortalAttachmentWithURL, error) {
	att, err := s.repo.CreateAttachment(ctx, &models.PortalAttachment{
		OrderID:  orderID,
		S3Key:    s3Key,
		FileName: fileName,
		FileType: fileType,
		FileSize: fileSize,
	})
	if err != nil {
		return nil, err
	}
	viewURL, _ := s.getViewURL(ctx, s3Key)
	return &PortalAttachmentWithURL{PortalAttachment: *att, ViewURL: viewURL}, nil
}

func (s *PortalService) ListAttachments(ctx context.Context, orderID string) ([]*PortalAttachmentWithURL, error) {
	atts, err := s.repo.ListAttachments(ctx, orderID)
	if err != nil {
		return nil, err
	}
	result := make([]*PortalAttachmentWithURL, len(atts))
	for i, a := range atts {
		viewURL, _ := s.getViewURL(ctx, a.S3Key)
		result[i] = &PortalAttachmentWithURL{PortalAttachment: *a, ViewURL: viewURL}
	}
	return result, nil
}

func (s *PortalService) DeleteAttachment(ctx context.Context, id int64) error {
	att, err := s.repo.GetAttachment(ctx, id)
	if err != nil {
		return repositories.ErrNotFound
	}
	if err := s.repo.DeleteAttachment(ctx, id); err != nil {
		return err
	}
	if client, err := s.newR2Client(ctx); err == nil {
		_, _ = client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(s.cfg.R2Bucket),
			Key:    aws.String(att.S3Key),
		})
	}
	return nil
}

func (s *PortalService) GetAttachmentDownloadURL(ctx context.Context, attID int64, fileName string) (string, error) {
	att, err := s.repo.GetAttachment(ctx, attID)
	if err != nil {
		return "", repositories.ErrNotFound
	}
	client, err := s.newR2Client(ctx)
	if err != nil {
		return "", err
	}
	presignClient := s3.NewPresignClient(client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket:                     aws.String(s.cfg.R2Bucket),
		Key:                        aws.String(att.S3Key),
		ResponseContentDisposition: aws.String(fmt.Sprintf(`attachment; filename="%s"`, fileName)),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (s *PortalService) getViewURL(ctx context.Context, s3Key string) (string, error) {
	client, err := s.newR2Client(ctx)
	if err != nil {
		return "", err
	}
	presignClient := s3.NewPresignClient(client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.R2Bucket),
		Key:    aws.String(s3Key),
	}, s3.WithPresignExpires(7*24*time.Hour))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}
