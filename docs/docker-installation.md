
sudo dnf install -y docker

sudo systemctl enable docker
sudo systemctl start docker
sudo systemctl status docker

sudo usermod -aG docker $USER
newgrp docker


sudo mkdir -p /usr/local/lib/docker/cli-plugins

sudo curl -SL \
https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
-o /usr/local/lib/docker/cli-plugins/docker-compose

sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

docker compose version


rm -f ~/.docker/cli-plugins/docker-buildx

mkdir -p ~/.docker/cli-plugins

curl -L \
https://github.com/docker/buildx/releases/download/v0.28.0/buildx-v0.28.0.linux-amd64 \
-o ~/.docker/cli-plugins/docker-buildx

chmod +x ~/.docker/cli-plugins/docker-buildx


ls -lh ~/.docker/cli-plugins/docker-buildx