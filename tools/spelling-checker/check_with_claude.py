#!/usr/bin/env python3
"""
Smart Document Checker using Claude API for accurate text extraction
Eliminates OCR artifacts and focuses on real design text
"""

import sys
import os
import base64
from pathlib import Path
from pdf2image import convert_from_path
import anthropic


def pdf_to_base64_images(pdf_path, max_pages=10):
    """Convert PDF pages to base64-encoded images"""
    images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=max_pages)

    base64_images = []
    for i, image in enumerate(images):
        # Save to temporary buffer
        from io import BytesIO
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)

        # Encode to base64
        img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        base64_images.append(img_base64)

    return base64_images


def check_document_with_claude(pdf_path, api_key=None):
    """Use Claude API to analyze document and find real spelling errors"""

    # Get API key from environment if not provided
    if not api_key:
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not api_key:
            print("❌ Error: ANTHROPIC_API_KEY no está configurada")
            print("Configura tu API key:")
            print("  export ANTHROPIC_API_KEY='tu-api-key-aquí'")
            return None

    print("📄 Convirtiendo PDF a imágenes...")
    images_base64 = pdf_to_base64_images(pdf_path)

    print(f"🤖 Analizando {len(images_base64)} página(s) con Claude...")

    # Create message content with all images
    content = []
    for i, img_base64 in enumerate(images_base64):
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": img_base64
            }
        })

    # Add the instruction text
    content.append({
        "type": "text",
        "text": """Analiza esta imagen de diseño gráfico y encuentra ÚNICAMENTE errores ortográficos reales en el texto principal visible.

IMPORTANTE:
- Solo extrae el TEXTO REAL que aparece en el diseño (títulos, nombres, información de contacto, etc.)
- IGNORA números de teléfono, decoraciones, elementos gráficos
- IGNORA texto ilegible o borroso
- Busca errores de ortografía en ESPAÑOL
- Busca palabras mal escritas (como "FUNENRARIA" en vez de "FUNERARIA")
- Busca errores de acentuación (como "PREPARACION" sin tilde)

Responde en formato JSON:
{
  "texto_encontrado": ["palabra1", "palabra2", ...],
  "errores": [
    {
      "palabra_incorrecta": "FUNENRARIA",
      "palabra_correcta": "FUNERARIA",
      "tipo": "ortografía",
      "gravedad": "alta"
    }
  ],
  "total_errores": 1
}

Si no hay errores, devuelve: {"texto_encontrado": [...], "errores": [], "total_errores": 0}"""
    })

    # Call Claude API
    client = anthropic.Anthropic(api_key=api_key)

    try:
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": content
            }]
        )

        return message.content[0].text

    except Exception as e:
        print(f"❌ Error al llamar a Claude API: {e}")
        return None


def show_dialog(message, is_success):
    """Show notification dialog (macOS compatible)"""
    try:
        icon = "✓" if is_success else "✗"
        title = "Verificación de Documento"

        # Escape special characters for AppleScript
        message_escaped = message.replace('"', '\\"').replace('\\', '\\\\')

        script = f'''
        tell application "System Events"
            display dialog "{message_escaped}" with title "{title}" buttons {{"OK"}} default button "OK"
        end tell
        '''

        os.system(f"osascript -e '{script}'")
    except Exception as e:
        print(f"Could not show dialog: {e}")
        print(message)


def main():
    if len(sys.argv) < 2:
        print("Uso: python check_with_claude.py <archivo.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"❌ Error: Archivo no encontrado: {pdf_path}")
        sys.exit(1)

    print(f"🔍 Verificando: {os.path.basename(pdf_path)}")

    # Check document with Claude
    result = check_document_with_claude(pdf_path)

    if not result:
        show_dialog("Error: No se pudo analizar el documento", False)
        sys.exit(1)

    # Parse JSON result
    import json
    try:
        data = json.loads(result)
        errors = data.get('errores', [])
        total_errors = data.get('total_errores', len(errors))

        if total_errors == 0:
            message = "✓ FELICITACIONES, TU ARCHIVO ESTÁ CORRECTO\n\nNo se detectaron errores de ortografía."
            show_dialog(message, True)
            print("\n✅ DOCUMENTO CORRECTO")
            sys.exit(0)
        else:
            # Format error message
            message = f"✗ ERROR - NO IMPRIMIR\n\nSe han detectado {total_errors} errores:\n\n"
            for i, error in enumerate(errors[:10], 1):
                palabra_incorrecta = error.get('palabra_incorrecta', '')
                palabra_correcta = error.get('palabra_correcta', '')
                message += f"{i}. '{palabra_incorrecta}' → '{palabra_correcta}'\n"

            if total_errors > 10:
                message += f"\n... y {total_errors - 10} errores más.\n"

            message += "\n¡CORREGIR INMEDIATAMENTE!"

            show_dialog(message, False)
            print(f"\n❌ ERRORES ENCONTRADOS: {total_errors}")
            for error in errors:
                print(f"   • {error.get('palabra_incorrecta')} → {error.get('palabra_correcta')}")
            sys.exit(1)

    except json.JSONDecodeError:
        print("❌ Error parseando respuesta de Claude")
        print(f"Respuesta: {result}")
        sys.exit(1)


if __name__ == "__main__":
    main()
