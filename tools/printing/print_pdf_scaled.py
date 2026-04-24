#!/usr/bin/env python3
"""
PDF Printing with Scaling Control
This script handles PDF printing with precise scaling using Python
"""

import sys
import subprocess
import tempfile
import os
from pathlib import Path

def print_pdf_with_scaling(pdf_path, printer_name, copies=1, scale_percent=110):
    """
    Print PDF with specific scaling using multiple methods

    Args:
        pdf_path: Path to the PDF file
        printer_name: Name of the printer
        copies: Number of copies
        scale_percent: Scaling percentage (e.g., 110 for 110%)
    """

    # Method 1: Try using PyPDF2/PyPDF4 to resize PDF content
    try:
        return resize_and_print_pdf(pdf_path, printer_name, copies, scale_percent)
    except Exception as e:
        print(f"Method 1 failed: {e}")

    # Method 2: Try using reportlab to create scaled version
    try:
        return create_scaled_pdf_reportlab(pdf_path, printer_name, copies, scale_percent)
    except Exception as e:
        print(f"Method 2 failed: {e}")

    # Method 3: Try using Quartz (macOS native) for scaling
    try:
        return scale_with_quartz(pdf_path, printer_name, copies, scale_percent)
    except Exception as e:
        print(f"Method 3 failed: {e}")

    # Method 4: Fallback to basic lp command
    try:
        cmd = [
            "lp",
            "-d", printer_name,
            "-n", str(copies),
            "-o", "page-ranges=1",
            "-o", "InputSlot=Bypass",
            pdf_path
        ]
        subprocess.run(cmd, check=True)
        return True
    except Exception as e:
        print(f"All methods failed. Last error: {e}")
        return False

def resize_and_print_pdf(pdf_path, printer_name, copies, scale_percent):
    """Method 1: Use PyPDF2 to resize PDF content"""
    try:
        from PyPDF2 import PdfReader, PdfWriter
        from PyPDF2.generic import RectangleObject
    except ImportError:
        try:
            from PyPDF4 import PdfFileReader as PdfReader, PdfFileWriter as PdfWriter
            from PyPDF4.generic import RectangleObject
        except ImportError:
            raise ImportError("PyPDF2 or PyPDF4 not available")

    scale_factor = scale_percent / 100.0

    with open(pdf_path, 'rb') as input_file:
        reader = PdfReader(input_file)
        writer = PdfWriter()

        # Scale the first page
        page = reader.pages[0]

        # Get current page size
        current_box = page.mediabox
        width = float(current_box.width)
        height = float(current_box.height)

        # Calculate new size
        new_width = width * scale_factor
        new_height = height * scale_factor

        # Create new media box (centered)
        offset_x = (new_width - width) / 2
        offset_y = (new_height - height) / 2

        page.mediabox = RectangleObject([
            -offset_x, -offset_y,
            width + offset_x, height + offset_y
        ])

        # Scale the content
        page.scale(scale_factor, scale_factor)
        writer.add_page(page)

        # Write to temporary file
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
            writer.write(temp_file)
            temp_path = temp_file.name

    try:
        # Print the scaled PDF
        cmd = [
            "lp",
            "-d", printer_name,
            "-n", str(copies),
            "-o", "page-ranges=1",
            "-o", "InputSlot=Bypass",
            temp_path
        ]
        subprocess.run(cmd, check=True)
        return True
    finally:
        # Clean up
        os.unlink(temp_path)

def create_scaled_pdf_reportlab(pdf_path, printer_name, copies, scale_percent):
    """Method 2: Use reportlab to create scaled version"""
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfbase import pdfutils
        from reportlab.graphics import renderPDF
        from reportlab.graphics.shapes import Drawing
    except ImportError:
        raise ImportError("reportlab not available")

    # This method would require more complex implementation
    raise NotImplementedError("reportlab method not yet implemented")

def scale_with_quartz(pdf_path, printer_name, copies, scale_percent):
    """Method 3: Use macOS Quartz framework for native PDF scaling"""
    try:
        import Quartz
        from Foundation import NSURL
    except ImportError:
        raise ImportError("Quartz/Foundation not available")

    scale_factor = scale_percent / 100.0

    # Create PDF document
    pdf_url = NSURL.fileURLWithPath_(pdf_path)
    pdf_doc = Quartz.PDFDocument.alloc().initWithURL_(pdf_url)

    if not pdf_doc:
        raise ValueError("Could not open PDF")

    # Get the first page
    page = pdf_doc.pageAtIndex_(0)
    if not page:
        raise ValueError("Could not get first page")

    # Get page bounds
    page_rect = page.boundsForBox_(Quartz.kPDFDisplayBoxMediaBox)

    # Create new PDF context with scaled size
    new_width = page_rect.size.width * scale_factor
    new_height = page_rect.size.height * scale_factor

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
        temp_path = temp_file.name

    # Create PDF context
    pdf_context = Quartz.CGPDFContextCreateWithURL(
        NSURL.fileURLWithPath_(temp_path),
        Quartz.CGRectMake(0, 0, new_width, new_height),
        None
    )

    # Begin page
    Quartz.CGContextBeginPage(pdf_context, None)

    # Scale the context
    Quartz.CGContextScaleCTM(pdf_context, scale_factor, scale_factor)

    # Draw the page
    Quartz.CGContextDrawPDFPage(pdf_context, page.pageRef())

    # End page and close context
    Quartz.CGContextEndPage(pdf_context)
    Quartz.CGContextRelease(pdf_context)

    try:
        # Print the scaled PDF
        cmd = [
            "lp",
            "-d", printer_name,
            "-n", str(copies),
            "-o", "page-ranges=1",
            "-o", "InputSlot=Bypass",
            temp_path
        ]
        subprocess.run(cmd, check=True)
        return True
    finally:
        # Clean up
        os.unlink(temp_path)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 print_pdf_scaled.py <pdf_path> <printer_name> [copies] [scale_percent]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    printer_name = sys.argv[2]
    copies = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    scale_percent = float(sys.argv[4]) if len(sys.argv) > 4 else 110

    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        sys.exit(1)

    print(f"Printing {pdf_path} to {printer_name} with {scale_percent}% scaling...")

    success = print_pdf_with_scaling(pdf_path, printer_name, copies, scale_percent)

    if success:
        print("Print job sent successfully!")
    else:
        print("Failed to send print job!")
        sys.exit(1)

if __name__ == "__main__":
    main()