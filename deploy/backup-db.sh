#!/bin/bash
# CA Certificate System - Database Backup Script
# Save as: /var/www/ca-certificates/scripts/backup-db.sh

BACKUP_DIR="/var/backups/ca-certificates"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="ca_certificates_prod"
DB_USER="ca_app_user"
RETENTION_DAYS=30

mkdir -p $BACKUP_DIR

echo "Starting backup at $(date)"
# Assumes .pgpass is configured or DB_PASSWORD is in env
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

if [ $? -eq 0 ]; then
    echo "Backup completed: db_backup_$DATE.sql.gz"
    # Cleanup old backups
    find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    echo "Removed backups older than $RETENTION_DAYS days"
else
    echo "Backup failed!"
    exit 1
fi
