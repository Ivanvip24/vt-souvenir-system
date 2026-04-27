#!/bin/bash
# Fully Automated Document Verification with Claude Code
# No manual steps required

# Set UTF-8 encoding for proper character handling
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LC_CTYPE=en_US.UTF-8

PDF_FILE="$1"

if [ -z "$PDF_FILE" ]; then
    osascript -e 'display dialog "Error: No se proporcionó archivo PDF" with title "Verificación" buttons {"OK"} with icon stop'
    exit 1
fi

if [ ! -f "$PDF_FILE" ]; then
    osascript -e 'display dialog "Error: Archivo no encontrado" with title "Verificación" buttons {"OK"} with icon stop'
    exit 1
fi

# Compress PDF if needed
echo "Preparando documento..."

# Remove old compressed PDF to avoid caching issues
rm -f /tmp/claude_verify_compressed.pdf

COMPRESSED_PDF=$(python3 -c "
import sys
import os
from pdf2image import convert_from_path

pdf_path = '$PDF_FILE'
file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)

if file_size_mb <= 30:
    print(pdf_path)
    sys.exit(0)

# Compress - use lower DPI for speed, still readable
images = convert_from_path(pdf_path, dpi=120, first_page=1, last_page=10)
output_path = '/tmp/claude_verify_compressed.pdf'

if len(images) == 1:
    images[0].save(output_path, 'PDF', resolution=72.0, optimize=True, quality=85)
else:
    images[0].save(output_path, 'PDF', resolution=72.0, save_all=True, append_images=images[1:], optimize=True, quality=85)

print(output_path)
" 2>&1)

if [ $? -ne 0 ]; then
    osascript -e "display dialog \"Error al preparar PDF: $COMPRESSED_PDF\" with title \"Verificación\" buttons {\"OK\"} with icon stop"
    exit 1
fi

# Create the prompt for Claude
PROMPT="Analiza este diseño PDF y encuentra ÚNICAMENTE errores ortográficos REALES en el texto visible en español.

IMPORTANTE:
- Lee TODO el texto visible (incluso cursiva/script/decorativo)
- Busca errores de acentuación (ej: 'Jimenez' debe ser 'Jiménez')
- Busca palabras mal escritas (ej: 'FUNENRARIA' debe ser 'FUNERARIA')
- IGNORA números, teléfonos, códigos

Responde SOLO en este formato:
Si hay errores:
ERRORES:
1. 'palabra_incorrecta' → 'palabra_correcta'
2. 'palabra_incorrecta' → 'palabra_correcta'

Si NO hay errores:
CORRECTO

Archivo: $COMPRESSED_PDF"

# Call Claude CLI with the PDF
echo "Analizando con Claude Code..."
RESULT=$(claude --print --dangerously-skip-permissions "Analiza CUIDADOSAMENTE este PDF y encuentra TODOS los errores ortográficos en español: $COMPRESSED_PDF

Instrucciones CRÍTICAS:
1. Lee ABSOLUTAMENTE TODO el texto visible, sin importar el tamaño:
   - Títulos grandes
   - Texto pequeño
   - Texto en cursiva/script/decorativo
   - Texto en señales, carteles, etiquetas
   - Cualquier palabra visible en la imagen

2. Busca estos errores:
   - Acentuación faltante (ej: 'Jimenez' → 'Jiménez')
   - Palabras mal escritas (ej: 'FUNENRARIA' → 'FUNERARIA', 'TACING' → 'TAXI')
   - Errores de ortografía en cualquier idioma que aparezca

3. IGNORA solamente:
   - Números y códigos
   - Teléfonos
   - Marcas comerciales en inglés

IMPORTANTE: Sé EXTREMADAMENTE cuidadoso. Lee cada palabra visible, incluso las pequeñas.

FORMATO DE RESPUESTA - CRÍTICO - NO DESVIAR:

Responde ÚNICAMENTE con UNA de estas dos opciones:

OPCIÓN A (si hay errores):
ERRORES:
1. 'palabra_incorrecta' → 'palabra_correcta'
2. 'palabra_incorrecta' → 'palabra_correcta'

OPCIÓN B (si NO hay errores):
CORRECTO

ABSOLUTAMENTE PROHIBIDO:
- No agregues explicaciones
- No agregues texto antes o después
- No uses markdown
- No numeres páginas
- Solo el formato exacto mostrado arriba" 2>&1)

# Save full result for debugging
echo "=== CLAUDE RESPONSE ===" >> /tmp/claude_verify_log.txt
echo "$RESULT" >> /tmp/claude_verify_log.txt
echo "=== END RESPONSE ===" >> /tmp/claude_verify_log.txt

# Parse result and show dialog
# Check for errors FIRST (more specific), then check for correct
if echo "$RESULT" | grep -q "ERRORES:"; then
    # Extract errors
    ERRORS=$(echo "$RESULT" | sed -n '/ERRORES:/,/^$/p' | tail -n +2)
    ERROR_COUNT=$(echo "$ERRORS" | grep -c "^[0-9]")

    # Format for dialog - convert all special chars to ASCII
    ERRORS_CLEAN=$(echo "$ERRORS" | sed 's/→/->/g' | sed "s/'/'/g")

    # Use osascript with heredoc
    osascript <<EOF
display dialog "ERROR - NO IMPRIMIR

Se detectaron $ERROR_COUNT errores:

$ERRORS_CLEAN

CORREGIR INMEDIATAMENTE" with title "Verificacion de Documento" buttons {"OK"} default button "OK" with icon stop
EOF

    echo "ERRORES ENCONTRADOS:"
    echo "$ERRORS"
elif echo "$RESULT" | grep -q "CORRECTO"; then
    osascript <<EOF
display dialog "FELICITACIONES - ARCHIVO CORRECTO

No se detectaron errores de ortografia." with title "Verificacion de Documento" buttons {"OK"} default button "OK" with icon note
EOF
    echo "DOCUMENTO CORRECTO"
else
    # Show raw result if format unexpected
    osascript <<EOF
display dialog "Resultado de analisis:

$RESULT" with title "Verificacion de Documento" buttons {"OK"} default button "OK" with icon note
EOF
    echo "$RESULT"
fi
