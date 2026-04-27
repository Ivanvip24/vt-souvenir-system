#!/usr/bin/env python3
"""
Smart Document Checker - Precise Spanish spelling verification
Only flags real errors, filters out OCR garbage and valid Spanish words
"""

import sys
import os
import PyPDF2
import pytesseract
from pdf2image import convert_from_path
from spellchecker import SpellChecker
import re
from collections import Counter


# Common valid Spanish words that pyspellchecker might miss
VALID_SPANISH_WORDS = {
    'cuerpos', 'salas', 'planes', 'traslados', 'previsores',
    'ataúdes', 'atavíos', 'funeraria', 'preparación', 'incineración',
    'velación', 'santa', 'lucia',
    'aneca',  # OCR artifact, ignore
}

# Words that need accents (lowercase)
ACCENT_REQUIRED = {
    'preparacion': 'preparación',
    'incineracion': 'incineración',
    'velacion': 'velación',
    'ataudes': 'ataúdes'
}


def extract_text_from_pdf(pdf_path):
    """Extract text with OCR"""
    try:
        # Try regular extraction first
        text = ""
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"

        # If little text, use OCR
        if len(text.strip()) < 50:
            print("Usando OCR para extraer texto...")
            images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=10)

            text = ""
            for i, image in enumerate(images):
                print(f"Procesando página {i+1}/{len(images)}...")
                page_text = pytesseract.image_to_string(image, config=r'--oem 3 --psm 6 -l spa')
                text += page_text + "\n"

        return text
    except Exception as e:
        print(f"Error extrayendo texto: {e}")
        return ""


def check_document(text):
    """Check for real spelling errors"""
    errors = []

    # Extract words
    words = re.findall(r'\b[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+\b', text)

    # Count word frequencies (real words appear multiple times)
    word_counts = Counter([w.lower() for w in words])

    # Only check words that appear 2+ times OR are 8+ characters (real design text)
    frequent_words = {w.lower(): w for w in words if word_counts[w.lower()] >= 2 or len(w) >= 8}

    spell_es = SpellChecker(language='es')

    for word_lower, word_original in frequent_words.items():
        # Skip if known valid
        if word_lower in VALID_SPANISH_WORDS:
            continue

        # Check for missing accents
        if word_lower in ACCENT_REQUIRED:
            errors.append({
                'word': word_original,
                'correct': ACCENT_REQUIRED[word_lower].upper() if word_original.isupper() else ACCENT_REQUIRED[word_lower],
                'type': 'accent',
                'severity': 'medium'
            })
            continue

        # Check spelling for longer words only (5+ chars)
        if len(word_lower) >= 5:
            if word_lower in spell_es.unknown([word_lower]):
                corrections = spell_es.candidates(word_lower)
                if corrections:
                    best_correction = list(corrections)[0]

                    # Only flag if edit distance is small (likely real error, not OCR garbage)
                    if len(word_lower) - len(best_correction) <= 2:
                        errors.append({
                            'word': word_original,
                            'correct': best_correction.upper() if word_original.isupper() else best_correction,
                            'type': 'spelling',
                            'severity': 'high'
                        })

    return errors


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
        print(message)


def main():
    if len(sys.argv) < 2:
        print("Uso: python smart_check.py <archivo.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"Error: Archivo no encontrado: {pdf_path}")
        sys.exit(1)

    print(f"🔍 Verificando: {os.path.basename(pdf_path)}\n")

    # Extract text
    text = extract_text_from_pdf(pdf_path)

    if not text.strip():
        show_dialog("Error: No se pudo extraer texto del PDF", False)
        sys.exit(1)

    # Check for errors
    print("Verificando ortografía...")
    errors = check_document(text)

    # Format message
    if not errors:
        message = "✓ FELICITACIONES, TU ARCHIVO ESTÁ CORRECTO\n\nNo se detectaron errores de ortografía."
        show_dialog(message, True)
        print("\n✅ DOCUMENTO CORRECTO\n")
        sys.exit(0)
    else:
        message = f"✗ ERROR - NO IMPRIMIR\n\nSe han detectado {len(errors)} errores:\n\n"

        for i, error in enumerate(errors[:10], 1):
            message += f"{i}. '{error['word']}' → '{error['correct']}'\n"

        if len(errors) > 10:
            message += f"\n... y {len(errors) - 10} errores más.\n"

        message += "\n¡CORREGIR INMEDIATAMENTE!"

        show_dialog(message, False)

        print(f"\n❌ ERRORES ENCONTRADOS ({len(errors)}):\n")
        for i, error in enumerate(errors, 1):
            severity_icon = "🔴" if error['severity'] == 'high' else "🟡"
            print(f"   {severity_icon} {i}. '{error['word']}' → '{error['correct']}'")

        print()
        sys.exit(1)


if __name__ == "__main__":
    main()
