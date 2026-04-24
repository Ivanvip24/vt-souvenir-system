#!/usr/bin/env python3
"""Check PDF page dimensions"""

import sys
import pikepdf

if len(sys.argv) < 2:
    print("Usage: python3 check_pdf_size.py <pdf_file>")
    sys.exit(1)

pdf_path = sys.argv[1]

with pikepdf.open(pdf_path) as pdf:
    page = pdf.pages[0]
    media_box = page.MediaBox

    # Get dimensions in points (72 points = 1 inch = 2.54 cm)
    width_pts = float(media_box[2]) - float(media_box[0])
    height_pts = float(media_box[3]) - float(media_box[1])

    # Convert to cm
    width_cm = width_pts / 72 * 2.54
    height_cm = height_pts / 72 * 2.54

    print(f"File: {pdf_path}")
    print(f"Dimensions: {width_pts:.2f} x {height_pts:.2f} pts")
    print(f"Dimensions: {width_cm:.2f} x {height_cm:.2f} cm")
