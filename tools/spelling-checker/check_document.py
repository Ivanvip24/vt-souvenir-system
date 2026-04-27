#!/usr/bin/env python3
"""
Document Checker - Automated spelling and grammar verification for PDFs
Supports both English and Spanish with clear success/error notifications
"""

import sys
import os
from pathlib import Path
import PyPDF2
from spellchecker import SpellChecker
import language_tool_python
import json
from datetime import datetime
import pytesseract
from pdf2image import convert_from_path
from PIL import Image


class DocumentChecker:
    """Main document checking class"""

    def __init__(self, enable_grammar=True):
        # Initialize Spanish spell checker only
        self.spell_es = SpellChecker(language='es')

        # Grammar checker (will be loaded on demand)
        self.grammar_es = None
        self.enable_grammar = enable_grammar
        self.grammar_available = self._check_java_available()

    def _check_java_available(self):
        """Check if Java is available for grammar checking"""
        import subprocess
        try:
            result = subprocess.run(['java', '-version'], capture_output=True, timeout=5)
            return result.returncode == 0
        except:
            return False

    def extract_text_from_pdf(self, pdf_path):
        """Extract text content from PDF file using both text extraction and OCR"""
        try:
            text = ""

            # First, try standard text extraction
            print("Attempting standard text extraction...")
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                    except Exception as e:
                        print(f"Warning: Could not extract text from page {page_num + 1}: {e}")

            # If very little text was extracted (likely image-based PDF), use OCR
            if len(text.strip()) < 50:
                print(f"Only {len(text.strip())} characters extracted. Using OCR...")
                text = self.extract_text_with_ocr(pdf_path)
            else:
                print(f"Extracted {len(text)} characters from PDF")

            return text
        except Exception as e:
            raise Exception(f"Error extracting PDF text: {e}")

    def extract_text_with_ocr(self, pdf_path):
        """Extract text from image-based PDF using OCR"""
        try:
            # Configure OCR for both English and Spanish
            custom_config = r'--oem 3 --psm 6 -l eng+spa'

            print("Converting PDF to images...")
            # Convert PDF to images (limit to first 10 pages for large PDFs)
            images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=10)

            text = ""
            for i, image in enumerate(images):
                print(f"Processing page {i+1}/{len(images)} with OCR...")
                # Perform OCR on each page
                page_text = pytesseract.image_to_string(image, config=custom_config)
                text += page_text + "\n"

            print(f"OCR extracted {len(text)} characters from {len(images)} pages")
            return text

        except Exception as e:
            print(f"OCR extraction failed: {e}")
            return ""


    def check_spelling(self, text):
        """Check spelling errors in Spanish - filter OCR garbage"""
        import re
        errors = []

        # Clean and tokenize words more carefully
        # Keep only alphabetic words of reasonable length
        words = re.findall(r'\b[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+\b', text)

        # Filter out obvious OCR garbage
        # Only keep words that appear multiple times OR are long (6+ chars)
        from collections import Counter
        word_counts = Counter([w.lower() for w in words])

        # Keep words that appear 2+ times OR are 6+ characters
        filtered_words = [w for w in words if word_counts[w.lower()] >= 2 or len(w) >= 6]

        # Create a mapping of lowercase to original case words
        word_map = {w.lower(): w for w in filtered_words}

        # Check Spanish spelling (case-insensitive)
        misspelled_es = self.spell_es.unknown([w.lower() for w in filtered_words])
        for word_lower in misspelled_es:
            word_original = word_map.get(word_lower, word_lower)
            # Only check words 5+ characters (ignores most OCR garbage)
            if word_lower and len(word_lower) >= 5 and word_lower.isalpha():
                corrections = self.spell_es.candidates(word_lower)
                if corrections:
                    # Only add if correction is similar (edit distance < 3)
                    if corrections and len(list(corrections)) > 0:
                        errors.append({
                            'word': word_original,
                            'type': 'spelling',
                            'language': 'Spanish',
                            'suggestions': list(corrections)[:3]
                        })

        return errors

    def check_grammar(self, text):
        """Check grammar errors in Spanish"""
        errors = []

        # Skip grammar check if Java is not available
        if not self.enable_grammar or not self.grammar_available:
            return errors

        try:
            if not self.grammar_es:
                self.grammar_es = language_tool_python.LanguageTool('es')
            matches = self.grammar_es.check(text)

            for match in matches:
                errors.append({
                    'message': match.message,
                    'context': match.context,
                    'type': 'grammar',
                    'language': 'Spanish',
                    'suggestions': match.replacements[:3] if match.replacements else []
                })
        except Exception as e:
            print(f"Grammar check warning: {e}")

        return errors

    def check_document(self, file_path):
        """Main document checking function"""
        results = {
            'file': os.path.basename(file_path),
            'path': file_path,
            'timestamp': datetime.now().isoformat(),
            'status': 'success',
            'errors': [],
            'warnings': []
        }

        try:
            # Extract text from PDF
            print("Extracting text from PDF...")
            text = self.extract_text_from_pdf(file_path)

            if not text.strip():
                results['status'] = 'error'
                results['errors'].append({
                    'type': 'extraction',
                    'message': 'No se pudo extraer texto del PDF. El archivo puede estar vacío o ser una imagen.'
                })
                return results

            # Check Spanish spelling
            print("Verificando ortografía en español...")
            spelling_errors = self.check_spelling(text)

            # Check Spanish grammar
            print("Verificando gramática...")
            grammar_errors = self.check_grammar(text)

            # Combine all errors
            all_errors = spelling_errors + grammar_errors

            if all_errors:
                results['status'] = 'error'
                results['errors'] = all_errors[:20]  # Limit to first 20 errors
                results['total_errors'] = len(all_errors)
            else:
                results['status'] = 'success'

        except Exception as e:
            results['status'] = 'error'
            results['errors'].append({
                'type': 'system',
                'message': f'Error del sistema: {str(e)}'
            })

        return results

    def cleanup(self):
        """Cleanup resources"""
        if self.grammar_es:
            self.grammar_es.close()


