#!/bin/bash

# Backup Notification Script
# Shows a popup notification about the last backup status on login
# Created: 2025-12-18

STATUS_FILE="$HOME/.gdrive_backup_status"
SUMMARY_LOG="$HOME/gdrive_backup_history.log"

# Check if status file exists
if [[ ! -f "$STATUS_FILE" ]]; then
    exit 0
fi

# Read status file
source "$STATUS_FILE"

# Check if already notified
if [[ "$NOTIFIED" == "1" ]]; then
    exit 0
fi

# Calculate how long ago the backup was
backup_epoch=$(date -j -f "%Y-%m-%d %H:%M:%S" "$BACKUP_DATE $BACKUP_TIME" "+%s" 2>/dev/null)
current_epoch=$(date "+%s")
hours_ago=$(( (current_epoch - backup_epoch) / 3600 ))

# Build the message
if [[ "$BACKUP_STATUS" == "SUCCESS" ]]; then
    icon="checkmark.circle.fill"
    title="Backup Successful"
    message="Your Google Drive backup completed successfully.

Date: $BACKUP_DATE
Time: $BACKUP_TIME
Results: $SUCCESS_COUNT directories backed up

All files have been synced to Google Drive."

elif [[ "$BACKUP_STATUS" == "PARTIAL" ]]; then
    icon="exclamationmark.triangle.fill"
    title="Backup Partially Completed"
    message="Some backups completed, but there were issues.

Date: $BACKUP_DATE
Time: $BACKUP_TIME
Results: $SUCCESS_COUNT succeeded, $FAIL_COUNT failed

Check the log for details:
$SUMMARY_LOG"

else
    icon="xmark.circle.fill"
    title="Backup Failed"
    message="The Google Drive backup failed.

Date: $BACKUP_DATE
Time: $BACKUP_TIME
Results: $FAIL_COUNT failed

Check the log for details:
$SUMMARY_LOG"
fi

# Show the notification dialog using AppleScript
osascript <<EOF
tell application "System Events"
    display dialog "$message" with title "$title" buttons {"View Log", "OK"} default button "OK" with icon caution
    set userChoice to button returned of result
    if userChoice is "View Log" then
        do shell script "open -a TextEdit '$SUMMARY_LOG'"
    end if
end tell
EOF

# Mark as notified
sed -i '' 's/NOTIFIED=0/NOTIFIED=1/' "$STATUS_FILE"
