#!/bin/bash

# Beautiful Backup Notification Launcher
# Shows a custom HTML notification popup

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/backup_notification.html"
TEMP_HTML="/tmp/backup_notification_popup.html"

# Read parameters or use defaults
STATUS="${1:-SUCCESS}"
SUCCESS_COUNT="${2:-0}"
FAIL_COUNT="${3:-0}"

# Get current date/time
CURRENT_DATE=$(date '+%B %d, %Y')
CURRENT_TIME=$(date '+%I:%M %p')

# Determine theme based on status
case "$STATUS" in
    "SUCCESS")
        STATUS_CLASS="success"
        ICON="✓"
        TITLE="Backup Complete"
        STATUS_TEXT="All directories synced"
        ;;
    "PARTIAL")
        STATUS_CLASS="partial"
        ICON="⚠"
        TITLE="Backup Partial"
        STATUS_TEXT="$SUCCESS_COUNT synced, $FAIL_COUNT failed"
        ;;
    *)
        STATUS_CLASS="failed"
        ICON="✗"
        TITLE="Backup Failed"
        STATUS_TEXT="$FAIL_COUNT directories failed"
        ;;
esac

# Build directories list HTML
DIR_COUNT=$SUCCESS_COUNT

# Create directories HTML
DIRECTORIES='<div class="dir-item"><span class="dir-icon">📁</span><span class="dir-name">ARMADOS VT</span></div><div class="dir-item"><span class="dir-icon">📁</span><span class="dir-name">DISEÑOS VT</span></div>'

# Generate the notification HTML using a temp file approach
cp "$TEMPLATE" "$TEMP_HTML"

# Replace placeholders
sed -i '' "s/{{STATUS_CLASS}}/$STATUS_CLASS/g" "$TEMP_HTML"
sed -i '' "s/{{ICON}}/$ICON/g" "$TEMP_HTML"
sed -i '' "s/{{TITLE}}/$TITLE/g" "$TEMP_HTML"
sed -i '' "s/{{STATUS_TEXT}}/$STATUS_TEXT/g" "$TEMP_HTML"
sed -i '' "s/{{DATE}}/$CURRENT_DATE/g" "$TEMP_HTML"
sed -i '' "s/{{TIME}}/$CURRENT_TIME/g" "$TEMP_HTML"
sed -i '' "s/{{DIR_COUNT}}/$DIR_COUNT/g" "$TEMP_HTML"
sed -i '' "s|{{DIRECTORIES}}|$DIRECTORIES|g" "$TEMP_HTML"

# Play notification sound
afplay /System/Library/Sounds/Glass.aiff &

# Open in a floating window using AppleScript
osascript <<'APPLESCRIPT'
set notificationFile to "/tmp/backup_notification_popup.html"
set fileURL to "file://" & notificationFile

tell application "Safari"
    activate
    open location fileURL
    delay 1

    tell application "System Events"
        tell process "Safari"
            try
                set position of window 1 to {800, 100}
                set size of window 1 to {420, 520}
            end try
        end tell
    end tell
end tell

delay 8

tell application "Safari"
    try
        close window 1
    end try
end tell
APPLESCRIPT
