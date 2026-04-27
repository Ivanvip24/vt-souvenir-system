#!/usr/bin/env python3
"""
Automated Document Checker - Uses Claude Code Vision Directly
Splits large PDFs and prepares them for Claude Code analysis
"""

import sys
import os
from pdf2image import convert_from_path
from PIL import Image
import PyPDF2


def split_pdf_for_claude(pdf_path, max_size_mb=30):
    """Split PDF into smaller files that Claude Code can read"""

    output_dir = "/tmp/claude_pdf_check"
    os.makedirs(output_dir, exist_ok=True)

    # Check PDF size
    file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)

    if file_size_mb <= max_size_mb:
        # Small enough, just copy it
        import shutil
        output_path = os.path.join(output_dir, "document.pdf")
        shutil.copy(pdf_path, output_path)
        return [output_path]

    # Convert to images and create smaller PDFs
    print(f"📄 PDF es grande ({file_size_mb:.1f}MB), convirtiendo a imágenes...")
    images = convert_from_path(pdf_path, dpi=200, first_page=1, last_page=10)

    # Save as individual smaller PDFs (2 pages each)
    output_files = []

    for i in range(0, len(images), 2):
        # Get 2 images at a time
        batch = images[i:min(i+2, len(images))]

        # Save as PDF
        output_path = os.path.join(output_dir, f"page_{i//2+1}.pdf")

        if len(batch) == 1:
            batch[0].save(output_path, 'PDF', resolution=100.0)
        else:
            batch[0].save(output_path, 'PDF', resolution=100.0, save_all=True, append_images=batch[1:])

        output_files.append(output_path)
        print(f"  ✓ Creado: {output_path}")

    return output_files


def main():
    if len(sys.argv) < 2:
        print("Uso: python auto_check.py <archivo.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"❌ Error: Archivo no encontrado")
        sys.exit(1)

    print(f"🔍 Preparando: {os.path.basename(pdf_path)}\n")

    # Split if needed
    pdf_files = split_pdf_for_claude(pdf_path)

    print(f"\n✅ Listo para análisis\n")
    print("=" * 70)
    print("INSTRUCCIONES PARA CLAUDE CODE:")
    print("=" * 70)
    print("\nCopia y pega este mensaje en Claude Code:\n")
    print("-" * 70)
    print("Analiza este diseño y encuentra ÚNICAMENTE errores ortográficos")
    print("REALES en español:")
    print("- Verifica acentuación (ej: 'Jimenez' debe ser 'Jiménez')")
    print("- Busca palabras mal escritas")
    print("- Lee TODO el texto visible (incluso cursiva/script)")
    print("- IGNORA números, teléfonos, códigos")
    print()
    print("Lista los errores así:")
    print("1. 'palabra_incorrecta' → 'palabra_correcta'")
    print()
    for pdf_file in pdf_files:
        print(f"Archivo: {pdf_file}")
    print("-" * 70)
    print("\n💡 Luego Claude Code te dirá los errores encontrados")
    print()


if __name__ == "__main__":
    main()
