# Database Backup — GiftHighway

## How it works

| Step | What happens | RAM cost |
| ---- | ------------ | -------- |
| `docker exec app-postgres pg_dump` | Runs inside the **existing** postgres container | 0 extra MB on host |
| `\| gzip -6` | Streams through host gzip | ~2 MB |
| Save to `/var/backups/app/` | Compressed SQL file | disk only |
| Upload to Cloudflare R2 | Off-site copy via `rclone` | ~20 MB while uploading |
| Rotate files > 7 days | `find -mtime +7 -delete` | 0 MB |

Total extra RAM during backup: **~22 MB** peak — well within the 640 MB buffer.

---

## One-time setup (Ubuntu server)

```bash
# 1. Copy scripts to the server
scp -r scripts/ user@your-server:~/gift-highway/scripts/

# 2. Run setup (auto-installs rclone via apt, sets up cron + log rotation)
cd ~/gift-highway
sudo bash scripts/setup-backup-cron.sh

# 3. Test immediately
sudo bash scripts/backup-db.sh

# 4. Verify
ls -lh /var/backups/app/
tail /var/log/app-backup.log
```

---

## Schedule

- **Every 5 hours** — cron: `0 */5 * * *`
- Local retention: **7 days** (files on disk)
- R2 retention: unlimited (cheap cold storage; delete manually or set an R2 lifecycle rule)

---

## Estimated disk usage

A typical dump produces **1–20 MB compressed**.
7 days × 5 backups/day × 20 MB = **~700 MB** worst case on the server.

---

## Restore

The restore script handles everything automatically — just run it:

```bash
sudo bash scripts/restore-db.sh
```

It will:
1. Find the latest local backup (or download from R2 if none exist locally)
2. Show current tables and ask for confirmation
3. Stop `backend` and `push-service`
4. Drop and recreate the database
5. Restore and verify
6. Restart both services

To restore a specific file:

```bash
sudo bash scripts/restore-db.sh /var/backups/app/app_2025-01-15_02-00-01.sql.gz
```

Or restore from R2 manually:

```bash
RCLONE_CONFIG_R2_TYPE=s3 \
RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
RCLONE_CONFIG_R2_ACCESS_KEY_ID=<R2_ACCESS_KEY> \
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=<R2_SECRET_KEY> \
RCLONE_CONFIG_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
rclone copy "r2:<bucket>/db-backups/app_2025-01-15_02-00-01.sql.gz" /tmp/

gunzip -c /tmp/app_2025-01-15_02-00-01.sql.gz \
  | docker exec -i app-postgres psql -U app -d appdb
```

---

## Verify backups are working

```bash
# Check last backup ran successfully
tail /var/log/app-backup.log
# Should end with: [2025-01-15T02:00:05Z] Done.

# List local backups
ls -lh /var/backups/app/

# Check cron is installed
crontab -l
```
