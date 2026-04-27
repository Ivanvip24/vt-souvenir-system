#!/bin/bash
# Simple wrapper for Automator - handles file input properly

# Set UTF-8 encoding for proper character handling
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LC_CTYPE=en_US.UTF-8

# IMMEDIATE ALERT to confirm action is triggered
osascript -e 'display notification "Iniciando verificación..." with title "Claude Verificador"'

LOG="/tmp/claude_verify_log.txt"
echo "=== Started at $(date) ===" > "$LOG"
echo "Arguments received: $#" >> "$LOG"
echo "Arguments: $@" >> "$LOG"

# Check if we got any arguments
if [ $# -eq 0 ]; then
    echo "ERROR: No file provided" >> "$LOG"
    osascript -e 'display dialog "Error: No se seleccionó archivo PDF" with title "Verificación" buttons {"OK"} with icon stop'
    exit 1
fi

# Show starting dialog
osascript -e 'display notification "Analizando documento..." with title "Claude Verificador"'

# Process each file
for file in "$@"; do
    echo "Processing: $file" >> "$LOG"

    if [ ! -f "$file" ]; then
        echo "ERROR: File not found: $file" >> "$LOG"
        osascript -e "display dialog \"Error: Archivo no encontrado: $file\" with title \"Verificación\" buttons {\"OK\"} with icon stop"
        continue
    fi

    # Run the verification
    /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan-brain-v2/tools/spelling-checker/auto_verify.sh "$file" >> "$LOG" 2>&1
    echo "Exit code: $?" >> "$LOG"
done

echo "=== Finished at $(date) ===" >> "$LOG"
