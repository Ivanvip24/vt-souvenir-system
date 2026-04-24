#!/usr/bin/env python3
"""
PDF Scaling Utility for Print Correction
Pre-scales PDF content to compensate for printer scaling issues
Usage: python3 scale_pdf.py <input_pdf> <scale_percent>
Output: Prints path to temporary scaled PDF file
"""

import sys
import os
from datetime import datetime

try:
    import pikepdf
except ImportError:
    print("ERROR: pikepdf not installed. Install with: pip3 install pikepdf", file=sys.stderr)
    sys.exit(1)


def scale_pdf(input_path, scale_percent, output_path=None):
    """
    Scale PDF content by specified percentage

    Args:
        input_path (str): Path to input PDF
        scale_percent (float): Scale percentage (e.g., 100.2 for 100.2%)
        output_path (str, optional): Output path. If None, creates temp file

    Returns:
        str: Path to scaled PDF file
    """

    # Validate input file
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input PDF not found: {input_path}")

    # Calculate scale factor (convert percentage to decimal)
    scale_factor = scale_percent / 100.0

    # Generate output path if not provided
    if output_path is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = f"/tmp/scaled_print_{timestamp}.pdf"

    try:
        # Open the PDF
        with pikepdf.open(input_path) as pdf:
            # Process each page
            for page in pdf.pages:
                # Get current media box (page dimensions)
                if '/MediaBox' in page:
                    media_box = page.MediaBox

                    # Scale media box dimensions
                    # MediaBox format: [x1, y1, x2, y2]
                    new_media_box = [
                        float(media_box[0]),
                        float(media_box[1]),
                        float(media_box[2]) * scale_factor,
                        float(media_box[3]) * scale_factor
                    ]
                    page.MediaBox = new_media_box

                # Scale CropBox if it exists
                if '/CropBox' in page:
                    crop_box = page.CropBox
                    new_crop_box = [
                        float(crop_box[0]),
                        float(crop_box[1]),
                        float(crop_box[2]) * scale_factor,
                        float(crop_box[3]) * scale_factor
                    ]
                    page.CropBox = new_crop_box

                # Add transformation matrix to scale content
                # Create a transformation matrix for scaling
                scale_matrix = f"{scale_factor} 0 0 {scale_factor} 0 0 cm"

                # Wrap existing content with scaling transformation
                if '/Contents' in page:
                    # Get existing content stream
                    content_stream = page.Contents.read_bytes()

                    # Create new content with scaling applied
                    new_content = (
                        b"q\n" +  # Save graphics state
                        scale_matrix.encode() + b"\n" +  # Apply scaling
                        content_stream +  # Original content
                        b"\nQ"  # Restore graphics state
                    )

                    # Replace content stream
                    page.Contents = pdf.make_stream(new_content)

            # Save the scaled PDF
            pdf.save(output_path)

        return output_path

    except Exception as e:
        # Clean up output file if it was created
        if output_path and os.path.exists(output_path):
            try:
                os.remove(output_path)
            except:
                pass
        raise Exception(f"Failed to scale PDF: {str(e)}")


def main():
    """Main entry point for command-line usage"""

    if len(sys.argv) < 3:
        print("Usage: python3 scale_pdf.py <input_pdf> <scale_percent>", file=sys.stderr)
        print("Example: python3 scale_pdf.py input.pdf 100.2", file=sys.stderr)
        sys.exit(1)

    input_pdf = sys.argv[1]

    try:
        scale_percent = float(sys.argv[2])
    except ValueError:
        print(f"ERROR: Invalid scale percentage: {sys.argv[2]}", file=sys.stderr)
        sys.exit(1)

    # Optional output path
    output_pdf = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        scaled_pdf_path = scale_pdf(input_pdf, scale_percent, output_pdf)
        print(scaled_pdf_path)  # Output path for AppleScript to capture
        sys.exit(0)

    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
