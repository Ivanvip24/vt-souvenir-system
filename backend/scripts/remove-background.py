#!/usr/bin/env python3
"""
Background Removal Script
Removes background from product images and replaces with white.
Uses rembg (open-source AI model) for background removal.
"""

import os
import sys
import io
import time
from pathlib import Path

# Check dependencies
try:
    from rembg import remove
    from PIL import Image
except ImportError:
    print("Installing required packages...")
    os.system("pip3 install rembg pillow")
    from rembg import remove
    from PIL import Image


def remove_background_white(input_path, output_path):
    """
    Remove background from image and replace with white.

    Args:
        input_path: Path to input image
        output_path: Path to save processed image

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Read input image
        with open(input_path, 'rb') as f:
            input_data = f.read()

        # Remove background using rembg AI
        output_data = remove(input_data)

        # Open the result (PNG with transparency)
        img = Image.open(io.BytesIO(output_data)).convert("RGBA")

        # Create white background
        white_bg = Image.new("RGBA", img.size, (255, 255, 255, 255))

        # Paste image onto white background using alpha channel as mask
        white_bg.paste(img, mask=img.split()[3])

        # Convert to RGB (no alpha) and save as JPEG
        final_img = white_bg.convert("RGB")
        final_img.save(output_path, "JPEG", quality=95)

        return True
    except Exception as e:
        print(f"  Error: {e}")
        return False


def process_batch(input_folder, output_folder, limit=None):
    """
    Process a batch of images from a folder.

    Args:
        input_folder: Folder containing input images
        output_folder: Folder to save processed images
        limit: Maximum number of images to process (None for all)
    """
    input_path = Path(input_folder)
    output_path = Path(output_folder)

    # Create output folder if it doesn't exist
    output_path.mkdir(parents=True, exist_ok=True)

    # Get all image files
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    images = [f for f in input_path.rglob('*') if f.suffix.lower() in image_extensions]

    if limit:
        images = images[:limit]

    total = len(images)
    print(f"\n{'='*60}")
    print(f"Background Removal - Processing {total} images")
    print(f"{'='*60}")
    print(f"Input:  {input_folder}")
    print(f"Output: {output_folder}")
    print(f"{'='*60}\n")

    successful = 0
    failed = 0
    start_time = time.time()

    for i, img_path in enumerate(images, 1):
        # Create relative output path
        rel_path = img_path.relative_to(input_path)
        out_file = output_path / rel_path.with_suffix('.jpg')
        out_file.parent.mkdir(parents=True, exist_ok=True)

        print(f"[{i}/{total}] Processing: {rel_path}")

        img_start = time.time()
        success = remove_background_white(str(img_path), str(out_file))
        img_time = time.time() - img_start

        if success:
            successful += 1
            print(f"         Done in {img_time:.1f}s")
        else:
            failed += 1
            print(f"         FAILED")

    # Summary
    total_time = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"BATCH COMPLETE")
    print(f"{'='*60}")
    print(f"  Total images:  {total}")
    print(f"  Successful:    {successful}")
    print(f"  Failed:        {failed}")
    print(f"  Time elapsed:  {total_time:.1f} seconds")
    print(f"  Avg per image: {total_time/total:.1f} seconds")
    print(f"{'='*60}")
    print(f"\nProcessed images saved to: {output_folder}")

    return successful, failed


def process_single(input_path, output_path=None):
    """Process a single image."""
    if output_path is None:
        # Default output: same name with _white suffix
        p = Path(input_path)
        output_path = str(p.parent / f"{p.stem}_white{p.suffix}")

    print(f"Processing: {input_path}")
    start = time.time()
    success = remove_background_white(input_path, output_path)
    elapsed = time.time() - start

    if success:
        print(f"Done in {elapsed:.1f}s")
        print(f"Saved to: {output_path}")
    else:
        print("Failed!")

    return success


if __name__ == "__main__":
    # Default paths
    DEFAULT_INPUT = "/Users/ivanvalenciaperez/Downloads/CLAUDE/BETA_PHASE/facebook-marketplace-bot/fotos-axkan"
    DEFAULT_OUTPUT = "/Users/ivanvalenciaperez/Downloads/CLAUDE/BETA_PHASE/facebook-marketplace-bot/fotos-axkan-white-bg"

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python remove-background.py test              # Test with 10 images")
        print("  python remove-background.py all               # Process all images")
        print("  python remove-background.py single <path>     # Process single image")
        print("  python remove-background.py batch <in> <out> [limit]")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "test":
        # Test with 10 images
        process_batch(DEFAULT_INPUT, DEFAULT_OUTPUT, limit=10)

    elif command == "all":
        # Process all images
        process_batch(DEFAULT_INPUT, DEFAULT_OUTPUT)

    elif command == "single" and len(sys.argv) >= 3:
        # Process single image
        input_file = sys.argv[2]
        output_file = sys.argv[3] if len(sys.argv) >= 4 else None
        process_single(input_file, output_file)

    elif command == "batch" and len(sys.argv) >= 4:
        # Custom batch processing
        in_folder = sys.argv[2]
        out_folder = sys.argv[3]
        limit = int(sys.argv[4]) if len(sys.argv) >= 5 else None
        process_batch(in_folder, out_folder, limit)

    else:
        print("Invalid command. Run without arguments for usage.")
        sys.exit(1)
