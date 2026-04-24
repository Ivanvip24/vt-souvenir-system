#!/bin/bash

# Drive Mount Check — Warns you 30 min before backup if TRABAJOS isn't connected
# Runs at 9:00 AM and 6:00 PM (backup runs at 9:30 AM and 6:30 PM)

DRIVE_PATH="/Volumes/TRABAJOS"

if [[ ! -d "$DRIVE_PATH" ]]; then
    osascript -e 'display alert "⚠️ Drive Not Connected" message "TRABAJOS drive is not mounted. Backup starts in 30 minutes!\n\nPlug in the drive to avoid backup failure." as critical buttons {"OK"}'
fi
