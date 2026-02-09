#!/usr/bin/env python3
"""
Image Upscaling Script
Upscales images using AI (Real-ESRGAN via super-image library)
"""

import os
import sys
import time
from pathlib import Path

try:
    from PIL import Image
    from super_image import EdsrModel, ImageLoader
except ImportError:
    print("Installing required packages...")
    os.system("pip3 install super-image pillow")
    from PIL import Image
    from super_image import EdsrModel, ImageLoader

# Load model once (2x upscale)
print("Loading AI upscaling model...")
model = EdsrModel.from_pretrained('eugenesiow/edsr-base', scale=2)
print("Model loaded!")


def upscale_image(input_path, output_path, scale=2):
    """
    Upscale a single image using AI.

    Args:
        input_path: Path to input image
        output_path: Path to save upscaled image
        scale: Upscale factor (2x by default)

    Returns:
        bool: True if successful
    """
    try:
        # Load image
        image = Image.open(input_path)

        # Prepare for model
        inputs = ImageLoader.load_image(image)

        # Upscale
        preds = model(inputs)

        # Save result
        ImageLoader.save_image(preds, output_path)

        return True
    except Exception as e:
        print(f"  Error: {e}")
        return False


def process_batch(input_folder, output_folder, limit=None):
    """
    Process a batch of images from a folder.
    """
    input_path = Path(input_folder)
    output_path = Path(output_folder)

    output_path.mkdir(parents=True, exist_ok=True)

    # Get all image files
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    images = [f for f in input_path.rglob('*') if f.suffix.lower() in image_extensions]

    if limit:
        images = images[:limit]

    total = len(images)
    print(f"\n{'='*60}")
    print(f"AI Upscaling - Processing {total} images (2x)")
    print(f"{'='*60}")
    print(f"Input:  {input_folder}")
    print(f"Output: {output_folder}")
    print(f"{'='*60}\n")

    successful = 0
    failed = 0
    start_time = time.time()

    for i, img_path in enumerate(images, 1):
        rel_path = img_path.relative_to(input_path)
        out_file = output_path / rel_path.with_suffix('.png')
        out_file.parent.mkdir(parents=True, exist_ok=True)

        print(f"[{i}/{total}] Upscaling: {rel_path}")

        img_start = time.time()
        success = upscale_image(str(img_path), str(out_file))
        img_time = time.time() - img_start

        if success:
            successful += 1
            print(f"         Done in {img_time:.1f}s")
        else:
            failed += 1
            print(f"         FAILED")

    total_time = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"UPSCALING COMPLETE")
    print(f"{'='*60}")
    print(f"  Total images:  {total}")
    print(f"  Successful:    {successful}")
    print(f"  Failed:        {failed}")
    print(f"  Time elapsed:  {total_time:.1f} seconds")
    print(f"  Avg per image: {total_time/total:.1f} seconds")
    print(f"{'='*60}")
    print(f"\nUpscaled images saved to: {output_folder}")

    return successful, failed


if __name__ == "__main__":
    # Default paths - upscale the white-bg images
    DEFAULT_INPUT = "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/facebook-marketplace-bot/fotos-axkan-white-bg"
    DEFAULT_OUTPUT = "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/facebook-marketplace-bot/fotos-axkan-upscaled"

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python upscale-images.py test              # Test with 5 images")
        print("  python upscale-images.py all               # Process all images")
        print("  python upscale-images.py single <path>     # Process single image")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "test":
        process_batch(DEFAULT_INPUT, DEFAULT_OUTPUT, limit=5)

    elif command == "all":
        process_batch(DEFAULT_INPUT, DEFAULT_OUTPUT)

    elif command == "single" and len(sys.argv) >= 3:
        input_file = sys.argv[2]
        output_file = sys.argv[3] if len(sys.argv) >= 4 else input_file.replace('.', '_upscaled.')
        print(f"Upscaling: {input_file}")
        start = time.time()
        success = upscale_image(input_file, output_file)
        if success:
            print(f"Done in {time.time()-start:.1f}s -> {output_file}")

    else:
        print("Invalid command.")
        sys.exit(1)
