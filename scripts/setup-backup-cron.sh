#!/usr/bin/env bash
# One-time setup: installs the backup cron job, log file, and log rotation (Ubuntu).
# Run as root (or with sudo) on the production server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-db.sh"
LOG=/var/log/app-backup.log

# Install rclone if not present (used for R2 upload)
if ! command -v rclone &>/dev/null; then
  echo "Installing rclone..."
  apt-get install -y rclone
fi

# Verify backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "ERROR: $BACKUP_SCRIPT not found." >&2
  exit 1
fi
chmod +x "$BACKUP_SCRIPT"
chmod +x "$SCRIPT_DIR/restore-db.sh"
chmod +x "$SCRIPT_DIR/disaster-recovery.sh"
chmod +x "$SCRIPT_DIR/setup-backup-cron.sh"

# Create log file
touch "$LOG"
chmod 644 "$LOG"
echo "Log file: $LOG"

# Create backup storage directory
mkdir -p /var/backups/app
echo "Backup dir: /var/backups/app"

# ── Log rotation (weekly, keep 4 weeks) ──────────────────────────────────────
cat > /etc/logrotate.d/app-backup << 'EOF'
/var/log/app-backup.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
EOF
echo "Log rotation: /etc/logrotate.d/app-backup (weekly, 4 weeks)"

# ── Cron job — runs every 5 hours ────────────────────────────────────────────
CRON_JOB="0 */5 * * * $BACKUP_SCRIPT"

if crontab -l 2>/dev/null | grep -qF "$BACKUP_SCRIPT"; then
  echo "Cron job already installed — no changes made."
else
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  echo "Cron job installed: every 5 hours"
fi

echo ""
echo "Done. Useful commands:"
echo "  Test immediately:  sudo $BACKUP_SCRIPT"
echo "  Watch log:         tail -f $LOG"
echo "  List backups:      ls -lh /var/backups/app/"
echo "  View cron:         crontab -l"
