#!/usr/bin/env python3
"""
Crop Designs from Order Image

This script extracts individual design images from an order sheet image.
It detects the grid layout and crops each design cell.

Usage:
    python crop_designs.py <order_image_path>

Example:
    python crop_designs.py pending_orders/order_20231201.png
"""

import os
import sys
from pathlib import Path
from PIL import Image
import tkinter as tk
from tkinter import filedialog, messagebox


def detect_grid(img, num_cols=3, num_rows=2):
    """
    Detect grid boundaries in the image.
    Returns list of (x, y, width, height) for each cell.
    """
    width, height = img.size

    # Simple grid detection - divide image into equal cells
    cell_width = width // num_cols
    cell_height = height // num_rows

    cells = []
    for row in range(num_rows):
        for col in range(num_cols):
            x = col * cell_width
            y = row * cell_height
            cells.append({
                'x': x,
                'y': y,
                'width': cell_width,
                'height': cell_height,
                'row': row,
                'col': col,
                'index': row * num_cols + col
            })

    return cells


def crop_design_area(img, cell, padding_top=50, padding_bottom=30):
    """
    Crop just the design image from a cell, removing the Tipo/Requeridos text areas.

    Args:
        img: PIL Image
        cell: dict with x, y, width, height
        padding_top: pixels to skip from top (for "Tipo:" label)
        padding_bottom: pixels to skip from bottom (for "Requeridos:" label)
    """
    x = cell['x']
    y = cell['y'] + padding_top  # Skip "Tipo:" area
    width = cell['width']
    height = cell['height'] - padding_top - padding_bottom  # Skip "Requeridos:" area

    # Add small margin
    margin = 5
    x += margin
    y += margin
    width -= 2 * margin
    height -= 2 * margin

    return img.crop((x, y, x + width, y + height))


def interactive_crop(image_path):
    """
    Interactive cropping with preview.
    """
    img = Image.open(image_path)
    width, height = img.size

    print(f"\nImage size: {width}x{height}")
    print("\nDetecting grid layout...")

    # Try to detect number of rows/cols based on aspect ratio
    aspect = width / height

    if aspect > 1.3:
        # Wide image, likely 3 columns
        suggested_cols = 3
        suggested_rows = 2
    else:
        suggested_cols = 2
        suggested_rows = 3

    print(f"Suggested layout: {suggested_rows} rows x {suggested_cols} columns")

    # Ask user for confirmation
    try:
        user_input = input(f"\nEnter grid size (rows cols) or press Enter for {suggested_rows} {suggested_cols}: ").strip()
        if user_input:
            parts = user_input.split()
            suggested_rows = int(parts[0])
            suggested_cols = int(parts[1])
    except:
        pass

    print(f"\nUsing grid: {suggested_rows} rows x {suggested_cols} columns")
    print(f"Total cells: {suggested_rows * suggested_cols}")

    # Detect grid
    cells = detect_grid(img, suggested_cols, suggested_rows)

    # Create output directory
    output_dir = Path("cropped_designs")
    output_dir.mkdir(exist_ok=True)

    # Get base name from input file
    base_name = Path(image_path).stem

    print(f"\nCropping {len(cells)} designs...")

    cropped_paths = []
    for cell in cells:
        design_img = crop_design_area(img, cell)

        output_name = f"{base_name}_design_{cell['index'] + 1}.png"
        output_path = output_dir / output_name

        design_img.save(str(output_path), "PNG")
        cropped_paths.append(str(output_path))

        print(f"  Saved: {output_path}")

    print(f"\n✓ Cropped {len(cells)} designs to: {output_dir}/")

    return cropped_paths


def gui_crop():
    """
    GUI-based cropping tool.
    """
    root = tk.Tk()
    root.withdraw()

    # Ask for image file
    file_path = filedialog.askopenfilename(
        title="Select Order Image to Crop",
        filetypes=[
            ("Image files", "*.png *.jpg *.jpeg *.gif *.bmp *.webp"),
            ("All files", "*.*")
        ]
    )

    if not file_path:
        print("No file selected.")
        return None

    root.destroy()

    return interactive_crop(file_path)


def main():
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        if not os.path.exists(image_path):
            print(f"Error: File not found: {image_path}")
            sys.exit(1)
        interactive_crop(image_path)
    else:
        print("=" * 60)
        print("AXKAN - Design Cropper")
        print("=" * 60)
        print("\nThis tool extracts individual designs from order images.")
        print("\nUsage:")
        print("  python crop_designs.py <image_path>")
        print("  python crop_designs.py  (opens file browser)")
        print()

        gui_crop()


if __name__ == '__main__':
    main()
