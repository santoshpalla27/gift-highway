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
	"sync"
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

var ist = time.FixedZone("IST", 5*60*60+30*60) // UTC+5:30

// order_id = user-visible title; UUID is intentionally excluded
var csvHeader = []string{
	"order_number", "order_id", "customer_name", "contact_number",
	"priority", "status", "assigned_to", "due_date", "created_by", "created_at", "archived", "deleted",
}

type AuditService struct {
	cfg *config.Config
	mu  sync.Mutex // guards all R2 read-modify-write operations
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

	s.mu.Lock()
	defer s.mu.Unlock()

	existing := s.downloadCSV(ctx, client)
	if s.rowExists(existing, order.OrderNumber) {
		log.Warn().Int("order_number", order.OrderNumber).Msg("audit: duplicate append skipped")
		return
	}
	updated := s.appendRow(existing, s.orderToRow(order))
	if err := s.uploadCSV(ctx, client, updated); err != nil {
		log.Error().Err(err).Msg("audit: upload failed on append")
		s.sendWriteFailureAlert(err, "append")
	} else {
		log.Info().Int("order_number", order.OrderNumber).Msg("audit: order appended to CSV")
	}
}

// SyncOrder updates the full CSV row for an existing order.
// Always called as a goroutine — never blocks the request path.
func (s *AuditService) SyncOrder(order *models.OrderWithNames) {
	if !s.enabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := s.newR2Client(ctx)
	if err != nil {
		log.Error().Err(err).Msg("audit: R2 client error on sync")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	existing := s.downloadCSV(ctx, client)
	updated := s.syncRow(existing, order)
	if err := s.uploadCSV(ctx, client, updated); err != nil {
		log.Error().Err(err).Msg("audit: upload failed on sync")
		s.sendWriteFailureAlert(err, "sync")
	} else {
		log.Info().Int("order_number", order.OrderNumber).Msg("audit: order row synced")
	}
}

// AuditStatus is returned by the status endpoint.
type AuditStatus struct {
	StorageConfigured bool    `json:"storage_configured"`
	EmailConfigured   bool    `json:"email_configured"`
	CSVExists         bool    `json:"csv_exists"`
	CSVSizeBytes      int64   `json:"csv_size_bytes"`
	CSVRowCount       int     `json:"csv_row_count"`
	CSVLastModified   *string `json:"csv_last_modified"`
	EmailTo           string  `json:"email_to"`
	NextDailyReport   string  `json:"next_daily_report"`
	NextMonthlyReport string  `json:"next_monthly_report"`
}

// Status returns live information about the audit system.
func (s *AuditService) Status(ctx context.Context) AuditStatus {
	st := AuditStatus{
		StorageConfigured: s.enabled(),
		EmailConfigured:   s.emailEnabled(),
		EmailTo:           maskEmail(s.cfg.AuditEmailTo),
		NextDailyReport:   nextDailyAt(23, 0).Format(time.RFC3339),
		NextMonthlyReport: nextMonthlyAt().Format(time.RFC3339),
	}
	if !s.enabled() {
		return st
	}
	client, err := s.newR2Client(ctx)
	if err != nil {
		return st
	}
	head, err := client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.cfg.AuditR2Bucket),
		Key:    aws.String(auditCSVKey),
	})
	if err != nil {
		return st
	}
	st.CSVExists = true
	if head.ContentLength != nil {
		st.CSVSizeBytes = *head.ContentLength
	}
	if head.LastModified != nil {
		t := head.LastModified.Format(time.RFC3339)
		st.CSVLastModified = &t
	}
	// Count rows by downloading the file
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.AuditR2Bucket),
		Key:    aws.String(auditCSVKey),
	})
	if err == nil {
		defer out.Body.Close()
		data, _ := io.ReadAll(out.Body)
		lines := bytes.Count(data, []byte("\n"))
		if lines > 0 {
			st.CSVRowCount = lines - 1 // subtract header
		}
	}
	return st
}

