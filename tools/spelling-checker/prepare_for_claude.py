#!/usr/bin/env python3
"""
Prepare PDF for Claude Code Analysis
Converts PDF to images that you can then send to Claude Code
"""

import sys
import os
from pdf2image import convert_from_path
from pathlib import Path


def prepare_pdf_for_analysis(pdf_path, output_dir=None):
    """Convert PDF to images for Claude Code analysis"""

    if not os.path.exists(pdf_path):
        print(f"❌ Error: Archivo no encontrado: {pdf_path}")
        return None

    # Create output directory
    if output_dir is None:
        pdf_name = Path(pdf_path).stem
        output_dir = f"/tmp/claude_check_{pdf_name}"

    os.makedirs(output_dir, exist_ok=True)

    print(f"🔍 Procesando: {os.path.basename(pdf_path)}")
    print(f"📁 Guardando imágenes en: {output_dir}\n")

    # Convert PDF to images
    print("📄 Convirtiendo PDF a imágenes...")
    images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=10)

    image_paths = []
    for i, image in enumerate(images, 1):
        img_path = os.path.join(output_dir, f"page_{i}.png")
        image.save(img_path, 'PNG')
        image_paths.append(img_path)
        print(f"  ✓ Página {i} → {img_path}")

    print(f"\n✅ {len(image_paths)} imagen(es) lista(s) para análisis\n")

    # Create instruction file
    instruction_file = os.path.join(output_dir, "INSTRUCCIONES.txt")
    with open(instruction_file, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("CÓMO ANALIZAR ESTE DOCUMENTO CON CLAUDE CODE\n")
        f.write("=" * 70 + "\n\n")
        f.write(f"Archivo original: {pdf_path}\n")
        f.write(f"Imágenes generadas: {len(image_paths)}\n\n")
        f.write("PASOS:\n")
        f.write("------\n")
        f.write("1. Abre Claude Code (este chat)\n\n")
        f.write("2. Envía este mensaje exacto:\n\n")
        f.write("   \"Analiza este diseño y encuentra ÚNICAMENTE errores ortográficos\n")
        f.write("   REALES en el texto visible en español:\n")
        f.write("   - Verifica acentuación (ej: 'Jimenez' debe ser 'Jiménez')\n")
        f.write("   - Busca palabras mal escritas\n")
        f.write("   - Lee TODO el texto (incluso cursiva/script)\n")
        f.write("   - IGNORA números, códigos, decoraciones\n\n")
        f.write("   Lista los errores en formato:\n")
        f.write("   1. 'palabra_incorrecta' → 'palabra_correcta'\"\n\n")
        f.write("3. Arrastra y suelta estas imágenes en el chat:\n\n")
        for img_path in image_paths:
            f.write(f"   📎 {img_path}\n")
        f.write("\n")
        f.write("4. Claude Code analizará las imágenes y te dirá los errores\n\n")
        f.write("=" * 70 + "\n")

    print("=" * 70)
    print("PRÓXIMOS PASOS:")
    print("=" * 70)
    print("\n1. En Claude Code, envía este mensaje:\n")
    print('   "Analiza este diseño y encuentra errores ortográficos en español"')
    print("\n2. Arrastra estas imágenes al chat:\n")
    for img_path in image_paths:
        print(f"   📎 {img_path}")
    print("\n3. Claude Code te dirá los errores encontrados")
    print("\n" + "=" * 70)
    print(f"\n💡 Instrucciones guardadas en: {instruction_file}\n")

    return image_paths


def main():
    if len(sys.argv) < 2:
        print("Uso: python prepare_for_claude.py <archivo.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    prepare_pdf_for_analysis(pdf_path)


if __name__ == "__main__":
    main()
