#!/usr/bin/env bash
# WorkTrack Agent — Linux installer
# Usage: curl -fsSL https://your-app.vercel.app/api/agent/install.sh | bash

set -e

APP_URL="${WORKTRACK_SERVER:-https://your-app.vercel.app}"
INSTALL_DIR="/opt/worktrack-agent"
BIN_LINK="/usr/local/bin/worktrack-agent"
SERVICE_DIR="$HOME/.config/systemd/user"
APPIMAGE_PATH="$INSTALL_DIR/WorkTrack-Agent.AppImage"

echo ""
echo "  ██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗"
echo "  ██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝"
echo "  ██║ █╗ ██║██║   ██║██████╔╝█████╔╝ "
echo "  ██║███╗██║██║   ██║██╔══██╗██╔═██╗ "
echo "  ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗"
echo "   ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝"
echo "  WorkTrack Agent — Linux Installer"
echo ""

# Detect distro
if command -v apt-get &>/dev/null; then
  echo "[1/5] Detected Debian/Ubuntu"
  sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1 libsecret-1-0 2>/dev/null || true
elif command -v dnf &>/dev/null; then
  echo "[1/5] Detected Fedora/RHEL"
  sudo dnf install -y gtk3 libnotify nss libXScrnSaver libXtst xdg-utils at-spi2-core libuuid libsecret 2>/dev/null || true
elif command -v pacman &>/dev/null; then
  echo "[1/5] Detected Arch Linux"
  sudo pacman -S --noconfirm gtk3 libnotify nss libxss libxtst xdg-utils at-spi2-core libsecret 2>/dev/null || true
fi

echo "[2/5] Creating install directory..."
sudo mkdir -p "$INSTALL_DIR"
sudo chown "$USER:$USER" "$INSTALL_DIR"

echo "[3/5] Downloading WorkTrack Agent AppImage..."
curl -L --progress-bar "$APP_URL/api/agent/download?platform=linux" -o "$APPIMAGE_PATH"
chmod +x "$APPIMAGE_PATH"

# Symlink to PATH
sudo ln -sf "$APPIMAGE_PATH" "$BIN_LINK" 2>/dev/null || true

echo "[4/5] Setting up auto-start (systemd user service)..."
mkdir -p "$SERVICE_DIR"
cat > "$SERVICE_DIR/worktrack-agent.service" <<EOF
[Unit]
Description=WorkTrack Time Tracking Agent
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=$APPIMAGE_PATH --no-sandbox
Restart=on-failure
RestartSec=5
Environment=WORKTRACK_SERVER=$APP_URL

[Install]
WantedBy=graphical-session.target
EOF

systemctl --user daemon-reload
systemctl --user enable worktrack-agent.service
systemctl --user start  worktrack-agent.service

echo "[5/5] Creating desktop entry..."
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/worktrack-agent.desktop" <<EOF
[Desktop Entry]
Name=WorkTrack Agent
Comment=Time tracking and screenshot monitoring
Exec=$APPIMAGE_PATH --no-sandbox
Icon=$INSTALL_DIR/icon.png
Terminal=false
Type=Application
Categories=Utility;
EOF

echo ""
echo "✅ WorkTrack Agent installed successfully!"
echo ""
echo "   The agent is running. Look for it in your system tray."
echo "   Sign in with your company email to start tracking."
echo ""
echo "   To stop:    systemctl --user stop worktrack-agent"
echo "   To remove:  sudo rm -rf $INSTALL_DIR && systemctl --user disable worktrack-agent"
echo ""
