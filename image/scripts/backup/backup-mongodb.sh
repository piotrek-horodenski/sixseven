#!/bin/bash

# backup-mongodb.sh - Script to backup MongoDB database for Hydra Image app

# Source the configuration
source "$(dirname "$0")/config.sh"

# Set variables
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
MONGO_BACKUP_DIR="${BACKUP_DIR}/mongodb"
BACKUP_FILE="${DB_NAME}_${TIMESTAMP}.gz"

# Create backup directory if it doesn't exist
mkdir -p "$MONGO_BACKUP_DIR"

echo "Starting MongoDB backup at $(date)"

# Check if MongoDB container is running
if ! $CONTAINER_ENGINE ps | grep -q "$MONGO_CONTAINER_NAME"; then
    echo "Error: MongoDB container '$MONGO_CONTAINER_NAME' is not running."
    exit 1
fi

# Execute mongodump inside the container and compress the output
echo "Running mongodump for database '$DB_NAME'..."
$CONTAINER_ENGINE exec "$MONGO_CONTAINER_NAME" sh -c "mongodump --db=$DB_NAME --archive" | gzip > "$MONGO_BACKUP_DIR/$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ] && [ -f "$MONGO_BACKUP_DIR/$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$MONGO_BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo "MongoDB backup completed successfully at $(date)"
    echo "Backup saved to: $MONGO_BACKUP_DIR/$BACKUP_FILE (Size: $BACKUP_SIZE)"
else
    echo "Error: MongoDB backup failed."
    exit 1
fi

# List available backups
echo "Available MongoDB backups:"
ls -lh "$MONGO_BACKUP_DIR" | grep -v "total"

exit 0
