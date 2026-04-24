#!/usr/bin/env python3
"""
PDF Scaling Utility - Version 2
Uses PyPDF2 with page transformation approach
"""

import sys
import os
from datetime import datetime

try:
    from PyPDF2 import PdfReader, PdfWriter
except ImportError:
    print("Installing PyPDF2...")
    import subprocess
    subprocess.check_call(['pip3', 'install', 'PyPDF2'])
    from PyPDF2 import PdfReader, PdfWriter


def scale_pdf_v2(input_path, scale_percent, output_path=None):
    """
    Scale PDF by transforming pages

    Args:
        input_path: Path to input PDF
        scale_percent: Scale percentage (e.g., 103.2)
        output_path: Output path (optional)

    Returns:
        Path to scaled PDF
    """

    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input PDF not found: {input_path}")

    # Generate output path
    if output_path is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = f"/tmp/scaled_print_{timestamp}.pdf"

    scale_factor = scale_percent / 100.0

    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()

        for page in reader.pages:
            # Get original dimensions
            page_width = float(page.mediabox.width)
            page_height = float(page.mediabox.height)

            # Calculate new dimensions
            new_width = page_width * scale_factor
            new_height = page_height * scale_factor

            # Scale the page by updating mediabox
            page.mediabox.upper_right = (new_width, new_height)
            page.mediabox.lower_left = (0, 0)

            # Apply transformation matrix to scale content
            page.scale_by(scale_factor)

            writer.add_page(page)

        # Write output
        with open(output_path, 'wb') as output_file:
            writer.write(output_file)

        return output_path

    except Exception as e:
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except:
                pass
        raise Exception(f"Failed to scale PDF: {str(e)}")


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scale_pdf_v2.py <input_pdf> <scale_percent>", file=sys.stderr)
        sys.exit(1)

    input_pdf = sys.argv[1]

    try:
        scale_percent = float(sys.argv[2])
    except ValueError:
        print(f"ERROR: Invalid scale percentage: {sys.argv[2]}", file=sys.stderr)
        sys.exit(1)

    output_pdf = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        scaled_pdf_path = scale_pdf_v2(input_pdf, scale_percent, output_pdf)
        print(scaled_pdf_path)
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
