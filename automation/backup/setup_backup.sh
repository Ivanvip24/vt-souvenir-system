#!/bin/bash

# Google Drive Backup - Setup Script
# This script helps you set up automated backups to Google Drive

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.user.gdrive-backup.plist"
LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"

echo "=========================================="
echo "  Google Drive Backup Setup"
echo "=========================================="
echo ""

# Step 1: Check/Install rclone
echo "Step 1: Checking for rclone..."
if command -v rclone &> /dev/null; then
    echo "  [OK] rclone is already installed ($(rclone version | head -1))"
else
    echo "  [!] rclone is not installed"
    echo ""
    read -p "Would you like to install rclone via Homebrew? (y/n): " install_choice
    if [[ "$install_choice" == "y" || "$install_choice" == "Y" ]]; then
        if command -v brew &> /dev/null; then
            echo "  Installing rclone..."
            brew install rclone
        else
            echo "  [ERROR] Homebrew not found. Please install rclone manually:"
            echo "  https://rclone.org/install/"
            exit 1
        fi
    else
        echo "  Please install rclone manually and run this script again."
        exit 1
    fi
fi

echo ""

# Step 2: Configure rclone remote
echo "Step 2: Configuring Google Drive remote..."
if rclone listremotes | grep -q "^gdrive:$"; then
    echo "  [OK] Google Drive remote 'gdrive' is already configured"
else
    echo "  [!] Google Drive remote not found"
    echo ""
    echo "  You need to configure rclone to access Google Drive."
    echo "  This will open a browser for authentication."
    echo ""
    read -p "Press Enter to start configuration (or Ctrl+C to cancel)..."
    echo ""
    echo "  When prompted:"
    echo "    - Name: gdrive"
    echo "    - Storage type: Choose 'Google Drive' (usually option 18)"
    echo "    - client_id: Leave blank (press Enter)"
    echo "    - client_secret: Leave blank (press Enter)"
    echo "    - scope: Choose '1' (Full access)"
    echo "    - root_folder_id: Leave blank (press Enter)"
    echo "    - service_account_file: Leave blank (press Enter)"
    echo "    - Edit advanced config: n"
    echo "    - Use auto config: y"
    echo "    - Configure as team drive: n (unless you use Shared Drives)"
    echo ""
    read -p "Press Enter to continue..."
    rclone config
fi

echo ""

# Step 3: Verify remote works
echo "Step 3: Testing Google Drive connection..."
if rclone lsd gdrive: &> /dev/null; then
    echo "  [OK] Successfully connected to Google Drive"
else
    echo "  [ERROR] Could not connect to Google Drive"
    echo "  Please run 'rclone config' to reconfigure"
    exit 1
fi

echo ""

# Step 4: Make backup script executable
echo "Step 4: Setting up backup script..."
chmod +x "$SCRIPT_DIR/gdrive_backup.sh"
echo "  [OK] Backup script is ready: $SCRIPT_DIR/gdrive_backup.sh"

echo ""

# Step 5: Install launchd plist
echo "Step 5: Setting up daily schedule (11:00 PM)..."
mkdir -p "$LAUNCHAGENTS_DIR"

# Unload existing if present
if launchctl list | grep -q "com.user.gdrive-backup"; then
    launchctl unload "$LAUNCHAGENTS_DIR/$PLIST_NAME" 2>/dev/null
fi

# Copy plist to LaunchAgents
cp "$SCRIPT_DIR/$PLIST_NAME" "$LAUNCHAGENTS_DIR/"

# Load the plist
launchctl load "$LAUNCHAGENTS_DIR/$PLIST_NAME"

if launchctl list | grep -q "com.user.gdrive-backup"; then
    echo "  [OK] Daily backup scheduled for 11:00 PM"
else
    echo "  [WARNING] Schedule may not have loaded. Try manually:"
    echo "  launchctl load $LAUNCHAGENTS_DIR/$PLIST_NAME"
fi

echo ""

# Step 6: Run initial backup
echo "Step 6: Initial backup..."
echo ""
echo "  Directories to back up:"
echo "    - /Volumes/TRABAJOS/2025/ARMADOS VT -> gdrive:Backups/ARMADOS_VT"
echo "    - /Volumes/TRABAJOS/2025/DISEÑOS VT -> gdrive:Backups/DISENOS_VT"
echo ""
read -p "Would you like to run the initial backup now? (y/n): " run_backup
if [[ "$run_backup" == "y" || "$run_backup" == "Y" ]]; then
    echo ""
    echo "  Starting initial backup (this may take a while)..."
    echo ""
    "$SCRIPT_DIR/gdrive_backup.sh"
fi

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Your backups will run automatically every day at 11:00 PM."
echo ""
echo "Useful commands:"
echo "  - Run backup manually:  $SCRIPT_DIR/gdrive_backup.sh"
echo "  - View backup logs:     cat ~/gdrive_backup.log"
echo "  - Check schedule:       launchctl list | grep gdrive"
echo "  - Disable schedule:     launchctl unload $LAUNCHAGENTS_DIR/$PLIST_NAME"
echo "  - Re-enable schedule:   launchctl load $LAUNCHAGENTS_DIR/$PLIST_NAME"
echo ""
