#!/usr/bin/env bash
# One-time setup: installs the backup cron job, log file, and log rotation (Ubuntu).
# Run as root (or with sudo) on the production server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-db.sh"
S3_BACKUP_SCRIPT="$SCRIPT_DIR/backup-to-s3.sh"
LOG=/var/log/app-backup.log
S3_LOG=/var/log/app-backup-s3.log

# Install rclone if not present (used for R2 and S3 uploads)
if ! command -v rclone &>/dev/null; then
  echo "Installing rclone..."
  if command -v apt-get &>/dev/null; then
    apt-get install -y rclone
  else
    curl https://rclone.org/install.sh | bash
  fi
fi

# Verify backup scripts exist
if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "ERROR: $BACKUP_SCRIPT not found." >&2
  exit 1
fi
if [ ! -f "$S3_BACKUP_SCRIPT" ]; then
  echo "ERROR: $S3_BACKUP_SCRIPT not found." >&2
  exit 1
fi
chmod +x "$BACKUP_SCRIPT"
chmod +x "$S3_BACKUP_SCRIPT"
chmod +x "$SCRIPT_DIR/restore-db.sh"
chmod +x "$SCRIPT_DIR/disaster-recovery.sh"
chmod +x "$SCRIPT_DIR/setup-backup-cron.sh"

# Create log files
touch "$LOG"
chmod 644 "$LOG"
echo "Log file: $LOG"

touch "$S3_LOG"
chmod 644 "$S3_LOG"
echo "Log file: $S3_LOG"

# Create backup storage directory
mkdir -p /var/backups/app
echo "Backup dir: /var/backups/app"

# ── Log rotation (weekly, keep 4 weeks) ──────────────────────────────────────
cat > /etc/logrotate.d/app-backup << 'EOF'
/var/log/app-backup.log
/var/log/app-backup-s3.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
EOF
echo "Log rotation: /etc/logrotate.d/app-backup (weekly, 4 weeks)"

# ── Cron jobs ─────────────────────────────────────────────────────────────────
# R2 backup: every 5 hours
CRON_R2="0 */5 * * * $BACKUP_SCRIPT"
# S3 backup: every hour
CRON_S3="0 * * * * $S3_BACKUP_SCRIPT"

CURRENT_CRON=$(crontab -l 2>/dev/null || true)

if echo "$CURRENT_CRON" | grep -qF "$BACKUP_SCRIPT"; then
  echo "R2 cron job already installed — no changes made."
else
  (echo "$CURRENT_CRON"; echo "$CRON_R2") | crontab -
  echo "R2 cron job installed: every 5 hours"
fi

if echo "$CURRENT_CRON" | grep -qF "$S3_BACKUP_SCRIPT"; then
  echo "S3 cron job already installed — no changes made."
else
  (crontab -l 2>/dev/null; echo "$CRON_S3") | crontab -
  echo "S3 cron job installed: every hour"
fi

echo ""
echo "Done. Useful commands:"
echo "  Test R2 backup:    sudo $BACKUP_SCRIPT"
echo "  Test S3 backup:    sudo $S3_BACKUP_SCRIPT"
echo "  Watch R2 log:      tail -f $LOG"
echo "  Watch S3 log:      tail -f $S3_LOG"
echo "  List backups:      ls -lh /var/backups/app/"
echo "  View cron:         crontab -l"