// GetCSVBytes returns the full unfiltered CSV bytes from R2.
func (s *AuditService) GetCSVBytes(ctx context.Context) ([]byte, error) {
	if !s.enabled() {
		return nil, fmt.Errorf("audit storage not configured")
	}
	client, err := s.newR2Client(ctx)
	if err != nil {
		return nil, err
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.AuditR2Bucket),
		Key:    aws.String(auditCSVKey),
	})
	if err != nil {
		return nil, fmt.Errorf("CSV not found — no orders have been logged yet")
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

// GetCSVBytesFiltered returns CSV bytes filtered by range: "all", "today", or "month".
// Returns the data and a suggested filename.
func (s *AuditService) GetCSVBytesFiltered(ctx context.Context, rangeParam, fromDate, toDate string) ([]byte, string, error) {
	all, err := s.GetCSVBytes(ctx)
	if err != nil {
		return nil, "", err
	}
	nowIST := time.Now().In(ist)
	switch rangeParam {
	case "today":
		from := time.Date(nowIST.Year(), nowIST.Month(), nowIST.Day(), 0, 0, 0, 0, ist)
		to := from.Add(24 * time.Hour)
		filtered := s.filterByDateRange(all, from, to)
		return filtered, "orders_today_" + nowIST.Format("2006-01-02") + ".csv", nil
	case "month":
		from := time.Date(nowIST.Year(), nowIST.Month(), 1, 0, 0, 0, 0, ist)
		to := time.Date(nowIST.Year(), nowIST.Month()+1, 1, 0, 0, 0, 0, ist)
		filtered := s.filterByDateRange(all, from, to)
		return filtered, "orders_" + nowIST.Format("2006-01") + ".csv", nil
	case "custom":
		from, err1 := time.ParseInLocation("2006-01-02", fromDate, ist)
		to, err2 := time.ParseInLocation("2006-01-02", toDate, ist)
		if err1 != nil || err2 != nil {
			return nil, "", fmt.Errorf("invalid date format — use YYYY-MM-DD")
		}
		to = to.Add(24 * time.Hour) // make to inclusive
		filtered := s.filterByDateRange(all, from, to)
		filename := fmt.Sprintf("orders_%s_to_%s.csv", fromDate, toDate)
		return filtered, filename, nil
	default: // "all"
		return all, "orders_all_" + nowIST.Format("2006-01-02") + ".csv", nil
	}
}

// maskEmail hides part of an email for display: user@example.com → u***@example.com
func maskEmail(email string) string {
	if email == "" {
		return ""
	}
	at := strings.Index(email, "@")
	if at <= 1 {
		return email
	}
	return string(email[0]) + "***" + email[at:]
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

// downloadCSV fetches the master CSV from R2.
// Returns a header-only CSV if the file doesn't exist or the schema doesn't match.
func (s *AuditService) downloadCSV(ctx context.Context, client *s3.Client) []byte {
	freshHeader := func() []byte {
		var buf bytes.Buffer
		w := csv.NewWriter(&buf)
		_ = w.Write(csvHeader)
		w.Flush()
		return buf.Bytes()
	}

	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.AuditR2Bucket),
		Key:    aws.String(auditCSVKey),
	})
	if err != nil {
		return freshHeader()
	}
	defer out.Body.Close()
	data, err := io.ReadAll(out.Body)
	if err != nil {
		return freshHeader()
	}

	// Reject files whose header doesn't match the current schema to avoid column mismatches.
	r := csv.NewReader(bytes.NewReader(data))
	header, err := r.Read()
	if err != nil || !headersMatch(header, csvHeader) {
		log.Warn().Msg("audit: CSV schema mismatch — resetting to current schema")
		return freshHeader()
	}
	return data
}

