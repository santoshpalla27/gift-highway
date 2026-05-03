package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/csv"
	"fmt"
	"io"
	"net/smtp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/company/app/backend/internal/config"
	"github.com/company/app/backend/internal/models"
	"github.com/rs/zerolog/log"
)

const auditCSVKey = "audit/orders_all.csv"

var csvHeader = []string{
	"order_number", "order_id", "title", "customer_name", "contact_number",
	"priority", "status", "assigned_to", "due_date", "created_by", "created_at", "archived",
}

type AuditService struct {
	cfg *config.Config
}

func NewAuditService(cfg *config.Config) *AuditService {
	return &AuditService{cfg: cfg}
}

func (s *AuditService) enabled() bool {
	return s.cfg.AuditR2Bucket != "" && s.cfg.R2AccountID != "" && s.cfg.R2AccessKey != ""
}

func (s *AuditService) emailEnabled() bool {
	return s.cfg.SMTPUser != "" && s.cfg.SMTPPass != "" && s.cfg.AuditEmailTo != ""
}

// AppendOrder appends a new row to the master CSV in R2.
// Always called as a goroutine — never blocks the request path.
func (s *AuditService) AppendOrder(order *models.OrderWithNames) {
	if !s.enabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := s.newR2Client(ctx)
	if err != nil {
		log.Error().Err(err).Msg("audit: R2 client error on append")
		return
	}

	existing := s.downloadCSV(ctx, client)
	updated := s.appendRow(existing, s.orderToRow(order))
	if err := s.uploadCSV(ctx, client, updated); err != nil {
		log.Error().Err(err).Msg("audit: upload failed on append")
	} else {
		log.Info().Int("order_number", order.OrderNumber).Msg("audit: order appended to CSV")
	}
}

// UpdateArchived updates the archived column for an existing row.
// Always called as a goroutine.
func (s *AuditService) UpdateArchived(orderID string, archived bool) {
	if !s.enabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := s.newR2Client(ctx)
	if err != nil {
		log.Error().Err(err).Msg("audit: R2 client error on archive update")
		return
	}

	existing := s.downloadCSV(ctx, client)
	updated := s.setArchivedField(existing, orderID, archived)
	if err := s.uploadCSV(ctx, client, updated); err != nil {
		log.Error().Err(err).Msg("audit: upload failed on archive update")
	}
}

// StartCron starts the daily (11 PM) and monthly (1st of month midnight) report goroutines.
func (s *AuditService) StartCron() {
	go s.dailyCronLoop()
	go s.monthlyCronLoop()
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func (s *AuditService) newR2Client(ctx context.Context) (*s3.Client, error) {
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

// downloadCSV fetches the master CSV from R2. Returns a header-only CSV if the file doesn't exist yet.
func (s *AuditService) downloadCSV(ctx context.Context, client *s3.Client) []byte {
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.AuditR2Bucket),
		Key:    aws.String(auditCSVKey),
	})
	if err != nil {
		// File not created yet — seed with header row
		var buf bytes.Buffer
		w := csv.NewWriter(&buf)
		_ = w.Write(csvHeader)
		w.Flush()
		return buf.Bytes()
	}
	defer out.Body.Close()
	data, err := io.ReadAll(out.Body)
	if err != nil {
		var buf bytes.Buffer
		w := csv.NewWriter(&buf)
		_ = w.Write(csvHeader)
		w.Flush()
		return buf.Bytes()
	}
	return data
}

func (s *AuditService) uploadCSV(ctx context.Context, client *s3.Client, data []byte) error {
	_, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.cfg.AuditR2Bucket),
		Key:         aws.String(auditCSVKey),
		Body:        bytes.NewReader(data),
		ContentType: aws.String("text/csv"),
	})
	return err
}

func (s *AuditService) appendRow(existing []byte, row []string) []byte {
	// Ensure existing content ends with a newline before appending
	if len(existing) > 0 && existing[len(existing)-1] != '\n' {
		existing = append(existing, '\n')
	}
	var rowBuf bytes.Buffer
	w := csv.NewWriter(&rowBuf)
	_ = w.Write(row)
	w.Flush()
	return append(existing, rowBuf.Bytes()...)
}

