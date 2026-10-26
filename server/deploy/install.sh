#!/usr/bin/env bash
# ==============================================================================
# Kiyo Platform - 1-Click Self-Hosted Server Installer (Linux)
# ==============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==================================================================${NC}"
echo -e "${BLUE}        Kiyo Platform - Self-Hosted Server Installer               ${NC}"
echo -e "${BLUE}==================================================================${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Please run as root (sudo bash install.sh)${NC}"
  exit 1
fi

INSTALL_DIR="/opt/kiyo"
DATA_DIR="$INSTALL_DIR/data"
STORAGE_DIR="$DATA_DIR/files"
SERVICE_FILE="/etc/systemd/system/kiyo.service"

echo -e "${YELLOW}[1/4] Preparing directories in $INSTALL_DIR...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$STORAGE_DIR"

echo -e "${YELLOW}[2/4] Setting up default configuration...${NC}"
if [ ! -f "$INSTALL_DIR/.env" ]; then
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || tr -dc A-Za-z0-9 </dev/urandom | head -c 64)
    ADMIN_PASS="KiyoAdmin@$(tr -dc A-Za-z0-9 </dev/urandom | head -c 8)#"
    cat <<EOF > "$INSTALL_DIR/.env"
KIYO_API_HOST=0.0.0.0
KIYO_API_PORT=3001
KIYO_API_DB_PATH=$DATA_DIR/kiyo.sqlite
KIYO_API_STORAGE_PATH=$STORAGE_DIR
KIYO_STATIC_DIR=$INSTALL_DIR/dist
KIYO_JWT_SECRET=$JWT_SECRET
KIYO_BOOTSTRAP_ADMIN_EMAIL=admin@kiyo.local
KIYO_BOOTSTRAP_ADMIN_PASSWORD=$ADMIN_PASS
EOF
    echo -e "${GREEN}Created new configuration with secure secrets.${NC}"
fi

echo -e "${YELLOW}[3/4] Copying binary and web assets...${NC}"
if [ -f "./kiyo-server" ]; then
    cp ./kiyo-server "$INSTALL_DIR/kiyo-server"
    chmod +x "$INSTALL_DIR/kiyo-server"
fi

if [ -d "./dist" ]; then
    cp -r ./dist "$INSTALL_DIR/"
fi

echo -e "${YELLOW}[4/4] Configuring and starting Systemd Service...${NC}"
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Kiyo Platform Self-Hosted Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=-$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/kiyo-server
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable kiyo.service
systemctl restart kiyo.service

SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}  Kiyo Platform Server Installed & Started Successfully!          ${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo -e "  - Access Web UI & API:  ${BLUE}http://${SERVER_IP}:3001${NC}"
echo -e "  - Default Admin Email:  ${YELLOW}admin@kiyo.local${NC}"
if [ -n "$ADMIN_PASS" ]; then
echo -e "  - Default Admin Pass:   ${YELLOW}$ADMIN_PASS${NC}"
fi
echo -e "  - Service Status:       ${BLUE}systemctl status kiyo${NC}"
echo -e "  - Service Logs:         ${BLUE}journalctl -u kiyo -f${NC}"
echo -e "${GREEN}==================================================================${NC}"
