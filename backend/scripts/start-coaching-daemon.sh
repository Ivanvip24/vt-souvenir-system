#!/bin/bash
# Sales Coaching — runs Claude Code analysis every 30 minutes via launchd
# Usage:
#   bash backend/scripts/start-coaching-daemon.sh install   — install & start
#   bash backend/scripts/start-coaching-daemon.sh uninstall — stop & remove
#   bash backend/scripts/start-coaching-daemon.sh run       — run once now (for testing)

PROJECT_DIR="/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan-brain-v2"
PLIST_NAME="com.axkan.sales-coaching"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
LOG_DIR="$PROJECT_DIR/backend/logs"
RUNNER="$PROJECT_DIR/backend/scripts/run-coaching.sh"

case "${1:-run}" in
  install)
    mkdir -p "$LOG_DIR"
    mkdir -p "$HOME/Library/LaunchAgents"

    cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${RUNNER}</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/coaching-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/coaching-stderr.log</string>
    <key>RunAtLoad</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>
</dict>
</plist>
PLIST

    launchctl unload "$PLIST_PATH" 2>/dev/null
    launchctl load "$PLIST_PATH"
    echo "Installed and started: ${PLIST_NAME}"
    echo "  Runs every 30 minutes + on login"
    echo "  Logs: ${LOG_DIR}/coaching-*.log"
    echo "  Stop: bash $0 uninstall"
    ;;

  uninstall)
    launchctl unload "$PLIST_PATH" 2>/dev/null
    rm -f "$PLIST_PATH"
    echo "Uninstalled: ${PLIST_NAME}"
    ;;

  run)
    bash "$RUNNER"
    ;;

  *)
    echo "Usage: $0 [install|uninstall|run]"
    exit 1
    ;;
esac
