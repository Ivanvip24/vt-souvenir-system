#!/bin/bash
# Automator wrapper for auto_verify.sh

# Log file for debugging
LOG_FILE="/tmp/claude_verify_log.txt"
echo "=== Started at $(date) ===" > "$LOG_FILE"

# Loop through all arguments (files) passed by Automator
for file in "$@"; do
    echo "Processing: $file" >> "$LOG_FILE"
    /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan-brain-v2/tools/spelling-checker/auto_verify.sh "$file" >> "$LOG_FILE" 2>&1
    echo "Exit code: $?" >> "$LOG_FILE"
done

echo "=== Finished at $(date) ===" >> "$LOG_FILE"

# Show log if needed (for debugging)
# cat "$LOG_FILE"
