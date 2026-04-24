#!/bin/bash

# Google Drive Backup Script
# Backs up specified directories to Google Drive (new files only)
# Created: 2025-12-12

# Configuration
RCLONE_REMOTE="gdrive"  # Name of your rclone remote (configured during setup)
LOG_FILE="$HOME/gdrive_backup.log"
SUMMARY_LOG="$HOME/gdrive_backup_history.log"
STATUS_FILE="$HOME/.gdrive_backup_status"

# Directories to back up (source|destination pairs)
BACKUP_SOURCES=(
    "/Volumes/TRABAJOS/2026/ARMADOS"
    "/Volumes/TRABAJOS/2026/DISEÑOS"
    "/Volumes/TRABAJOS/2026/ORDERS"
)
BACKUP_DESTS=(
    "Backups/2026/ARMADOS"
    "Backups/2026/DISENOS"
    "Backups/2026/ORDERS"
)

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to check if rclone is installed
check_rclone() {
    if ! command -v rclone &> /dev/null; then
        log_message "ERROR: rclone is not installed. Please run: brew install rclone"
        exit 1
    fi
}

# Function to check if remote is configured
check_remote() {
    if ! rclone listremotes | grep -q "^${RCLONE_REMOTE}:$"; then
        log_message "ERROR: Remote '$RCLONE_REMOTE' not configured. Run: rclone config"
        exit 1
    fi
}

# Function to check if source directory exists and is mounted
check_source() {
    local source_dir="$1"
    if [[ ! -d "$source_dir" ]]; then
        log_message "WARNING: Source directory not found or not mounted: $source_dir"
        return 1
    fi
    return 0
}

# Function to backup a directory
backup_directory() {
    local source="$1"
    local dest="$2"

    log_message "Starting backup: '$source' -> '$RCLONE_REMOTE:$dest'"

    # Use rclone copy with --update to upload new and modified files
    # --update: Skip files that are newer on destination (only copy if source is newer)
    # --retries 1: Don't retry failed files (skip locked/in-use files quickly)
    # --low-level-retries 1: Minimize retries on I/O errors
    # --ignore-errors: Continue past errors, don't stop the whole backup
    # --log-level INFO: Log info level messages

    rclone copy "$source" "${RCLONE_REMOTE}:${dest}" \
        --update \
        --retries 3 \
        --low-level-retries 1 \
        --tpslimit 8 \
        --tpslimit-burst 0 \
        --log-level INFO \
        --stats 1m \
        --stats-one-line \
        2>&1 | tee -a "$LOG_FILE"

    local exit_code=${PIPESTATUS[0]}

    if [[ $exit_code -eq 0 ]]; then
        log_message "SUCCESS: Backup completed for '$source'"
        return 0
    else
        # Count how many files were actually transferred despite errors
        log_message "WARNING: Backup for '$source' finished with some skipped files (locked/in-use). Continuing..."
        return 0
    fi
}

# Function to get directory size
get_dir_size() {
    local dir="$1"
    if [[ -d "$dir" ]]; then
        du -sh "$dir" 2>/dev/null | cut -f1
    else
        echo "N/A"
    fi
}

# Function to count files in directory
count_files() {
    local dir="$1"
    if [[ -d "$dir" ]]; then
        find "$dir" -type f 2>/dev/null | wc -l | tr -d ' '
    else
        echo "0"
    fi
}

