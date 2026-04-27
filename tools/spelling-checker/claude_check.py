#!/usr/bin/env python3
"""
Claude Code Document Checker - AUTOMATED
Checks PDF for Spanish spelling errors using Claude Code's vision
"""

import sys
import os
import time
from pdf2image import convert_from_path
from PIL import Image


def compress_pdf_for_claude(pdf_path, max_size_mb=30):
    """Compress PDF to be readable by Claude Code"""

    file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)

    if file_size_mb <= max_size_mb:
        return pdf_path

    print(f"📦 Comprimiendo PDF ({file_size_mb:.1f}MB)...")

    # Convert to images at lower DPI and save as PDF
    images = convert_from_path(pdf_path, dpi=150, first_page=1, last_page=10)

    output_path = '/tmp/claude_compressed.pdf'

    if len(images) == 1:
        images[0].save(output_path, 'PDF', resolution=100.0)
    else:
        images[0].save(output_path, 'PDF', resolution=100.0, save_all=True, append_images=images[1:])

    compressed_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f"✓ Comprimido: {compressed_size:.1f}MB")

    return output_path


def show_dialog(message, is_success):
    """Show macOS dialog"""
    try:
        title = "Verificación de Documento"
        # Escape for AppleScript
        message_escaped = message.replace('"', '\\"').replace('\\', '\\\\').replace('\n', '\\n')

        script = f'''
        tell application "System Events"
            display dialog "{message_escaped}" with title "{title}" buttons {{"OK"}} default button "OK" with icon {"note" if is_success else "stop"}
        end tell
        '''

        os.system(f"osascript -e '{script}'")
    except Exception as e:
        print(f"\n{message}\n")


def main():
    if len(sys.argv) < 2:
        show_dialog("Error: No se proporcionó archivo PDF", False)
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        show_dialog(f"Error: Archivo no encontrado", False)
        sys.exit(1)

    if not pdf_path.lower().endswith('.pdf'):
        show_dialog("Error: Solo se soportan archivos PDF", False)
        sys.exit(1)

    print(f"🔍 Analizando: {os.path.basename(pdf_path)}")

    # Compress if needed
    try:
        compressed_path = compress_pdf_for_claude(pdf_path)
        compressed_size = os.path.getsize(compressed_path) / (1024 * 1024)

        if compressed_size > 32:
            show_dialog(f"Error: PDF muy grande ({compressed_size:.1f}MB)\\nMáximo: 32MB", False)
            sys.exit(1)

        # Show instruction for user
        print("\n" + "="*70)
        print("ARCHIVO LISTO PARA CLAUDE CODE")
        print("="*70)
        print(f"\nArchivo comprimido: {compressed_path}")
        print(f"Tamaño: {compressed_size:.1f}MB")
        print("\n📋 INSTRUCCIÓN PARA CLAUDE CODE:")
        print("-"*70)
        print(f"Analiza este PDF y encuentra errores ortográficos en español:")
        print(f"{compressed_path}")
        print("-"*70)

        # Show dialog to user
        message = f"✓ Archivo listo para análisis\\n\\nPor favor, envía este mensaje a Claude Code:\\n\\n'Analiza este PDF y encuentra errores ortográficos en español: {compressed_path}'"
        show_dialog(message, True)

    except Exception as e:
        show_dialog(f"Error al procesar PDF: {str(e)}", False)
        sys.exit(1)


if __name__ == "__main__":
    main()
