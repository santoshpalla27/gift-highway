1. Update system

sudo apt-get update -y && sudo apt-get upgrade -y

2. Install dependencies

sudo apt-get install -y curl wget gnupg2 lsb-release ca-certificates ufw fail2ban unattended-upgrades htop net-tools logrotate chrony

3. Create 2GB swap

sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

4. Kernel tuning

sudo tee /etc/sysctl.d/99-production.conf << 'EOF'
vm.swappiness=10
vm.dirty_ratio=15
vm.dirty_background_ratio=5
net.core.somaxconn=65535
net.core.netdev_max_backlog=65536
net.ipv4.tcp_max_syn_backlog=65535
net.ipv4.tcp_fin_timeout=15
net.ipv4.tcp_keepalive_time=300
net.ipv4.tcp_keepalive_intvl=30
net.ipv4.tcp_keepalive_probes=5
net.ipv4.ip_local_port_range=1024 65535
net.ipv4.tcp_tw_reuse=1
fs.file-max=1048576
fs.inotify.max_user_watches=524288
fs.inotify.max_user_instances=8192
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.default.rp_filter=1
net.ipv4.icmp_echo_ignore_broadcasts=1
net.ipv4.conf.all.accept_source_route=0
kernel.dmesg_restrict=1
EOF
sudo sysctl --system

5. File descriptor limits

sudo mkdir -p /etc/systemd/system.conf.d

echo '\* soft nofile 1048576

- hard nofile 1048576
- soft nproc 65535
- hard nproc 65535' | sudo tee -a /etc/security/limits.conf

sudo tee /etc/systemd/system.conf.d/limits.conf << 'EOF'
[Manager]
DefaultLimitNOFILE=1048576
DefaultLimitNPROC=65535
EOF

6. Install Docker

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --yes --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

7. Configure Docker daemon

sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json << 'EOF'
{
"log-driver": "json-file",
"log-opts": { "max-size": "20m", "max-file": "3" },
"storage-driver": "overlay2",
"live-restore": true,
"userland-proxy": false,
"no-new-privileges": true,
"default-ulimits": {
"nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 }
}
}
EOF
sudo systemctl enable docker
sudo systemctl restart docker

8. Add user to docker group

sudo usermod -aG docker $USER
newgrp docker

9. Firewall

sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw --force enable
sudo ufw status verbose

10. Fail2ban

sudo tee /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

11. Verify everything

docker --version
docker compose version
free -h
sudo ufw status
sudo systemctl status fail2ban --no-pager
docker ps -a