# Function to write summary to history log
write_summary() {
    local status="$1"
    local success_count="$2"
    local fail_count="$3"
    local start_time="$4"
    local end_time="$5"
    local details="$6"

    {
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "  BACKUP REPORT - $(date '+%A, %B %d, %Y')"
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        echo "  Status:     $status"
        echo "  Started:    $start_time"
        echo "  Finished:   $end_time"
        echo ""
        echo "  Results:    $success_count succeeded, $fail_count failed"
        echo ""
        echo "  Directories backed up:"
        for i in "${!BACKUP_SOURCES[@]}"; do
            local src="${BACKUP_SOURCES[$i]}"
            local dst="${BACKUP_DESTS[$i]}"
            local size=$(get_dir_size "$src")
            local files=$(count_files "$src")
            echo "    • $(basename "$src")"
            echo "      Source: $src"
            echo "      Destination: $RCLONE_REMOTE:$dst"
            echo "      Size: $size | Files: $files"
        done
        echo ""
        if [[ -n "$details" ]]; then
            echo "  Notes:"
            echo "$details" | sed 's/^/    /'
            echo ""
        fi
        echo "═══════════════════════════════════════════════════════════════════"
    } >> "$SUMMARY_LOG"
}

# Function to write status file for notification
write_status() {
    local status="$1"
    local success_count="$2"
    local fail_count="$3"
    local details="$4"

    cat > "$STATUS_FILE" << EOF
BACKUP_DATE=$(date '+%Y-%m-%d')
BACKUP_TIME=$(date '+%H:%M:%S')
BACKUP_STATUS=$status
SUCCESS_COUNT=$success_count
FAIL_COUNT=$fail_count
DETAILS=$details
NOTIFIED=0
EOF
}

# Function to send immediate notification
send_notification() {
    local status="$1"
    local success_count="$2"
    local fail_count="$3"

    # Get the directory where this script is located
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local notifier="$script_dir/show_notification.sh"

    # Use beautiful HTML notification if available, fallback to simple notification
    if [[ -x "$notifier" ]]; then
        "$notifier" "$status" "$success_count" "$fail_count" &
    else
        # Fallback to simple macOS notification
        local title message sound
        if [[ "$status" == "SUCCESS" ]]; then
            title="Backup Complete"
            message="$success_count directories backed up successfully."
            sound="Glass"
        elif [[ "$status" == "PARTIAL" ]]; then
            title="Backup Partial"
            message="$success_count succeeded, $fail_count failed."
            sound="Basso"
        else
            title="Backup Failed"
            message="$fail_count directories failed."
            sound="Basso"
        fi
        osascript -e "display notification \"$message\" with title \"$title\" sound name \"$sound\""
    fi
}

# Main execution
main() {
    local start_time=$(date '+%Y-%m-%d %H:%M:%S')
    local details=""

    log_message "=========================================="
    log_message "Starting Google Drive Backup"
    log_message "=========================================="

    # Pre-flight checks
    check_rclone
    check_remote

    local success_count=0
    local fail_count=0

    # Backup each directory
    for i in "${!BACKUP_SOURCES[@]}"; do
        source="${BACKUP_SOURCES[$i]}"
        dest="${BACKUP_DESTS[$i]}"

        if check_source "$source"; then
            if backup_directory "$source" "$dest"; then
                ((success_count++))
            else
                ((fail_count++))
                details="${details}Failed: $(basename "$source")\n"
            fi
        else
            ((fail_count++))
            details="${details}Not mounted: $(basename "$source")\n"
        fi
    done

    local end_time=$(date '+%Y-%m-%d %H:%M:%S')

    log_message "=========================================="
    log_message "Backup Complete: $success_count succeeded, $fail_count failed"
    log_message "=========================================="

    # Determine overall status
    local status
    if [[ $fail_count -eq 0 ]]; then
        status="SUCCESS"
    elif [[ $success_count -gt 0 ]]; then
        status="PARTIAL"
    else
        status="FAILED"
    fi

    # Write summary to history log
    write_summary "$status" "$success_count" "$fail_count" "$start_time" "$end_time" "$details"

    # Write status file for notification system
    write_status "$status" "$success_count" "$fail_count" "$details"

    # Send immediate notification
    send_notification "$status" "$success_count" "$fail_count"

    # Exit with error if any backups failed
    if [[ $fail_count -gt 0 ]]; then
        exit 1
    fi
}

# Run main function
main "$@"