// setArchivedField finds a row by order_id and flips its archived column.
func (s *AuditService) setArchivedField(data []byte, orderID string, archived bool) []byte {
	r := csv.NewReader(bytes.NewReader(data))
	records, err := r.ReadAll()
	if err != nil || len(records) < 2 {
		return data
	}

	orderIDCol, archivedCol := -1, -1
	for i, h := range records[0] {
		switch h {
		case "order_id":
			orderIDCol = i
		case "archived":
			archivedCol = i
		}
	}
	if orderIDCol == -1 || archivedCol == -1 {
		return data
	}

	val := "no"
	if archived {
		val = "yes"
	}
	for i := 1; i < len(records); i++ {
		if len(records[i]) > orderIDCol && records[i][orderIDCol] == orderID {
			if len(records[i]) > archivedCol {
				records[i][archivedCol] = val
			}
			break
		}
	}

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.WriteAll(records)
	w.Flush()
	return buf.Bytes()
}

func (s *AuditService) orderToRow(o *models.OrderWithNames) []string {
	dueDate := ""
	if o.DueDate != nil {
		dueDate = o.DueDate.Format("2006-01-02")
	}
	archived := "no"
	if o.IsArchived {
		archived = "yes"
	}
	return []string{
		fmt.Sprintf("%d", o.OrderNumber),
		o.ID,
		o.Title,
		o.CustomerName,
		o.ContactNumber,
		o.Priority,
		o.Status,
		strings.Join(o.AssignedNames, "; "),
		dueDate,
		o.CreatedByName,
		o.CreatedAt.UTC().Format(time.RFC3339),
		archived,
	}
}

// filterByDateRange reads the master CSV and returns only rows whose created_at falls within [from, to).
func (s *AuditService) filterByDateRange(data []byte, from, to time.Time) []byte {
	r := csv.NewReader(bytes.NewReader(data))
	records, err := r.ReadAll()
	if err != nil || len(records) == 0 {
		return data
	}

	createdAtCol := -1
	for i, h := range records[0] {
		if h == "created_at" {
			createdAtCol = i
			break
		}
	}
	if createdAtCol == -1 {
		return data
	}

	filtered := [][]string{records[0]}
	for _, row := range records[1:] {
		if len(row) <= createdAtCol {
			continue
		}
		t, err := time.Parse(time.RFC3339, row[createdAtCol])
		if err != nil {
			continue
		}
		if !t.Before(from) && t.Before(to) {
			filtered = append(filtered, row)
		}
	}

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.WriteAll(filtered)
	w.Flush()
	return buf.Bytes()
}

// ── Email ─────────────────────────────────────────────────────────────────────

func (s *AuditService) sendEmail(subject, body, filename string, attachment []byte) error {
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, "smtp.gmail.com")
	boundary := "GiftHighwayAuditBoundary42"

	encoded := base64.StdEncoding.EncodeToString(attachment)

	var msg strings.Builder
	msg.WriteString("From: " + s.cfg.SMTPUser + "\r\n")
	msg.WriteString("To: " + s.cfg.AuditEmailTo + "\r\n")
	msg.WriteString("Subject: " + subject + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(`Content-Type: multipart/mixed; boundary="` + boundary + `"` + "\r\n\r\n")

	// Plain text body part
	msg.WriteString("--" + boundary + "\r\n")
	msg.WriteString("Content-Type: text/plain; charset=utf-8\r\n\r\n")
	msg.WriteString(body + "\r\n\r\n")

	// CSV attachment part
	msg.WriteString("--" + boundary + "\r\n")
	msg.WriteString(`Content-Type: text/csv; name="` + filename + `"` + "\r\n")
	msg.WriteString(`Content-Disposition: attachment; filename="` + filename + `"` + "\r\n")
	msg.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	for i := 0; i < len(encoded); i += 76 {
		end := i + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		msg.WriteString(encoded[i:end] + "\r\n")
	}
	msg.WriteString("--" + boundary + "--\r\n")

	return smtp.SendMail("smtp.gmail.com:587", auth, s.cfg.SMTPUser,
		[]string{s.cfg.AuditEmailTo}, []byte(msg.String()))
}