func headersMatch(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
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


func (s *AuditService) orderToRow(o *models.OrderWithNames) []string {
	dueDateTime := ""
	if o.DueDate != nil {
		dueDateTime = o.DueDate.In(ist).Format("02/01/2006")
		if o.DueTime != nil && *o.DueTime != "" {
			dueDateTime += " " + to12h(*o.DueTime)
		}
	}
	archived := "—"
	if o.IsArchived {
		if o.ArchivedAt != nil {
			archived = o.ArchivedAt.In(ist).Format("02/01/2006 3:04 PM")
		} else {
			archived = "yes"
		}
	}
	return []string{
		fmt.Sprintf("%d", o.OrderNumber),
		o.Title,
		o.CustomerName,
		o.ContactNumber,
		o.Priority,
		o.Status,
		strings.Join(o.AssignedNames, "; "),
		dueDateTime,
		o.CreatedByName,
		o.CreatedAt.In(ist).Format("02/01/2006 3:04 PM"),
		archived,
		"—",
	}
}

// to12h converts a "15:04" 24-hour time string to "3:04 PM" 12-hour format.
func to12h(t string) string {
	pt, err := time.Parse("15:04", t)
	if err != nil {
		return t
	}
	return pt.Format("3:04 PM")
}

// MarkDeleted records the deletion timestamp on the row for the given order number.
// Always called as a goroutine after permanent deletion from the DB.
func (s *AuditService) MarkDeleted(orderNumber int) {
	if !s.enabled() {
		return
	}
	deletedAt := time.Now().In(ist).Format("02/01/2006 3:04 PM")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := s.newR2Client(ctx)
	if err != nil {
		log.Error().Err(err).Msg("audit: R2 client error on mark-deleted")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	existing := s.downloadCSV(ctx, client)
	updated := s.markDeletedRow(existing, orderNumber, deletedAt)
	if err := s.uploadCSV(ctx, client, updated); err != nil {
		log.Error().Err(err).Msg("audit: upload failed on mark-deleted")
		s.sendWriteFailureAlert(err, "mark-deleted")
	} else {
		log.Info().Int("order_number", orderNumber).Msg("audit: order marked deleted in CSV")
	}
}

// syncRow finds the row matching order.OrderNumber and replaces it entirely.
func (s *AuditService) syncRow(data []byte, order *models.OrderWithNames) []byte {
	r := csv.NewReader(bytes.NewReader(data))
	records, err := r.ReadAll()
	if err != nil || len(records) < 2 {
		return data
	}
	target := fmt.Sprintf("%d", order.OrderNumber)
	for i := 1; i < len(records); i++ {
		if len(records[i]) > 0 && records[i][0] == target {
			records[i] = s.orderToRow(order)
			break
		}
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.WriteAll(records)
	w.Flush()
	return buf.Bytes()
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
		t, err := time.ParseInLocation("02/01/2006 3:04 PM", row[createdAtCol], ist)
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

// markDeletedRow sets the deleted column to "yes" for the matching order_number row.
func (s *AuditService) markDeletedRow(data []byte, orderNumber int, deletedAt string) []byte {
	r := csv.NewReader(bytes.NewReader(data))
	records, err := r.ReadAll()
	if err != nil || len(records) < 2 {
		return data
	}

	deletedCol := -1
	for i, h := range records[0] {
		if h == "deleted" {
			deletedCol = i
			break
		}
	}
	if deletedCol == -1 {
		return data
	}

	target := fmt.Sprintf("%d", orderNumber)
	for i := 1; i < len(records); i++ {
		if len(records[i]) > 0 && records[i][0] == target {
			for len(records[i]) <= deletedCol {
				records[i] = append(records[i], "")
			}
			records[i][deletedCol] = deletedAt
			break
		}
	}

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.WriteAll(records)
	w.Flush()
	return buf.Bytes()
}

// rowExists returns true if a row with the given order_number is already in the CSV.
func (s *AuditService) rowExists(data []byte, orderNumber int) bool {
	target := fmt.Sprintf("%d", orderNumber)
	r := csv.NewReader(bytes.NewReader(data))
	records, err := r.ReadAll()
	if err != nil {
		return false
	}
	for _, row := range records[1:] {
		if len(row) > 0 && row[0] == target {
			return true
		}
	}
	return false
}

// sendWriteFailureAlert sends an email alert when an R2 write operation fails.
func (s *AuditService) sendWriteFailureAlert(writeErr error, operation string) {
	if !s.emailEnabled() {
		return
	}
	subject := "Gift Highway — Audit Write Failure"
	body := fmt.Sprintf(
		"An audit CSV write failed during the '%s' operation.\n\nError: %v\n\nOrders may not be fully logged. Please check R2 storage and server logs.",
		operation, writeErr,
	)
	if err := s.sendEmail(subject, body, "", nil); err != nil {
		log.Error().Err(err).Msg("audit: failed to send write-failure alert")
	}
}

// TestWrite writes a canary object to R2 and reads it back to verify full read/write access.
func (s *AuditService) TestWrite(ctx context.Context) error {
	if !s.enabled() {
		return fmt.Errorf("audit storage not configured")
	}
	client, err := s.newR2Client(ctx)
	if err != nil {
		return fmt.Errorf("R2 client: %w", err)
	}
	const testKey = "audit/.canary"
	payload := []byte("gift-highway-audit-canary")
	if _, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.cfg.AuditR2Bucket),
		Key:         aws.String(testKey),
		Body:        bytes.NewReader(payload),
		ContentType: aws.String("text/plain"),
	}); err != nil {
		return fmt.Errorf("PutObject failed: %w", err)
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.AuditR2Bucket),
		Key:    aws.String(testKey),
	})
	if err != nil {
		return fmt.Errorf("GetObject failed: %w", err)
	}
	out.Body.Close()
	_, _ = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.cfg.AuditR2Bucket),
		Key:    aws.String(testKey),
	})
	return nil
}

