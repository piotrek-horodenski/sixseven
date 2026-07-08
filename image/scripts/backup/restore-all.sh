#!/bin/bash

# restore-all.sh - Script to restore both MongoDB and uploads for Hydra Image app

# Source the configuration
source "$(dirname "$0")/config.sh"

# Set variables
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="${BACKUP_DIR}/logs"
LOG_FILE="restore_${TIMESTAMP}.log"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

echo "Starting full restore at $(date)" | tee -a "$LOG_DIR/$LOG_FILE"
echo "----------------------------------------" | tee -a "$LOG_DIR/$LOG_FILE"

# Check if specific backup files are provided as arguments
MONGO_BACKUP=""
UPLOADS_BACKUP=""

if [ $# -eq 2 ]; then
    MONGO_BACKUP="$1"
    UPLOADS_BACKUP="$2"
    echo "Using specified backup files:" | tee -a "$LOG_DIR/$LOG_FILE"
    echo "MongoDB: $MONGO_BACKUP" | tee -a "$LOG_DIR/$LOG_FILE"
    echo "Uploads: $UPLOADS_BACKUP" | tee -a "$LOG_DIR/$LOG_FILE"
else
    echo "Using most recent backup files for both MongoDB and uploads" | tee -a "$LOG_DIR/$LOG_FILE"
fi

echo "----------------------------------------" | tee -a "$LOG_DIR/$LOG_FILE"

# Ask for confirmation before proceeding
read -p "This will overwrite the current database and uploads folder. Are you sure you want to proceed? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled." | tee -a "$LOG_DIR/$LOG_FILE"
    exit 0
fi

# Run MongoDB restore
echo "Running MongoDB restore..." | tee -a "$LOG_DIR/$LOG_FILE"
if [ -n "$MONGO_BACKUP" ]; then
    ./restore-mongodb.sh "$MONGO_BACKUP" | tee -a "$LOG_DIR/$LOG_FILE"
else
    ./restore-mongodb.sh | tee -a "$LOG_DIR/$LOG_FILE"
fi
MONGO_RESULT=$?

echo "----------------------------------------" | tee -a "$LOG_DIR/$LOG_FILE"

# Run uploads restore
echo "Running uploads restore..." | tee -a "$LOG_DIR/$LOG_FILE"
if [ -n "$UPLOADS_BACKUP" ]; then
    ./restore-uploads.sh "$UPLOADS_BACKUP" | tee -a "$LOG_DIR/$LOG_FILE"
else
    ./restore-uploads.sh | tee -a "$LOG_DIR/$LOG_FILE"
fi
UPLOADS_RESULT=$?

echo "----------------------------------------" | tee -a "$LOG_DIR/$LOG_FILE"

# Check if both restores were successful
if [ $MONGO_RESULT -eq 0 ] && [ $UPLOADS_RESULT -eq 0 ]; then
    echo "Full restore completed successfully at $(date)" | tee -a "$LOG_DIR/$LOG_FILE"
    echo "Restore log saved to: $LOG_DIR/$LOG_FILE" | tee -a "$LOG_DIR/$LOG_FILE"
    exit 0
else
    echo "Error: Full restore failed. Check the log for details." | tee -a "$LOG_DIR/$LOG_FILE"
    echo "Restore log saved to: $LOG_DIR/$LOG_FILE" | tee -a "$LOG_DIR/$LOG_FILE"
    exit 1
fi
