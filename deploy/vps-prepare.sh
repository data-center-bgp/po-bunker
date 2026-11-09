#!/usr/bin/env bash
# One-time preparation of the VPS for the PO Bunker API: installs Docker Engine
# and the compose plugin from Docker's official apt repository (Ubuntu only).
#
#   cd /opt/po-bunker && git pull --ff-only && sudo bash deploy/vps-prepare.sh
#
# Safe to run again. It does not touch Nginx or the sites it serves, and it does
# not start the API: that is `docker compose up` (see DEPLOY.md).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo bash $0)" >&2
  exit 1
fi

. /etc/os-release
if [ "${ID:-}" != "ubuntu" ]; then
  echo "This script is written for Ubuntu; this host is ${PRETTY_NAME:-unknown}." >&2
  exit 1
fi
CODENAME="${UBUNTU_CODENAME:-$VERSION_CODENAME}"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Docker is already installed: $(docker --version)"
else
  echo "==> Adding Docker's apt repository ($CODENAME)"
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

  # Cap container logs before Docker first starts, so they can never fill the disk.
  # An existing daemon.json is left alone.
  install -m 0755 -d /etc/docker
  if [ ! -e /etc/docker/daemon.json ]; then
    cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
  fi

  echo "==> Installing Docker Engine and the compose plugin"
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable --now docker

# Where the nightly database and file backups will go (set up with the API).
install -d -m 0700 /var/backups/po-bunker

echo
echo "==> Checks"
docker --version
docker compose version
docker run --rm hello-world >/dev/null && echo "hello-world container: ok"
nginx -t
echo "Docker is ready. Nothing else was changed."