// ── Email ─────────────────────────────────────────────────────────────────────

func (s *AuditService) sendEmail(subject, body, filename string, attachment []byte) error {
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, "smtp.gmail.com")

	var msg strings.Builder
	msg.WriteString("From: " + s.cfg.SMTPUser + "\r\n")
	msg.WriteString("To: " + s.cfg.AuditEmailTo + "\r\n")
	msg.WriteString("Subject: " + subject + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")

	if len(attachment) == 0 {
		// Plain text only — no attachment
		msg.WriteString("Content-Type: text/plain; charset=utf-8\r\n\r\n")
		msg.WriteString(body + "\r\n")
	} else {
		boundary := "GiftHighwayAuditBoundary42"
		msg.WriteString(`Content-Type: multipart/mixed; boundary="` + boundary + `"` + "\r\n\r\n")

		msg.WriteString("--" + boundary + "\r\n")
		msg.WriteString("Content-Type: text/plain; charset=utf-8\r\n\r\n")
		msg.WriteString(body + "\r\n\r\n")

		encoded := base64.StdEncoding.EncodeToString(attachment)
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
	}

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

	nowIST := time.Now().In(ist)
	from := time.Date(nowIST.Year(), nowIST.Month(), nowIST.Day(), 0, 0, 0, 0, ist)
	to := from.Add(24 * time.Hour)

	all := s.downloadCSV(ctx, client)
	filtered := s.filterByDateRange(all, from, to)

	// Count data rows (subtract 1 for header)
	rowCount := bytes.Count(filtered, []byte("\n")) - 1
	if rowCount < 0 {
		rowCount = 0
	}

	dateStr := nowIST.Format("2006-01-02")
	subject := fmt.Sprintf("Gift Highway — Daily Orders Report %s", dateStr)
	body := fmt.Sprintf(
		"Daily orders report for %s\n\nTotal orders created today: %d\n\nSee attached CSV for full details.",
		nowIST.Format("January 2, 2006"), rowCount,
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

	nowIST := time.Now().In(ist)
	// Report covers the previous month
	firstOfThisMonth := time.Date(nowIST.Year(), nowIST.Month(), 1, 0, 0, 0, 0, ist)
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

// nextDailyAt returns the next wall-clock time when hour:minute occurs today or tomorrow in IST.
func nextDailyAt(hour, minute int) time.Time {
	now := time.Now().In(ist)
	candidate := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, ist)
	if candidate.After(now) {
		return candidate
	}
	return candidate.Add(24 * time.Hour)
}

// nextMonthlyAt returns the next 1st-of-month at midnight IST.
func nextMonthlyAt() time.Time {
	now := time.Now().In(ist)
	first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, ist)
	if first.After(now) {
		return first
	}
	return time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, ist)
}
