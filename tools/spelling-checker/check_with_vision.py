#!/usr/bin/env python3
"""
Document Checker using Claude Code's Vision
Automatically analyzes PDF designs for spelling errors in Spanish
"""

import sys
import os
import base64
from pdf2image import convert_from_path
from io import BytesIO


def pdf_to_base64_images(pdf_path, max_pages=10):
    """Convert PDF pages to base64-encoded PNG images"""
    print("📄 Convirtiendo PDF a imágenes...")
    images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=max_pages)

    base64_images = []
    for i, image in enumerate(images):
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        base64_images.append(img_base64)
        print(f"  ✓ Página {i+1} convertida")

    return base64_images


def analyze_with_claude_api(pdf_path):
    """Use Claude API to analyze the PDF with vision"""

    # Check for API key
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return {
            'error': True,
            'message': 'ANTHROPIC_API_KEY no está configurada.\n\nPara usar este sistema:\n1. Obtén tu API key en: https://console.anthropic.com/\n2. Ejecuta: export ANTHROPIC_API_KEY="tu-key-aquí"'
        }

    try:
        import anthropic
    except ImportError:
        return {
            'error': True,
            'message': 'El módulo "anthropic" no está instalado.\n\nInstala con: pip3 install anthropic'
        }

    # Convert PDF to images
    try:
        images_base64 = pdf_to_base64_images(pdf_path)
    except Exception as e:
        return {
            'error': True,
            'message': f'Error al convertir PDF: {e}'
        }

    print("\n🤖 Analizando con Claude Vision...")

    # Prepare content for API
    content = []
    for img_base64 in images_base64:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": img_base64
            }
        })

    # Add instruction
    content.append({
        "type": "text",
        "text": """Analiza este diseño gráfico y encuentra ÚNICAMENTE errores ortográficos REALES en el texto visible en español.

IMPORTANTE:
- Extrae TODO el texto legible del diseño (incluso texto en cursiva/script)
- Verifica ortografía en ESPAÑOL
- Busca errores de acentuación (ej: "Jimenez" debe ser "Jiménez")
- Busca palabras mal escritas
- IGNORA números de teléfono, códigos, decoraciones
- Si el texto está en fuente cursiva/artística, haz tu mejor esfuerzo para leerlo

Responde en formato JSON:
{
  "texto_extraido": ["palabra1", "palabra2", "palabra3"],
  "errores": [
    {
      "palabra_incorrecta": "Jimenez",
      "palabra_correcta": "Jiménez",
      "tipo": "acentuación",
      "ubicacion": "texto principal inferior"
    }
  ],
  "total_errores": 1
}

Si NO hay errores, responde: {"texto_extraido": [...], "errores": [], "total_errores": 0}"""
    })

    # Call Claude API
    client = anthropic.Anthropic(api_key=api_key)

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": content
            }]
        )

        return {
            'error': False,
            'response': message.content[0].text
        }

    except Exception as e:
        return {
            'error': True,
            'message': f'Error al llamar a Claude API: {e}'
        }


def show_dialog(message, is_success):
    """Show macOS dialog"""
    try:
        title = "Verificación de Documento"
        message_escaped = message.replace('"', '\\"').replace('\\', '\\\\')

        script = f'''
        tell application "System Events"
            display dialog "{message_escaped}" with title "{title}" buttons {{"OK"}} default button "OK"
        end tell
        '''

        os.system(f"osascript -e '{script}'")
    except Exception as e:
        print(f"\n{message}\n")


def main():
    if len(sys.argv) < 2:
        print("Uso: python check_with_vision.py <archivo.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        show_dialog(f"Error: Archivo no encontrado\n{pdf_path}", False)
        sys.exit(1)

    if not pdf_path.lower().endswith('.pdf'):
        show_dialog("Error: Solo se soportan archivos PDF", False)
        sys.exit(1)

    print(f"🔍 Verificando: {os.path.basename(pdf_path)}\n")

    # Analyze with Claude
    result = analyze_with_claude_api(pdf_path)

    if result['error']:
        show_dialog(result['message'], False)
        print(f"\n❌ {result['message']}\n")
        sys.exit(1)

    # Parse response
    import json
    try:
        data = json.loads(result['response'])
        errors = data.get('errores', [])
        total_errors = data.get('total_errores', len(errors))
        texto_extraido = data.get('texto_extraido', [])

        print(f"✓ Texto extraído: {', '.join(texto_extraido[:10])}")
        if len(texto_extraido) > 10:
            print(f"  ... y {len(texto_extraido) - 10} palabras más")

        if total_errors == 0:
            message = "✓ FELICITACIONES, TU ARCHIVO ESTÁ CORRECTO\n\nNo se detectaron errores de ortografía."
            show_dialog(message, True)
            print("\n✅ DOCUMENTO CORRECTO\n")
            sys.exit(0)
        else:
            # Format error message
            message = f"✗ ERROR - NO IMPRIMIR\n\nSe han detectado {total_errors} errores:\n\n"

            for i, error in enumerate(errors[:10], 1):
                incorrecta = error.get('palabra_incorrecta', '')
                correcta = error.get('palabra_correcta', '')
                message += f"{i}. '{incorrecta}' → '{correcta}'\n"

            if total_errors > 10:
                message += f"\n... y {total_errors - 10} errores más.\n"

            message += "\n¡CORREGIR INMEDIATAMENTE!"

            show_dialog(message, False)

            print(f"\n❌ ERRORES ENCONTRADOS ({total_errors}):\n")
            for i, error in enumerate(errors, 1):
                incorrecta = error.get('palabra_incorrecta', '')
                correcta = error.get('palabra_correcta', '')
                tipo = error.get('tipo', 'ortografía')
                ubicacion = error.get('ubicacion', '')

                icon = "🔴" if tipo == "ortografía" else "🟡"
                loc_text = f" ({ubicacion})" if ubicacion else ""
                print(f"   {icon} {i}. '{incorrecta}' → '{correcta}'{loc_text}")

            print()
            sys.exit(1)

    except json.JSONDecodeError as e:
        error_msg = f"Error parseando respuesta de Claude:\n{result['response'][:200]}"
        show_dialog(error_msg, False)
        print(f"\n❌ {error_msg}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
