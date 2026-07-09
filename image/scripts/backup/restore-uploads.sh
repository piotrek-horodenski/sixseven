#!/bin/bash

# restore-uploads.sh - Script to restore uploads folder for Hydra Image app

# Source the configuration
source "$(dirname "$0")/config.sh"

# Set variables
UPLOADS_BACKUP_DIR="${BACKUP_DIR}/uploads"
TEMP_DIR="../../data/temp_restore"

# Check if backup directory exists
if [ ! -d "$UPLOADS_BACKUP_DIR" ]; then
    echo "Error: Backup directory '$UPLOADS_BACKUP_DIR' does not exist."
    exit 1
fi

# List available backups
echo "Available uploads backups:"
ls -lh "$UPLOADS_BACKUP_DIR" | grep -v "total"

# If a specific backup file is provided as an argument, use it
if [ $# -eq 1 ]; then
    BACKUP_FILE="$1"
    
    # Check if the provided file exists
    if [ ! -f "$UPLOADS_BACKUP_DIR/$BACKUP_FILE" ]; then
        echo "Error: Backup file '$UPLOADS_BACKUP_DIR/$BACKUP_FILE' does not exist."
        exit 1
    fi
else
    # Otherwise, use the most recent backup
    BACKUP_FILE=$(ls -t "$UPLOADS_BACKUP_DIR" | head -n 1)
    
    if [ -z "$BACKUP_FILE" ]; then
        echo "Error: No backup files found in '$UPLOADS_BACKUP_DIR'."
        exit 1
    fi
fi

echo "Starting uploads restore at $(date)"
echo "Using backup file: $UPLOADS_BACKUP_DIR/$BACKUP_FILE"

# Ask for confirmation before proceeding
read -p "This will overwrite the current uploads folder. Are you sure you want to proceed? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 0
fi

# Create temporary directory for extraction
mkdir -p "$TEMP_DIR"

# Extract the backup to the temporary directory
echo "Extracting backup..."
tar -xzf "$UPLOADS_BACKUP_DIR/$BACKUP_FILE" -C "$TEMP_DIR"

# Check if extraction was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to extract backup."
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Determine container name based on container engine
if [ "$CONTAINER_ENGINE" = "podman" ]; then
    CONTAINER_NAME="hydra-image-himage"
else
    CONTAINER_NAME="himage"  # Docker container name from docker-compose.yml
fi

# Check if the container is running
if ! $CONTAINER_ENGINE ps | grep -q "$CONTAINER_NAME"; then
    echo "Error: $CONTAINER_NAME container is not running."
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Backup existing data in the volume (if any)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEMP_BACKUP_DIR="$TEMP_DIR/old_data_$TIMESTAMP"
mkdir -p "$TEMP_BACKUP_DIR"

echo "Backing up existing data in $CONTAINER_ENGINE volume..."
$CONTAINER_ENGINE cp $CONTAINER_NAME:/app/uploads/. "$TEMP_BACKUP_DIR" 2>/dev/null || true

# Copy the extracted data to the container volume
echo "Restoring data to $CONTAINER_ENGINE volume..."

# First, clear the existing content in the volume
$CONTAINER_ENGINE exec $CONTAINER_NAME rm -rf /app/uploads/* /app/uploads/.[!.]* 2>/dev/null || true

# Then copy the new data
if [ -d "$TEMP_DIR/uploads" ]; then
    # If the backup contains an 'uploads' directory, copy its contents
    $CONTAINER_ENGINE cp "$TEMP_DIR/uploads/." $CONTAINER_NAME:/app/uploads/
else
    # Otherwise, assume the backup contains the contents directly
    $CONTAINER_ENGINE cp "$TEMP_DIR/." $CONTAINER_NAME:/app/uploads/
fi

if [ $? -ne 0 ]; then
    echo "Error: Failed to restore data to $CONTAINER_ENGINE volume."
    echo "Attempting to restore previous data..."
    $CONTAINER_ENGINE cp "$TEMP_BACKUP_DIR/." $CONTAINER_NAME:/app/uploads/ 2>/dev/null || true
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Data successfully restored to $CONTAINER_ENGINE volume."

# Clean up temporary directory
rm -rf "$TEMP_DIR"

# Verify the restore
if $CONTAINER_ENGINE exec $CONTAINER_NAME ls -la /app/uploads/ | grep -q "total"; then
    echo "Uploads restore completed successfully at $(date)"
else
    echo "Error: Uploads restore verification failed."
    exit 1
fi

exit 0
