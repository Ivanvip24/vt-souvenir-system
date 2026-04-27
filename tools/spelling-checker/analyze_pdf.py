#!/usr/bin/env python3
"""
Fully Automated PDF Analyzer
Uses Claude Code's Read tool to analyze PDFs directly
"""

import sys
import os
import subprocess
from pdf2image import convert_from_path


def compress_pdf(pdf_path, max_size_mb=30):
    """Compress PDF if needed"""
    file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)

    if file_size_mb <= max_size_mb:
        return pdf_path

    print(f"Comprimiendo PDF ({file_size_mb:.1f}MB)...")

    # Convert to images and save as compressed PDF
    images = convert_from_path(pdf_path, dpi=150, first_page=1, last_page=10)
    output_path = '/tmp/claude_compressed.pdf'

    if len(images) == 1:
        images[0].save(output_path, 'PDF', resolution=100.0)
    else:
        images[0].save(output_path, 'PDF', resolution=100.0, save_all=True, append_images=images[1:])

    compressed_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f"✓ Comprimido a {compressed_size:.1f}MB")

    return output_path


def analyze_with_claude_code(pdf_path):
    """
    Trigger Claude Code analysis by creating a request file
    Claude Code monitors this file and processes it
    """

    # Create request file that Claude Code will monitor
    request_file = '/tmp/claude_code_request.txt'
    result_file = '/tmp/claude_code_result.txt'

    # Remove old results
    if os.path.exists(result_file):
        os.remove(result_file)

    # Write request
    with open(request_file, 'w') as f:
        f.write(f"ANALYZE_PDF:{pdf_path}\n")

    print("Esperando análisis de Claude Code...")

    # Wait for result (timeout after 60 seconds)
    import time
    timeout = 60
    start_time = time.time()

    while not os.path.exists(result_file):
        if time.time() - start_time > timeout:
            return {
                'error': True,
                'message': 'Timeout esperando respuesta de Claude Code'
            }
        time.sleep(0.5)

    # Read results
    with open(result_file, 'r') as f:
        result = f.read()

    return {
        'error': False,
        'result': result
    }


def show_dialog(message, is_success):
    """Show macOS dialog"""
    icon = "note" if is_success else "stop"

    # Escape message for AppleScript
    message = message.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

    script = f'''
tell application "System Events"
    display dialog "{message}" with title "Verificación de Documento" buttons {{"OK"}} default button "OK" with icon {icon}
end tell
'''

    subprocess.run(['osascript', '-e', script])


def main():
    if len(sys.argv) < 2:
        show_dialog("Error: No se proporcionó archivo", False)
        sys.exit(1)

    pdf_path = sys.argv[1]

    print(f"🔍 Analizando: {os.path.basename(pdf_path)}")

    # Compress if needed
    try:
        compressed_path = compress_pdf(pdf_path)
    except Exception as e:
        show_dialog(f"Error al comprimir PDF: {e}", False)
        sys.exit(1)

    # For now, show manual instruction
    # TODO: Integrate with Claude Code MCP or API

    message = f"PDF listo: {compressed_path}\\n\\nPara análisis automático, envía en Claude Code:\\n\\n'Analiza errores ortográficos en español: {compressed_path}'"

    show_dialog(message, True)

    print(f"\n✓ PDF comprimido en: {compressed_path}")
    print("Envía a Claude Code para análisis")


if __name__ == "__main__":
    main()
