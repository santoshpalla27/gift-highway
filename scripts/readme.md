# Database Backup & Recovery — GiftHighway

## How it works

| Step | What happens | RAM cost |
| ---- | ------------ | -------- |
| `docker exec app-postgres pg_dump` | Runs inside the **existing** postgres container | 0 extra MB on host |
| `\| gzip -6` | Streams through host gzip | ~2 MB |
| Save to `/var/backups/app/` | Compressed SQL file | disk only |
| Upload to Cloudflare R2 | Off-site copy via `rclone` | ~20 MB while uploading |
| Rotate files > 7 days | `find -mtime +7 -delete` | 0 MB |

Total extra RAM during backup: **~22 MB** peak.

---

## One-time setup (Ubuntu server)

```bash
# 1. Copy scripts to the server
scp -r scripts/ user@your-server:~/gift-highway/scripts/

# 2. Run setup (auto-installs rclone, sets up cron + log rotation)
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
- Local retention: **7 days**
- R2 retention: unlimited (set an R2 lifecycle rule to auto-expire if desired)

---

## Which recovery script to use?

| Situation | Script |
| --------- | ------ |
| App is misbehaving, want to roll back to an earlier backup | `restore-db.sh` |
| Postgres container crashed, stopped, or volume corrupted | `disaster-recovery.sh` |
| Entire server is gone, starting fresh on a new machine | `disaster-recovery.sh` |

---

## restore-db.sh — normal rollback

Use when the postgres container is **running** and you want to roll back data.

```bash
# Latest backup (auto-selects local or downloads from R2)
sudo bash scripts/restore-db.sh

# Specific backup file
sudo bash scripts/restore-db.sh /var/backups/app/app_2025-01-15_02-00-01.sql.gz
```

What it does: stops backend + push-service → drops DB → restores → restarts services.

---

## disaster-recovery.sh — container down or full server loss

Use when the postgres container is **not running**, the volume is lost/corrupted,
or you are on a brand-new server.

```bash
sudo bash scripts/disaster-recovery.sh
```

It will:
1. Stop all app services
2. Start (or recreate) the postgres container and wait for it to be ready
3. Download the latest backup from R2 if no local backup exists
4. Drop + recreate the database
5. Restore and verify (fails loudly if no tables found after restore)
6. Start all services with `docker compose up -d`

### Full server loss — new machine from scratch

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin rclone

# 2. Get the app files
git clone <your-repo> ~/gift-highway
cd ~/gift-highway

# 3. Create .env.prod (DB creds, R2 creds, domain, etc.)
cp .env.prod.example .env.prod
nano .env.prod

# 4. Run disaster recovery — starts postgres, downloads backup from R2, restores
sudo bash scripts/disaster-recovery.sh

# That's it. All services come up at the end automatically.
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
