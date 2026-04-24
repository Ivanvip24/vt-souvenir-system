#!/bin/bash

# Morning Backup Report — Opens a full-screen HTML status page in the browser
# Triggered daily by launchd so you always know if backups are working

HISTORY_LOG="$HOME/gdrive_backup_history.log"
BACKUP_LOG="$HOME/gdrive_backup.log"
STATUS_FILE="$HOME/.gdrive_backup_status"
HTML_FILE="$HOME/.backup_report.html"

# ── Gather data ──────────────────────────────────────────────

# Last backup info
if [[ -f "$STATUS_FILE" ]]; then
    source "$STATUS_FILE"
    backup_epoch=$(date -j -f "%Y-%m-%d %H:%M:%S" "$BACKUP_DATE $BACKUP_TIME" "+%s" 2>/dev/null)
    now_epoch=$(date "+%s")
    hours_ago=$(( (now_epoch - backup_epoch) / 3600 ))
    mins_ago=$(( ((now_epoch - backup_epoch) % 3600) / 60 ))
    LAST_STATUS="$BACKUP_STATUS"
    LAST_DATE="$BACKUP_DATE"
    LAST_TIME="$BACKUP_TIME"
    LAST_SUCCESS="$SUCCESS_COUNT"
    LAST_FAIL="$FAIL_COUNT"
    TIME_AGO="${hours_ago}h ${mins_ago}m ago"
else
    LAST_STATUS="UNKNOWN"
    LAST_DATE="—"
    LAST_TIME="—"
    LAST_SUCCESS="0"
    LAST_FAIL="0"
    TIME_AGO="never"
fi

# Drive mounted?
if [[ -d "/Volumes/TRABAJOS" ]]; then
    DRIVE_STATUS="MOUNTED"
    DRIVE_COLOR="#22c55e"
    DRIVE_ICON="✓"
    DRIVE_TEXT="Connected"

    # Get sizes
    ARMADOS_SIZE=$(du -sh "/Volumes/TRABAJOS/2026/ARMADOS" 2>/dev/null | cut -f1 || echo "—")
    ARMADOS_FILES=$(find "/Volumes/TRABAJOS/2026/ARMADOS" -type f 2>/dev/null | wc -l | tr -d ' ')
    DISENOS_SIZE=$(du -sh "/Volumes/TRABAJOS/2026/DISEÑOS" 2>/dev/null | cut -f1 || echo "—")
    DISENOS_FILES=$(find "/Volumes/TRABAJOS/2026/DISEÑOS" -type f 2>/dev/null | wc -l | tr -d ' ')
    ORDERS_SIZE=$(du -sh "/Volumes/TRABAJOS/2026/ORDERS" 2>/dev/null | cut -f1 || echo "—")
    ORDERS_FILES=$(find "/Volumes/TRABAJOS/2026/ORDERS" -type f 2>/dev/null | wc -l | tr -d ' ')
else
    DRIVE_STATUS="NOT_MOUNTED"
    DRIVE_COLOR="#ef4444"
    DRIVE_ICON="✗"
    DRIVE_TEXT="Not Connected"
    ARMADOS_SIZE="—"; ARMADOS_FILES="—"
    DISENOS_SIZE="—"; DISENOS_FILES="—"
    ORDERS_SIZE="—"; ORDERS_FILES="—"
fi

# Determine main status display
if [[ "$LAST_STATUS" == "SUCCESS" && "$hours_ago" -lt 26 ]]; then
    MAIN_ICON="✓"
    MAIN_COLOR="#22c55e"
    MAIN_BG="linear-gradient(135deg, #065f46 0%, #064e3b 100%)"
    MAIN_TEXT="Backup OK"
    MAIN_SUB="Last backup completed successfully"
    GLOW_COLOR="rgba(34, 197, 94, 0.3)"
elif [[ "$LAST_STATUS" == "SUCCESS" && "$hours_ago" -ge 26 ]]; then
    MAIN_ICON="!"
    MAIN_COLOR="#f59e0b"
    MAIN_BG="linear-gradient(135deg, #78350f 0%, #713f12 100%)"
    MAIN_TEXT="Stale Backup"
    MAIN_SUB="Last success was ${TIME_AGO} — check if backup ran today"
    GLOW_COLOR="rgba(245, 158, 11, 0.3)"
elif [[ "$LAST_STATUS" == "PARTIAL" ]]; then
    MAIN_ICON="!"
    MAIN_COLOR="#f59e0b"
    MAIN_BG="linear-gradient(135deg, #78350f 0%, #713f12 100%)"
    MAIN_TEXT="Partial Backup"
    MAIN_SUB="Some directories failed — check drive connection"
    GLOW_COLOR="rgba(245, 158, 11, 0.3)"
