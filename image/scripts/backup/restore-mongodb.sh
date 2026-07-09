#!/bin/bash

# restore-mongodb.sh - Script to restore MongoDB database for Hydra Image app

# Source the configuration
source "$(dirname "$0")/config.sh"

# Set variables
MONGO_BACKUP_DIR="${BACKUP_DIR}/mongodb"

# Check if backup directory exists
if [ ! -d "$MONGO_BACKUP_DIR" ]; then
    echo "Error: Backup directory '$MONGO_BACKUP_DIR' does not exist."
    exit 1
fi

# List available backups
echo "Available MongoDB backups:"
ls -lh "$MONGO_BACKUP_DIR" | grep -v "total"

# If a specific backup file is provided as an argument, use it
if [ $# -eq 1 ]; then
    BACKUP_FILE="$1"
    
    # Check if the provided file exists
    if [ ! -f "$MONGO_BACKUP_DIR/$BACKUP_FILE" ]; then
        echo "Error: Backup file '$MONGO_BACKUP_DIR/$BACKUP_FILE' does not exist."
        exit 1
    fi
else
    # Otherwise, use the most recent backup
    BACKUP_FILE=$(ls -t "$MONGO_BACKUP_DIR" | head -n 1)
    
    if [ -z "$BACKUP_FILE" ]; then
        echo "Error: No backup files found in '$MONGO_BACKUP_DIR'."
        exit 1
    fi
fi

echo "Starting MongoDB restore at $(date)"
echo "Using backup file: $MONGO_BACKUP_DIR/$BACKUP_FILE"

# Check if MongoDB container is running
if ! $CONTAINER_ENGINE ps | grep -q "$MONGO_CONTAINER_NAME"; then
    echo "Error: MongoDB container '$MONGO_CONTAINER_NAME' is not running."
    exit 1
fi

# Ask for confirmation before proceeding
read -p "This will overwrite the current database. Are you sure you want to proceed? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 0
fi

# Execute mongorestore inside the container
echo "Running mongorestore for database '$DB_NAME'..."
gunzip -c "$MONGO_BACKUP_DIR/$BACKUP_FILE" | $CONTAINER_ENGINE exec -i "$MONGO_CONTAINER_NAME" mongorestore --drop --archive

# Check if restore was successful
if [ $? -eq 0 ]; then
    echo "MongoDB restore completed successfully at $(date)"
else
    echo "Error: MongoDB restore failed."
    exit 1
fi

exit 0