def format_error_message(results):
    """Format errors for display in dialog"""
    if results['status'] == 'success':
        return "✓ FELICITACIONES, TU ARCHIVO ESTÁ CORRECTO\n\nNo se detectaron errores de ortografía o gramática."

    error_count = results.get('total_errors', len(results['errors']))
    message = f"✗ ERROR - NO IMPRIMIR\n\nSe han detectado {error_count} errores:\n\n"

    displayed_errors = results['errors'][:10]  # Show first 10 errors

    for i, error in enumerate(displayed_errors, 1):
        if error['type'] == 'spelling':
            word = error['word']
            suggestions = ', '.join(error['suggestions']) if error['suggestions'] else 'sin sugerencias'
            message += f"{i}. Ortografía: '{word}' → {suggestions}\n"
        elif error['type'] == 'grammar':
            msg = error['message'][:60]  # Truncate long messages
            message += f"{i}. Gramática: {msg}\n"
        else:
            message += f"{i}. {error.get('message', 'Error desconocido')}\n"

    if error_count > 10:
        message += f"\n... y {error_count - 10} errores más.\n"

    message += "\n¡CORREGIR INMEDIATAMENTE!"
    return message


def show_dialog(message, is_success):
    """Show notification dialog (macOS compatible)"""
    try:
        # Use osascript for macOS notifications
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
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python check_document.py <file.pdf>")
        print("Or use with keyboard shortcut automation")
        sys.exit(1)

    file_path = sys.argv[1]

    if not os.path.exists(file_path):
        show_dialog(f"Error: Archivo no encontrado\n{file_path}", False)
        sys.exit(1)

    if not file_path.lower().endswith('.pdf'):
        show_dialog("Error: Solo se soportan archivos PDF", False)
        sys.exit(1)

    # Run the check
    print(f"Checking document: {file_path}")
    checker = DocumentChecker()

    try:
        results = checker.check_document(file_path)

        # Show dialog
        message = format_error_message(results)
        is_success = results['status'] == 'success'
        show_dialog(message, is_success)

        sys.exit(0 if is_success else 1)

    finally:
        checker.cleanup()


if __name__ == "__main__":
    main()