elif [[ "$LAST_STATUS" == "FAILED" ]]; then
    MAIN_ICON="✗"
    MAIN_COLOR="#ef4444"
    MAIN_BG="linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)"
    MAIN_TEXT="Backup Failed"
    MAIN_SUB="All directories failed — drive was likely not connected"
    GLOW_COLOR="rgba(239, 68, 68, 0.3)"
else
    MAIN_ICON="?"
    MAIN_COLOR="#6b7280"
    MAIN_BG="linear-gradient(135deg, #1f2937 0%, #111827 100%)"
    MAIN_TEXT="No Data"
    MAIN_SUB="No backup status found"
    GLOW_COLOR="rgba(107, 114, 128, 0.3)"
fi

# Build 7-day history
HISTORY_ROWS=""
today_epoch=$(date "+%s")
for ((d=0; d<7; d++)); do
    day_epoch=$((today_epoch - d * 86400))
    day_name=$(date -j -f "%s" "$day_epoch" "+%a" 2>/dev/null)
    day_num=$(date -j -f "%s" "$day_epoch" "+%b %d" 2>/dev/null)
    day_match=$(date -j -f "%s" "$day_epoch" "+%B %d" 2>/dev/null)

    if [[ -f "$HISTORY_LOG" ]]; then
        day_results=$(grep -A6 "BACKUP REPORT.*$day_match" "$HISTORY_LOG" | grep "Status:" | sed 's/.*Status:[ ]*//')
    else
        day_results=""
    fi

    dots=""
    if [[ -z "$day_results" ]]; then
        dots='<span class="dot dot-none"></span>'
    else
        while IFS= read -r status; do
            if [[ "$status" == "SUCCESS" ]]; then
                dots="${dots}<span class=\"dot dot-ok\"></span>"
            elif [[ "$status" == "PARTIAL" ]]; then
                dots="${dots}<span class=\"dot dot-warn\"></span>"
            else
                dots="${dots}<span class=\"dot dot-fail\"></span>"
            fi
        done <<< "$day_results"
    fi

    is_today=""
    if [[ $d -eq 0 ]]; then
        is_today=" today"
    fi

    HISTORY_ROWS="${HISTORY_ROWS}
    <div class=\"day-row${is_today}\">
        <span class=\"day-label\">${day_name}</span>
        <span class=\"day-date\">${day_num}</span>
        <span class=\"day-dots\">${dots}</span>
    </div>"
done

# Recent errors
RECENT_ERRORS=""
if [[ -f "$BACKUP_LOG" ]]; then
    yesterday=$(date -v-1d "+%Y-%m-%d")
    today_str=$(date "+%Y-%m-%d")
    errors=$(grep -E "($today_str|$yesterday).*(ERROR|NOTICE.*Failed|WARNING.*not found|WARNING.*not mounted)" "$BACKUP_LOG" 2>/dev/null | tail -3)
    if [[ -n "$errors" ]]; then
        while IFS= read -r line; do
            # Truncate long lines
            short=$(echo "$line" | cut -c1-90)
            RECENT_ERRORS="${RECENT_ERRORS}<div class=\"error-line\">${short}</div>"
        done <<< "$errors"
    fi
fi

# ── Generate HTML ──────────────────────────────────────────────

