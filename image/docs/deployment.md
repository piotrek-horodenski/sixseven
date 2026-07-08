# Deployment Guide

This document provides instructions for deploying the Hydra Image application in various environments.

> **Note**: For Podman deployment instructions, see [Podman Deployment Guide](podman-deployment.md).

## Prerequisites

- Node.js (v21.2.0 or later)
- Docker and Docker Compose
- MongoDB (if not using the Docker setup)

## Local Development Deployment

### 1. Install Dependencies

```bash
npm install -g yarn
yarn install
```

### 2. Configure the Application

Create a `settings.json` file based on the template in `config/settings-sample.json`:

```json
{
  "adress": "localhost",
  "port": "5179",
  "webProtocol": "http",
  "db": "himagemongo",
  "dbPort": "27017",
  "dbName": "hydra",
  "dbParams": "?directConnection=true",
  "dbPrefix": "PG",
  "uploads": "/uploads",
  "thumbExtension": "jpg",
  "thumbWidth": 200,
  "thumbHeight": 200,
  "defaultPageSize": 100
}
```

Set the environment variable:

```bash
# Windows
set H3PHOTO_SETTINGS=path\to\settings.json

# Linux/macOS
export H3PHOTO_SETTINGS=path/to/settings.json
```

### 3. Run the Application

For development:

```bash
yarn dev
```

For production:

```bash
yarn build
yarn start
```

## Docker Deployment

### 1. Build the Docker Image

```bash
# Windows (using WSL)
wsl ./scripts/docker/build.sh

# Linux/macOS
./scripts/docker/build.sh
```

> **Important Note for Windows Users**: Shell scripts (.sh) must be executed using Windows Subsystem for Linux (WSL). Make sure WSL is installed and properly configured on your system.

### 2. Deploy with Docker Compose

#### Preparing for Deployment

1. Make sure you have the latest Docker image built or loaded:
   ```bash
   # Windows (using WSL)
   wsl ./scripts/docker/build.sh
   # Or load an existing image
   wsl ./scripts/docker/load.sh
   
   # Linux/macOS
   ./scripts/docker/build.sh
   # Or load an existing image
   ./scripts/docker/load.sh
   ```

2. Ensure the data directories exist:
   ```
   mkdir data
   mkdir data/db 
   mkdir data/uploads 
   mkdir data/backups
   ```

3. Update the `config/docker-compose.yml` file if needed to match your environment.

#### Starting the Application

Run the application in detached mode:

```bash
# Windows
docker compose -f config\docker-compose.yml up -d

# Linux/macOS
docker compose -f config/docker-compose.yml up -d
```

This command:
- Creates and starts containers for all services defined in the docker-compose.yml
- Creates networks and volumes as defined in the configuration
- Mounts the data directories as volumes
- Sets up the environment variables

#### Viewing Logs

To view the logs of the running containers:

```bash
# View logs for all services
docker compose -f config\docker-compose.yml logs

# View logs for a specific service
docker compose -f config\docker-compose.yml logs himage

# Follow the logs (continuous output)
docker compose -f config\docker-compose.yml logs -f
```

#### Stopping the Application

To stop the application:

```bash
# Windows
docker compose -f config\docker-compose.yml down

# Linux/macOS
docker compose -f config/docker-compose.yml down
```

This command:
- Stops and removes containers
- Removes networks created by `up`
- Preserves volumes and data

To completely remove everything including volumes (WARNING: this will delete all data):

```bash
# Windows
docker compose -f config\docker-compose.yml down -v

# Linux/macOS
docker compose -f config/docker-compose.yml down -v
```

#### Restarting the Application

To restart the application:

```bash
# Windows
docker compose -f config\docker-compose.yml restart

# Linux/macOS
docker compose -f config/docker-compose.yml restart
```

#### Updating the Application

To update the application with a new Docker image:

1. Build or load the new image
2. Restart the services:
   ```bash
   # Windows
   docker compose -f config\docker-compose.yml up -d --force-recreate

   # Linux/macOS
   docker compose -f config/docker-compose.yml up -d --force-recreate
   ```

## Data Management

### Backup and Restore

The application includes scripts for backing up and restoring data:

```bash
# Windows (using WSL)
wsl ./scripts/backup/backup-all.sh
wsl ./scripts/backup/restore-all.sh

# Linux/macOS
./scripts/backup/backup-all.sh
./scripts/backup/restore-all.sh
```

See `scripts/backup/README.md` for detailed information on backup and restore procedures.

## Monitoring and Maintenance

### Logs

Docker logs can be viewed with:

```bash
docker logs himage
docker logs himagemongo
```

### Database Management

To connect to the MongoDB instance:

```bash
docker exec -it himagemongo mongo
```

## Troubleshooting

### Common Issues

1. **Connection refused to MongoDB**
   - Check if the MongoDB container is running
   - Verify the MongoDB port mapping in docker-compose.yml

2. **Missing uploads directory**
   - Ensure the uploads directory exists and has proper permissions
   - Check the volume mapping in docker-compose.yml

3. **Image processing errors**
   - Verify that the sharp library is properly installed
   - Check for unsupported image formats
