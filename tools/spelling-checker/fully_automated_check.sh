#!/bin/bash
# Fully Automated Document Checker - NO manual steps

PDF_FILE="$1"

if [ -z "$PDF_FILE" ]; then
    osascript -e 'display dialog "Error: No se proporcionó archivo PDF" with title "Verificación" buttons {"OK"} with icon stop'
    exit 1
fi

# Run the smart checker (OCR-based, fully automated)
cd "$(dirname "$0")"
python3 smart_check.py "$PDF_FILE"
