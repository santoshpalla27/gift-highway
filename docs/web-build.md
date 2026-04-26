# Web Build & Deploy Guide

## Build all services and push to Docker Hub (local Mac)

```bash
# Stop and remove current containers
docker compose -f docker-compose.staging.yml stop frontend backend monitor push-service
docker compose -f docker-compose.staging.yml rm -f frontend backend monitor push-service

# Build fresh from source using the staging compose
docker compose -f docker-compose.staging.yml build --no-cache frontend backend monitor push-service
docker compose -f docker-compose.staging.yml up -d

# Tag for Docker Hub
docker tag gift-highway-frontend santoshpalla27/company-app:frontend
docker tag gift-highway-backend santoshpalla27/company-app:backend
docker tag gift-highway-monitor santoshpalla27/company-app:monitor
docker tag gift-highway-push-service santoshpalla27/company-app:push-service

# Push to Docker Hub
docker push santoshpalla27/company-app:frontend
docker push santoshpalla27/company-app:backend
docker push santoshpalla27/company-app:monitor
docker push santoshpalla27/company-app:push-service
```

## Deploy all services on server

```bash
docker compose pull && docker compose up -d --force-recreate
```

---

## Build and deploy a single service

### frontend
```bash
# Local Mac
docker build -t santoshpalla27/company-app:frontend ./frontend-web
docker push santoshpalla27/company-app:frontend

# Server
docker compose pull frontend && docker compose up -d --force-recreate frontend
```

### backend
```bash
# Local Mac
docker build -t santoshpalla27/company-app:backend ./backend
docker push santoshpalla27/company-app:backend

# Server
docker compose pull backend && docker compose up -d --force-recreate backend
```

### push-service
```bash
# Local Mac
docker build -t santoshpalla27/company-app:push-service ./push-service
docker push santoshpalla27/company-app:push-service

# Server
docker compose pull push-service && docker compose up -d --force-recreate push-service
```

### monitor
```bash
# Local Mac
docker build -t santoshpalla27/company-app:monitor ./monitor
docker push santoshpalla27/company-app:monitor

# Server
docker compose pull monitor && docker compose up -d --force-recreate monitor
```
