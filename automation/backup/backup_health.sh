#!/bin/bash

# Backup Health Dashboard
# Run anytime to see backup status at a glance
# Usage: ./backup_health.sh [--days N]  (default: last 7 days)

HISTORY_LOG="$HOME/gdrive_backup_history.log"
BACKUP_LOG="$HOME/gdrive_backup.log"
STATUS_FILE="$HOME/.gdrive_backup_status"

DAYS=${1:-7}
if [[ "$1" == "--days" ]]; then
    DAYS="${2:-7}"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  BACKUP HEALTH DASHBOARD                                     ${NC}"
echo -e "${BOLD}  $(date '+%A, %B %d, %Y — %H:%M')${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# --- LAST BACKUP STATUS ---
echo -e "${BOLD}  LAST BACKUP${NC}"
echo -e "  ─────────────────────────────────────────"
if [[ -f "$STATUS_FILE" ]]; then
    source "$STATUS_FILE"

    # Calculate time since last backup
    backup_epoch=$(date -j -f "%Y-%m-%d %H:%M:%S" "$BACKUP_DATE $BACKUP_TIME" "+%s" 2>/dev/null)
    now_epoch=$(date "+%s")
    hours_ago=$(( (now_epoch - backup_epoch) / 3600 ))
    mins_ago=$(( ((now_epoch - backup_epoch) % 3600) / 60 ))

    if [[ "$BACKUP_STATUS" == "SUCCESS" && "$FAIL_COUNT" -eq 0 ]]; then
        echo -e "  Status:  ${GREEN}● SUCCESS${NC}"
    elif [[ "$BACKUP_STATUS" == "PARTIAL" ]]; then
        echo -e "  Status:  ${YELLOW}● PARTIAL${NC}"
    else
        echo -e "  Status:  ${RED}● FAILED${NC}"
    fi
    echo -e "  Date:    $BACKUP_DATE at $BACKUP_TIME"
    echo -e "  Ago:     ${hours_ago}h ${mins_ago}m ago"

    if [[ $hours_ago -gt 26 ]]; then
        echo -e "  ${RED}⚠  WARNING: Last backup is over 26 hours old!${NC}"
    fi
else
    echo -e "  ${RED}● No status file found — backup may have never run${NC}"
fi
echo ""

# --- EXTERNAL DRIVE CHECK ---
echo -e "${BOLD}  EXTERNAL DRIVE${NC}"
echo -e "  ─────────────────────────────────────────"
if [[ -d "/Volumes/TRABAJOS" ]]; then
    echo -e "  /Volumes/TRABAJOS:  ${GREEN}● MOUNTED${NC}"

    # Check each source directory
    for dir in "/Volumes/TRABAJOS/2026/ARMADOS" "/Volumes/TRABAJOS/2026/DISEÑOS" "/Volumes/TRABAJOS/2026/ORDERS"; do
        if [[ -d "$dir" ]]; then
            size=$(du -sh "$dir" 2>/dev/null | cut -f1)
            files=$(find "$dir" -type f 2>/dev/null | wc -l | tr -d ' ')
            echo -e "  $(basename "$dir"):  ${GREEN}●${NC} $size / $files files"
        else
            echo -e "  $(basename "$dir"):  ${RED}● NOT FOUND${NC}"
        fi
    done
else
    echo -e "  /Volumes/TRABAJOS:  ${RED}● NOT MOUNTED${NC}"
    echo -e "  ${YELLOW}  Backup will fail until the drive is connected.${NC}"
fi
echo ""

# --- LAUNCHD JOB STATUS ---
echo -e "${BOLD}  SCHEDULED JOBS${NC}"
echo -e "  ─────────────────────────────────────────"
backup_job=$(launchctl list 2>/dev/null | grep "com.user.gdrive-backup" | head -1)
if [[ -n "$backup_job" ]]; then
    exit_code=$(echo "$backup_job" | awk '{print $2}')
    if [[ "$exit_code" == "0" ]]; then
        echo -e "  gdrive-backup:       ${GREEN}● Loaded (last exit: 0)${NC}"
    elif [[ "$exit_code" == "-" ]]; then
        echo -e "  gdrive-backup:       ${GREEN}● Loaded (not yet run this session)${NC}"
    else
        echo -e "  gdrive-backup:       ${YELLOW}● Loaded (last exit: $exit_code)${NC}"
    fi
else
    echo -e "  gdrive-backup:       ${RED}● NOT LOADED${NC}"
fi

notify_job=$(launchctl list 2>/dev/null | grep "com.user.backup-notification" | head -1)
if [[ -n "$notify_job" ]]; then
    echo -e "  backup-notification: ${GREEN}● Loaded${NC}"
else
    echo -e "  backup-notification: ${DIM}○ Not loaded${NC}"
fi
echo ""

# --- DAILY HISTORY (last N days) ---
echo -e "${BOLD}  LAST $DAYS DAYS${NC}"
echo -e "  ─────────────────────────────────────────"

if [[ -f "$HISTORY_LOG" ]]; then
    # Parse history log and show day-by-day summary
    today_epoch=$(date "+%s")

    for ((d=0; d<DAYS; d++)); do
        day_epoch=$((today_epoch - d * 86400))
        day_str=$(date -j -f "%s" "$day_epoch" "+%Y-%m-%d" 2>/dev/null)
        day_name=$(date -j -f "%s" "$day_epoch" "+%a %b %d" 2>/dev/null)

        # Find all reports for this day
        # Match the date line and the next Status line
        day_results=$(grep -A6 "BACKUP REPORT.*$(date -j -f "%s" "$day_epoch" "+%B %d" 2>/dev/null)" "$HISTORY_LOG" | grep "Status:" | sed 's/.*Status:[ ]*//')

        if [[ -z "$day_results" ]]; then
            echo -e "  $day_name  ${DIM}—  No backup ran${NC}"
        else
            # Show each run that day
            has_success=false
            has_fail=false
            run_summary=""
            while IFS= read -r status; do
                if [[ "$status" == "SUCCESS" ]]; then
                    has_success=true
                    run_summary="${run_summary}${GREEN}●${NC} "
                elif [[ "$status" == "PARTIAL" ]]; then
                    has_fail=true
                    run_summary="${run_summary}${YELLOW}●${NC} "
                else
                    has_fail=true
                    run_summary="${run_summary}${RED}●${NC} "
                fi
            done <<< "$day_results"

            echo -e "  $day_name  $run_summary"
        fi
    done
else
    echo -e "  ${DIM}No history log found${NC}"
fi

echo ""

# --- ERRORS IN LAST 24h ---
echo -e "${BOLD}  RECENT ERRORS (last 24h)${NC}"
echo -e "  ─────────────────────────────────────────"
if [[ -f "$BACKUP_LOG" ]]; then
    yesterday=$(date -v-1d "+%Y-%m-%d")
    today=$(date "+%Y-%m-%d")
    errors=$(grep -E "($today|$yesterday).*(ERROR|NOTICE|WARNING.*not found|WARNING.*not mounted)" "$BACKUP_LOG" 2>/dev/null | tail -5)
    if [[ -n "$errors" ]]; then
        while IFS= read -r line; do
            echo -e "  ${RED}$line${NC}"
        done <<< "$errors"
    else
        echo -e "  ${GREEN}No errors in the last 24 hours${NC}"
    fi
else
    echo -e "  ${DIM}No log file found${NC}"
fi

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${DIM}  Run: ./backup_health.sh --days 30  for a longer view${NC}"
echo -e "${DIM}  Logs: ~/gdrive_backup.log  |  ~/gdrive_backup_history.log${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
