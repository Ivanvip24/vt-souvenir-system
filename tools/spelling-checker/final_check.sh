#!/bin/bash
# Final Automated Claude Check - Shows results directly

PDF_FILE="$1"

if [ -z "$PDF_FILE" ]; then
    osascript -e 'display dialog "Error: No se proporcionó archivo PDF" with title "Verificación de Documento" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

if [ ! -f "$PDF_FILE" ]; then
    osascript -e 'display dialog "Error: Archivo no encontrado" with title "Verificación de Documento" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

# Compress PDF
echo "Comprimiendo PDF..."
COMPRESSED=$(python3 -c "
import sys
from pdf2image import convert_from_path
import os

pdf_path = '$PDF_FILE'
file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)

if file_size_mb <= 30:
    print(pdf_path)
else:
    images = convert_from_path(pdf_path, dpi=150, first_page=1, last_page=10)
    output_path = '/tmp/claude_check_compressed.pdf'
    if len(images) == 1:
        images[0].save(output_path, 'PDF', resolution=100.0)
    else:
        images[0].save(output_path, 'PDF', resolution=100.0, save_all=True, append_images=images[1:])
    print(output_path)
" 2>&1)

if [ $? -ne 0 ]; then
    osascript -e "display dialog \"Error al comprimir PDF: $COMPRESSED\" with title \"Verificación de Documento\" buttons {\"OK\"} default button \"OK\" with icon stop"
    exit 1
fi

# Show instruction dialog
osascript << EOF
display dialog "✓ Archivo comprimido y listo

PASO FINAL:
En Claude Code, envía este mensaje:

'Analiza errores ortográficos en español:
$COMPRESSED'

Claude Code te dirá los errores encontrados." with title "Verificación de Documento" buttons {"OK"} default button "OK" with icon note
EOF