cat > "$HTML_FILE" << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Backup Status — $(date '+%b %d')</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #0a0a0a;
    color: #e5e5e5;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
  }

  .container {
    width: 100%;
    max-width: 580px;
  }

  /* ── Hero status ── */
  .hero {
    background: ${MAIN_BG};
    border-radius: 24px;
    padding: 48px 40px;
    text-align: center;
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.06);
  }

  .hero::before {
    content: '';
    position: absolute;
    top: -60%;
    left: 50%;
    transform: translateX(-50%);
    width: 300px;
    height: 300px;
    background: ${GLOW_COLOR};
    border-radius: 50%;
    filter: blur(80px);
  }

  .hero-icon {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: ${MAIN_COLOR};
    color: #000;
    font-size: 52px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 24px;
    position: relative;
    box-shadow: 0 0 40px ${GLOW_COLOR}, 0 0 80px ${GLOW_COLOR};
  }

  .hero h1 {
    font-size: 36px;
    font-weight: 800;
    color: #fff;
    margin-bottom: 8px;
    position: relative;
    letter-spacing: -0.5px;
  }

  .hero p {
    font-size: 15px;
    color: rgba(255,255,255,0.6);
    position: relative;
  }

  .hero .timestamp {
    margin-top: 20px;
    font-size: 13px;
    color: rgba(255,255,255,0.35);
    position: relative;
  }

  /* ── Cards ── */
  .card {
    background: #141414;
    border: 1px solid #222;
    border-radius: 16px;
    padding: 24px;
    margin-top: 16px;
  }

  .card-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #666;
    margin-bottom: 16px;
  }

  /* ── Drive status ── */
  .drive-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .drive-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${DRIVE_COLOR};
    box-shadow: 0 0 8px ${DRIVE_COLOR};
  }

  .drive-label {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }

  .drive-sub {
    font-size: 13px;
    color: #666;
    margin-left: auto;
  }

  .folder-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-top: 4px;
  }

  .folder-item {
    background: #1a1a1a;
    border-radius: 10px;
    padding: 14px;
    text-align: center;
  }

  .folder-name {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #888;
    margin-bottom: 6px;
  }

  .folder-size {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
  }

  .folder-files {
    font-size: 11px;
    color: #555;
    margin-top: 2px;
  }

  /* ── 7-day history ── */
  .day-row {
    display: flex;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #1a1a1a;
  }

  .day-row:last-child { border-bottom: none; }

  .day-row.today {
    background: rgba(255,255,255,0.02);
    border-radius: 8px;
    padding: 8px;
    margin: 0 -8px;
  }

  .day-label {
    font-size: 13px;
    font-weight: 600;
    color: #999;
    width: 40px;
  }

  .day-date {
    font-size: 13px;
    color: #555;
    width: 60px;
  }

  .day-dots {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: inline-block;
  }

  .dot-ok { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.4); }
  .dot-warn { background: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,0.4); }
  .dot-fail { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,0.4); }
  .dot-none { background: #333; }

  /* ── Errors ── */
  .error-line {
    font-size: 11px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #ef4444;
    padding: 6px 0;
    border-bottom: 1px solid #1a1a1a;
    word-break: break-all;
  }
  .error-line:last-child { border-bottom: none; }

  .no-errors {
    font-size: 13px;
    color: #22c55e;
  }

  /* ── Footer ── */
  .footer {
    text-align: center;
    margin-top: 24px;
    font-size: 12px;
    color: #333;
  }

  .dismiss-btn {
    display: block;
    width: 100%;
    margin-top: 16px;
    padding: 14px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    color: #888;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  .dismiss-btn:hover {
    background: #222;
    color: #fff;
    border-color: #444;
  }
</style>
</head>
<body>

<div class="container">

  <!-- Hero -->
  <div class="hero">
    <div class="hero-icon">${MAIN_ICON}</div>
    <h1>${MAIN_TEXT}</h1>
    <p>${MAIN_SUB}</p>
    <div class="timestamp">${LAST_DATE} at ${LAST_TIME} · ${TIME_AGO}</div>
  </div>

  <!-- Drive -->
  <div class="card">
    <div class="card-title">External Drive</div>
    <div class="drive-row">
      <span class="drive-indicator"></span>
      <span class="drive-label">/Volumes/TRABAJOS</span>
      <span class="drive-sub">${DRIVE_TEXT}</span>
    </div>
    <div class="folder-grid">
      <div class="folder-item">
        <div class="folder-name">Armados</div>
        <div class="folder-size">${ARMADOS_SIZE}</div>
        <div class="folder-files">${ARMADOS_FILES} files</div>
      </div>
      <div class="folder-item">
        <div class="folder-name">Diseños</div>
        <div class="folder-size">${DISENOS_SIZE}</div>
        <div class="folder-files">${DISENOS_FILES} files</div>
      </div>
      <div class="folder-item">
        <div class="folder-name">Orders</div>
        <div class="folder-size">${ORDERS_SIZE}</div>
        <div class="folder-files">${ORDERS_FILES} files</div>
      </div>
    </div>
  </div>

  <!-- 7-day history -->
  <div class="card">
    <div class="card-title">Last 7 Days</div>
    ${HISTORY_ROWS}
  </div>

  <!-- Errors -->
  <div class="card">
    <div class="card-title">Recent Errors</div>
    ${RECENT_ERRORS:-<div class="no-errors">No errors in the last 24 hours</div>}
  </div>

  <button class="dismiss-btn" onclick="window.close()">Dismiss</button>

  <div class="footer">AXKAN Backup Monitor · $(date '+%B %d, %Y')</div>

</div>

</body>
</html>
HTMLEOF

# Open in browser
open "$HTML_FILE"
