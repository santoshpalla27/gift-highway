#!/usr/bin/env bash
# One-time setup: installs the daily backup cron job and log file (Ubuntu).
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
chmod +x "$SCRIPT_DIR/setup-backup-cron.sh"

# Create log file
touch "$LOG"
chmod 644 "$LOG"
echo "Log file: $LOG"

# Create backup storage directory
mkdir -p /var/backups/app
echo "Backup dir: /var/backups/app"

# Install cron job — runs every 5 hours
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
