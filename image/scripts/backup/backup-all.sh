#!/bin/bash

# backup-all.sh - Script to backup both MongoDB and uploads for Hydra Image app

# Source the configuration
source "$(dirname "$0")/config.sh"

# Set variables
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="${BACKUP_DIR}/logs"
LOG_FILE="backup_${TIMESTAMP}.log"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

echo "Starting full backup at $(date)" | tee -a "$LOG_DIR/$LOG_FILE"
echo "----------------------------------------" | tee -a "$LOG_DIR/$LOG_FILE"

# Run MongoDB backup
echo "Running MongoDB backup..." | tee -a "$LOG_DIR/$LOG_FILE"
./backup-mongodb.sh | tee -a "$LOG_DIR/$LOG_FILE"
MONGO_RESULT=$?

echo "----------------------------------------" | tee -a "$LOG_DIR/$LOG_FILE"

# Run uploads backup
echo "Running uploads backup..." | tee -a "$LOG_DIR/$LOG_FILE"
./backup-uploads.sh | tee -a "$LOG_DIR/$LOG_FILE"
UPLOADS_RESULT=$?

echo "----------------------------------------" | tee -a "$LOG_DIR/$LOG_FILE"

# Check if both backups were successful
if [ $MONGO_RESULT -eq 0 ] && [ $UPLOADS_RESULT -eq 0 ]; then
    echo "Full backup completed successfully at $(date)" | tee -a "$LOG_DIR/$LOG_FILE"
    echo "Backup log saved to: $LOG_DIR/$LOG_FILE" | tee -a "$LOG_DIR/$LOG_FILE"
    exit 0
else
    echo "Error: Full backup failed. Check the log for details." | tee -a "$LOG_DIR/$LOG_FILE"
    echo "Backup log saved to: $LOG_DIR/$LOG_FILE" | tee -a "$LOG_DIR/$LOG_FILE"
    exit 1
fi
