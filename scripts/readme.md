# Database Backup — 2 GB Server

## How it works

| Step                                  | What happens                                    | RAM cost                  |
| ------------------------------------- | ----------------------------------------------- | ------------------------- | ----- |
| `docker exec kanban-postgres pg_dump` | Runs inside the **existing** postgres container | 0 extra MB on host        |
| `                                     | gzip -6`                                        | Streams through host gzip | ~2 MB |
| Save to `/var/backups/kanban/`        | Compressed SQL file                             | disk only                 |
| Upload to Cloudflare R2               | Off-site copy via `aws` CLI                     | ~20 MB while uploading    |
| Rotate files > 7 days                 | `find -mtime +7 -delete`                        | 0 MB                      |

Total extra RAM during backup: **~22 MB** peak — well within the 640 MB buffer.

---

## One-time setup (Ubuntu server)

```bash
# 1. Copy scripts to the server
scp -r scripts/ user@your-server:~/kanban-app/scripts/

# 2. Run setup (auto-installs rclone via apt for R2 upload)
cd ~/kanban-app
sudo bash scripts/setup-backup-cron.sh

# 3. Test immediately
sudo bash scripts/backup-db.sh

# 4. Verify
ls -lh /var/backups/kanban/
tail /var/log/kanban-backup.log
```

---

## Schedule

- **Daily at 02:00 UTC** — low-traffic window
- Local retention: **7 days** (7 files on disk)
- R2 retention: unlimited (cheap cold storage; delete manually or set an R2 lifecycle rule)

---

## Estimated disk usage

A kanban app with 10–20 users typically produces a dump of **1–20 MB compressed**.
7 daily backups × 20 MB = **~140 MB** worst case on the server.

---

## Restore

```bash
# Find the backup you want
ls -lh /var/backups/kanban/

# Stop the app (optional but safe)
docker compose -f docker-compose.prod.yml stop backend push-service

# Restore
gunzip -c /var/backups/kanban/kanban_2025-01-15_02-00-01.sql.gz \
  | docker exec -i kanban-postgres psql -U kanban -d kanban

# Restart
docker compose -f docker-compose.prod.yml start backend push-service
```

Or restore from R2:

```bash
RCLONE_CONFIG_R2_TYPE=s3 \
RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
RCLONE_CONFIG_R2_ACCESS_KEY_ID=<R2_ACCESS_KEY> \
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=<R2_SECRET_KEY> \
RCLONE_CONFIG_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
rclone copy "r2:<bucket>/db-backups/kanban_2025-01-15_02-00-01.sql.gz" /tmp/

gunzip -c /tmp/kanban_2025-01-15_02-00-01.sql.gz \
  | docker exec -i kanban-postgres psql -U kanban -d kanban
```

---

## Verify backups are working

```bash
# Check last backup
tail /var/log/kanban-backup.log

# Should end with:
# [2025-01-15T02:00:05Z] Done.
```

sudo crontab -l. -- to check
