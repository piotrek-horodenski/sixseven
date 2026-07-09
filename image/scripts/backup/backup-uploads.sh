#!/bin/bash

# backup-uploads.sh - Script to backup uploads folder for Hydra Image app

# Source the configuration
source "$(dirname "$0")/config.sh"

# Set variables
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
UPLOADS_BACKUP_DIR="${BACKUP_DIR}/uploads"
BACKUP_FILE="uploads_${TIMESTAMP}.tar.gz"
TEMP_DIR="../../data/temp_backup"

# Create backup directory if it doesn't exist
mkdir -p "$UPLOADS_BACKUP_DIR"

echo "Starting uploads backup at $(date)"

# Determine container name based on container engine
if [ "$CONTAINER_ENGINE" = "podman" ]; then
    CONTAINER_NAME="hydra-image-himage"
else
    CONTAINER_NAME="himageweb"  # Docker container name from docker-compose.yml
fi

# Check if the container is running
if ! $CONTAINER_ENGINE ps | grep -q "$CONTAINER_NAME"; then
    echo "Error: $CONTAINER_NAME container is not running."
    exit 1
fi

# Create temporary directory for volume data
mkdir -p "$TEMP_DIR"

# Copy data from the container volume to the temporary directory
echo "Copying data from $CONTAINER_ENGINE container volume..."
$CONTAINER_ENGINE cp $CONTAINER_NAME:/app/uploads/. "$TEMP_DIR"

if [ $? -ne 0 ]; then
    echo "Error: Failed to copy data from $CONTAINER_ENGINE container volume."
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Create tar archive of the temporary directory
echo "Creating backup of uploads directory..."
tar -czf "$UPLOADS_BACKUP_DIR/$BACKUP_FILE" -C "$TEMP_DIR" .

# Clean up temporary directory
rm -rf "$TEMP_DIR"

# Check if backup was successful
if [ $? -eq 0 ] && [ -f "$UPLOADS_BACKUP_DIR/$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$UPLOADS_BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo "Uploads backup completed successfully at $(date)"
    echo "Backup saved to: $UPLOADS_BACKUP_DIR/$BACKUP_FILE (Size: $BACKUP_SIZE)"
else
    echo "Error: Uploads backup failed."
    exit 1
fi

# List available backups
echo "Available uploads backups:"
ls -lh "$UPLOADS_BACKUP_DIR" | grep -v "total"

exit 0
