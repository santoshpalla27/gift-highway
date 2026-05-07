we have two backup scripts

1. backup-db.sh - this script will backup the database to R2
2. backup-to-s3.sh - this script will backup the database to S3

we have two restore scripts

1. restore-db.sh - this script will restore the database from R2
2. restore-from-s3.sh - this script will restore the database from S3

====

commands

# Backup (R2)

sudo ./backup-db.sh

# Backup (S3)

sudo ./backup-to-s3.sh

for testing use compose_file if using in prod use default

# Restore from R2

sudo ./restore-db.sh

# Restore from S3

sudo ./restore-from-s3.sh

# Restore from R2 (for testing)

sudo COMPOSE_FILE=../docker-compose.staging.yml ./restore-db.sh

# Restore from S3

sudo COMPOSE_FILE=../docker-compose.staging.yml ./restore-from-s3.sh

=====

restore a spefific file first download and then use this command

# Restore a specific file (R2 script)

sudo ./restore-db.sh /var/backups/app/app_2026-05-07_10-00-00.sql.gz

# Restore a specific file (S3 script)

sudo ./restore-from-s3.sh /var/backups/app/app_s3_2026-05-07_10-05-00.sql.gz

# Specific file + staging compose

sudo COMPOSE_FILE=../docker-compose.staging.yml ./restore-db.sh /var/backups/app/app_2026-05-07_10-00-00.sql.gz
sudo COMPOSE_FILE=../docker-compose.staging.yml ./restore-from-s3.sh /var/backups/app/app_s3_2026-05-07_10-05-00.sql.gz

# List available backups to find the filename

ls -lht /var/backups/app/\*.sql.gz | head -20

If you want to restore a specific file from S3 or R2 that isn't downloaded yet, you'd download it first then pass it:

# Download a specific file from S3

rclone copy s3:your-bucket/db-backups/app_s3_2026-05-07_10-05-00.sql.gz /var/backups/app/

# Then restore it

sudo ./restore-from-s3.sh /var/backups/app/app_s3_2026-05-07_10-05-00.sql.gz

# Same for R2

rclone copy r2:your-bucket/db-backups/app_2026-05-07_10-00-00.sql.gz /var/backups/app/

# Then restore it

sudo ./restore-db.sh /var/backups/app/app_2026-05-07_10-00-00.sql.gz

==================================

cronjobs check in root user for cronjobs

# View current cron jobs first

crontab -l

# Remove all cron jobs

crontab -r

sudo ./setup-backup-cron.sh

ubuntu@ip-172-26-9-55:~/gift-highway/scripts$ sudo ./setup-backup-cron.sh
Log file: /var/log/app-backup.log
Log file: /var/log/app-backup-s3.log
Backup dir: /var/backups/app
Log rotation: /etc/logrotate.d/app-backup (weekly, 4 weeks)
R2 cron job installed: every hour
S3 cron job installed: every 5 minutes (primary backup)

Done. Useful commands:
Test R2 backup: sudo /home/ubuntu/gift-highway/scripts/backup-db.sh
Test S3 backup: sudo /home/ubuntu/gift-highway/scripts/backup-to-s3.sh
Watch R2 log: tail -f /var/log/app-backup.log
Watch S3 log: tail -f /var/log/app-backup-s3.log
List backups: ls -lh /var/backups/app/
View cron: crontab -l
ubuntu@ip-172-26-9-55:~/gift-highway/scripts$
