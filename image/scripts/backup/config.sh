#!/bin/bash

# config.sh - Configuration for backup/restore scripts

# Detect container engine (Docker or Podman) and check if daemon is running
DOCKER_RUNNING=false
PODMAN_RUNNING=false

# Check if Docker is available and running
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        DOCKER_RUNNING=true
    else
        echo "Docker is installed but the daemon is not running."
    fi
fi

# Check if Podman is available and running
if command -v podman &> /dev/null; then
    if podman info &> /dev/null; then
        PODMAN_RUNNING=true
    else
        echo "Podman is installed but the daemon is not running."
    fi
fi

# Use the container engine that is running
if [ "$DOCKER_RUNNING" = true ]; then
    CONTAINER_ENGINE="docker"
    # Docker environment uses these container names (from docker-compose.yml)
    MONGO_CONTAINER_NAME="himagemongo"
elif [ "$PODMAN_RUNNING" = true ]; then
    CONTAINER_ENGINE="podman"
    # Podman environment uses these container names (from hydra-image.yml)
    MONGO_CONTAINER_NAME="hydra-image-mongodb"
else
    echo "Error: Neither Docker nor Podman daemon is running on this system."
    echo "Please install and start either Docker or Podman to use these scripts."
    exit 1
fi

# Common settings
DB_NAME="hydra"
BACKUP_DIR="../../data/backups"
UPLOADS_DIR="../../data/uploads"

# Export variables
export CONTAINER_ENGINE
export MONGO_CONTAINER_NAME
export DB_NAME
export BACKUP_DIR
export UPLOADS_DIR

echo "Using container engine: $CONTAINER_ENGINE"
echo "MongoDB container name: $MONGO_CONTAINER_NAME"