// ── Report senders ────────────────────────────────────────────────────────────

func (s *AuditService) sendDailyReport() {
	if !s.enabled() || !s.emailEnabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := s.newR2Client(ctx)
	if err != nil {
		log.Error().Err(err).Msg("audit: daily report R2 client error")
		return
	}

	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	to := from.Add(24 * time.Hour)

	all := s.downloadCSV(ctx, client)
	filtered := s.filterByDateRange(all, from, to)

	// Count data rows (subtract 1 for header)
	rowCount := bytes.Count(filtered, []byte("\n")) - 1
	if rowCount < 0 {
		rowCount = 0
	}

	dateStr := now.Format("2006-01-02")
	subject := fmt.Sprintf("Gift Highway — Daily Orders Report %s", dateStr)
	body := fmt.Sprintf(
		"Daily orders report for %s\n\nTotal orders created today: %d\n\nSee attached CSV for full details.",
		now.Format("January 2, 2006"), rowCount,
	)
	filename := fmt.Sprintf("daily_%s.csv", dateStr)

	if err := s.sendEmail(subject, body, filename, filtered); err != nil {
		log.Error().Err(err).Msg("audit: failed to send daily report")
	} else {
		log.Info().Str("date", dateStr).Int("rows", rowCount).Msg("audit: daily report sent")
	}
}

func (s *AuditService) sendMonthlyReport() {
	if !s.enabled() || !s.emailEnabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := s.newR2Client(ctx)
	if err != nil {
		log.Error().Err(err).Msg("audit: monthly report R2 client error")
		return
	}

	now := time.Now()
	// Report covers the previous month
	firstOfThisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	to := firstOfThisMonth
	from := firstOfThisMonth.AddDate(0, -1, 0)

	all := s.downloadCSV(ctx, client)
	filtered := s.filterByDateRange(all, from, to)

	rowCount := bytes.Count(filtered, []byte("\n")) - 1
	if rowCount < 0 {
		rowCount = 0
	}

	monthLabel := from.Format("January 2006")
	subject := fmt.Sprintf("Gift Highway — Monthly Orders Report %s", monthLabel)
	body := fmt.Sprintf(
		"Monthly orders report for %s\n\nTotal orders created: %d\n\nSee attached CSV for full details.",
		monthLabel, rowCount,
	)
	filename := fmt.Sprintf("monthly_%s.csv", from.Format("2006-01"))

	if err := s.sendEmail(subject, body, filename, filtered); err != nil {
		log.Error().Err(err).Msg("audit: failed to send monthly report")
	} else {
		log.Info().Str("month", monthLabel).Int("rows", rowCount).Msg("audit: monthly report sent")
	}
}

// ── Cron loops ────────────────────────────────────────────────────────────────

func (s *AuditService) dailyCronLoop() {
	for {
		time.Sleep(time.Until(nextDailyAt(23, 0))) // 11 PM
		s.sendDailyReport()
	}
}

func (s *AuditService) monthlyCronLoop() {
	for {
		time.Sleep(time.Until(nextMonthlyAt()))
		s.sendMonthlyReport()
	}
}

// nextDailyAt returns the next wall-clock time when hour:minute occurs today or tomorrow.
func nextDailyAt(hour, minute int) time.Time {
	now := time.Now()
	candidate := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, now.Location())
	if candidate.After(now) {
		return candidate
	}
	return candidate.Add(24 * time.Hour)
}

// nextMonthlyAt returns the next 1st-of-month at midnight.
func nextMonthlyAt() time.Time {
	now := time.Now()
	first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	if first.After(now) {
		return first
	}
	return time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, now.Location())
}
