Comprehensive Report: Missing Orders in Audit Log (CSV)
Based on a thorough review of the backend/internal/services/audit_service.go and order_service.go, here is the analysis of why some orders created between the 6th and 15th are missing from the CSV, and why they stopped missing after the 15th.

🔴 Root Causes of Missing Orders
The audit feature writes to Cloudflare R2 on a per-action basis (when an order is created or updated). There are three major architectural vulnerabilities that lead to dropped orders:

1. In-Memory Goroutines vs. Deployments/Restarts
   When an order is created, the system triggers the CSV append in a background goroutine:

go

// In order_service.go -> CreateOrder()
if s.auditSvc != nil {
go s.auditSvc.AppendOrder(created)
}
The Issue: If you were actively building and deploying this feature between the 6th and 15th, you likely restarted the backend container many times. If an order was created, and the backend container was restarted immediately after (before the R2 download -> modify -> upload cycle finished), the goroutine was killed, and the order was permanently lost from the CSV.

2. Lack of "Upsert" / Backfill on Updates
   If an order fails to write to the CSV on creation (due to a restart, temporary network failure to R2, or missing environment variables), it will never be added later. When an existing order is updated, the code calls SyncOrder(o) which uses this logic:

go

// In audit_service.go -> syncRow()
for i := 1; i < len(records); i++ {
if len(records[i]) > 0 && records[i][0] == target {
records[i] = s.orderToRow(order)
break
}
}
The Issue: syncRow looks for the order in the CSV. If it doesn't find it, it does nothing. It does not fall back to appending the order. Therefore, any order that was missed during creation stays missing forever, even if the customer or admin updates it later.

3. Missing Retries on R2 Upload Failures
   In AppendOrder, if client.PutObject fails (e.g., due to a temporary 502/504 from Cloudflare R2), the system logs an error and sends an email alert, but it does not retry:

go

if err := s.uploadCSV(ctx, client, updated); err != nil {
log.Error().Err(err).Msg("audit: upload failed on append")
s.sendWriteFailureAlert(err, "append")
}
The Issue: A momentary blip in network connectivity to R2 drops the order completely.

🟢 Why did it stop missing after the 15th?
Since you mentioned that after the 15th there are no missing orders, this heavily correlates with the deployment lifecycle:

Stable Deployments: After the 15th, you likely stopped deploying/restarting the backend continuously. This means the goroutines handling the R2 uploads were able to finish successfully without being killed mid-flight.
Environment Variables Stabilized: If the R2 credentials (R2_ACCOUNT_ID, AUDIT_R2_BUCKET) were misconfigured on staging/prod earlier in the month, s.enabled() would have returned false, silently dropping the CSV writes. Once properly configured, the writes became stable.
⚠️ A Critical Hidden Bug Found in downloadCSV
During the review, I found a dangerous bug that could potentially wipe out the entire audit log if Cloudflare R2 experiences downtime:

go

func (s *AuditService) downloadCSV(ctx context.Context, client *s3.Client) []byte {
// ...
out, err := client.GetObject(...)
if err != nil {
return freshHeader() // <--- CRITICAL FLAW
}
The Vulnerability: If the backend tries to append a new order, but fails to download the existing CSV from R2 (e.g., due to a network timeout or temporary R2 outage), it assumes the CSV is empty and returns a fresh header! It will then append the one new order to the fresh header, and upload it back to R2. This will overwrite all existing orders in the CSV.

Note: Since you haven't lost all orders, this exact network failure hasn't happened yet, but it is a ticking time bomb.

💡 Recommendations for a Permanent Fix
If you want to ensure 100% accuracy in the audit CSV going forward, I recommend the following architectural changes:

Change Updates to "Upsert": Modify syncRow so that if it loops through all records and doesn't find the order, it appends the row to the bottom instead of doing nothing. This allows missing orders to self-heal the next time they are updated.
Fail the Request or Retry: If downloadCSV fails, the AppendOrder function MUST abort and retry later, rather than returning a blank header and overwriting the file.
Daily Full Sync (Best Practice): Relying on event-driven R2 writes is risky. Instead of modifying the CSV on every single order creation/update, the safest approach for audit logs is to run a daily cron job (e.g., at 11:59 PM) that pulls all orders from the PostgreSQL database directly and generates a fresh CSV. The database is always the source of truth.
