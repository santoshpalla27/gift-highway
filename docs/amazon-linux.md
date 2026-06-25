# Update system

sudo dnf update -y

# Install Docker Engine

sudo dnf install -y docker

# Enable and start Docker

sudo systemctl enable --now docker

# Create Docker CLI plugins directory

sudo mkdir -p /usr/libexec/docker/cli-plugins

# Install Docker Buildx

sudo curl -fL \
https://github.com/docker/buildx/releases/download/v0.35.0/buildx-v0.35.0.linux-amd64 \
-o /usr/libexec/docker/cli-plugins/docker-buildx

# Install Docker Compose

sudo curl -fL \
https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
-o /usr/libexec/docker/cli-plugins/docker-compose

# Make plugins executable

sudo chmod +x /usr/libexec/docker/cli-plugins/docker-buildx
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# (Optional) Use Docker without sudo

sudo usermod -aG docker $USER
newgrp docker

# Verify installation

docker --version
docker buildx version
docker compose version
docker buildx ls
