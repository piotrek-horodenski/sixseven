# Backup and Restore Scripts for Hydra Image App

This directory contains scripts for backing up and restoring the Hydra Image application data, which consists of:
1. MongoDB database
2. Uploads data stored in container volumes

## Prerequisites

- Docker or Podman must be installed and running
- The Hydra Image application must be deployed using either:
  - Docker Compose with the provided `config/docker-compose.yml` file (development)
  - Podman with the provided `config/hydra-image.yaml` file (production)
- Bash shell environment
- Windows Subsystem for Linux (WSL) must be installed and configured if running on Windows

## Container Engine Detection

The scripts automatically detect whether Docker or Podman is being used and adjust their behavior accordingly:

- For both Docker and Podman: The scripts use container commands (`docker cp`/`podman cp` and `docker exec`/`podman exec`) to access the uploads data directly from the container volumes
- The scripts determine the appropriate container name based on the detected container engine

## Backup Scripts

### backup-mongodb.sh

Backs up the MongoDB database (`himagemongo`) to a compressed archive.

**Usage:**
```bash
# Windows (using WSL)
wsl ./backup-mongodb.sh

# Linux/macOS
./backup-mongodb.sh
```

**Output:**
- Creates a backup file in `../../data/backups/mongodb/` with the format `himagemongo_YYYYMMDD_HHMMSS.gz`
- Displays information about the backup process and the resulting backup file

### backup-uploads.sh

Backs up the uploads folder to a compressed tar archive. The script automatically detects whether Docker or Podman is being used and accesses the data directly from the container volume:
- For Docker: Uses the `himageweb` container
- For Podman: Uses the `himage` container

**Usage:**
```bash
# Windows (using WSL)
wsl ./backup-uploads.sh

# Linux/macOS
./backup-uploads.sh
```

**Output:**
- Creates a backup file in `../../data/backups/uploads/` with the format `uploads_YYYYMMDD_HHMMSS.tar.gz`
- Displays information about the backup process and the resulting backup file

### backup-all.sh

Runs both backup scripts (`backup-mongodb.sh` and `backup-uploads.sh`) and logs the output.

**Usage:**
```bash
# Windows (using WSL)
wsl ./backup-all.sh

# Linux/macOS
./backup-all.sh
```

**Output:**
- Runs both backup scripts
- Creates a log file in `../../data/backups/logs/` with the format `backup_YYYYMMDD_HHMMSS.log`
- Displays information about the backup process and the resulting backup files

## Restore Scripts

### restore-mongodb.sh

Restores the MongoDB database (`himagemongo`) from a backup file.

**Usage:**
```bash
# Windows (using WSL)
wsl ./restore-mongodb.sh [backup_file]

# Linux/macOS
./restore-mongodb.sh [backup_file]
```

**Parameters:**
- `backup_file` (optional): The name of the backup file to restore. If not provided, the most recent backup will be used.

**Output:**
- Lists available backups
- Prompts for confirmation before proceeding
- Restores the database from the specified backup file
- Displays information about the restore process

### restore-uploads.sh

Restores the uploads data from a backup file. The script automatically detects whether Docker or Podman is being used and restores the data directly to the container volume:
- For Docker: Uses the `himageweb` container
- For Podman: Uses the `himage` container

**Usage:**
```bash
# Windows (using WSL)
wsl ./restore-uploads.sh [backup_file]

# Linux/macOS
./restore-uploads.sh [backup_file]
```

**Parameters:**
- `backup_file` (optional): The name of the backup file to restore. If not provided, the most recent backup will be used.

**Output:**
- Lists available backups
- Prompts for confirmation before proceeding
- Temporarily backs up existing volume data before restoring
- Restores the uploads data from the specified backup file to the container volume
- Displays information about the restore process

### restore-all.sh

Runs both restore scripts (`restore-mongodb.sh` and `restore-uploads.sh`) and logs the output.

**Usage:**
```bash
# Windows (using WSL)
wsl ./restore-all.sh [mongo_backup_file] [uploads_backup_file]

# Linux/macOS
./restore-all.sh [mongo_backup_file] [uploads_backup_file]
```

**Parameters:**
- `mongo_backup_file` (optional): The name of the MongoDB backup file to restore.
- `uploads_backup_file` (optional): The name of the uploads backup file to restore.

If both parameters are provided, the specified backup files will be used. If no parameters are provided, the most recent backups will be used.

**Output:**
- Prompts for confirmation before proceeding
- Runs both restore scripts
- Creates a log file in `../../data/backups/logs/` with the format `restore_YYYYMMDD_HHMMSS.log`
- Displays information about the restore process

## Backup Directory Structure

```
data/backups/
  ├── mongodb/           # MongoDB database backups
  ├── uploads/           # Uploads folder backups
  └── logs/              # Backup and restore logs
```

## Scheduling Backups

### Linux/macOS

You can schedule regular backups using cron. For example, to run a full backup every day at 2:00 AM:

```bash
0 2 * * * cd /path/to/hydra-image/scripts/backup && ./backup-all.sh
```

Add this line to your crontab by running `crontab -e` and pasting the line above.

### Windows

On Windows, you can use Task Scheduler to run the backup scripts:

1. Open Task Scheduler
2. Create a new Basic Task
3. Set the trigger to run daily at 2:00 AM
4. Set the action to "Start a program"
5. Program/script: `wsl`
6. Add arguments: `-e /path/to/hydra-image/scripts/backup/backup-all.sh`
7. Complete the wizard

Alternatively, you can use WSL's built-in cron service if you have it installed and configured.

## Notes

- All scripts create the necessary directories if they don't exist
- Backup files are named with timestamps to avoid overwriting previous backups
- Restore operations require confirmation before proceeding
- Logs are created for all backup and restore operations
