# Web Build & Deploy Guide

## Build and push images to Docker Hub

```bash
# Stop and remove current containers
docker compose -f docker-compose.staging.yml stop frontend backend monitor
docker compose -f docker-compose.staging.yml rm -f frontend backend monitor

# Build fresh from source using the staging compose
docker compose -f docker-compose.staging.yml build --no-cache frontend backend monitor

docker compose -f docker-compose.staging.yml up -d

# Tag for Docker Hub
docker tag hmmm-frontend santoshpalla27/company-app:frontend
docker tag hmmm-backend santoshpalla27/company-app:backend
docker tag hmmm-monitor santoshpalla27/company-app:monitor

# Push to Docker Hub
docker push santoshpalla27/company-app:frontend
docker push santoshpalla27/company-app:backend
docker push santoshpalla27/company-app:monitor
```

## Deploy on production server

```bash
# Pull latest images
docker compose -f docker-compose.prod.yml --env-file .env.prod pull

# Restart with new images
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```
