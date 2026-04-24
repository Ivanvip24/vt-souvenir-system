#!/usr/bin/env python3
"""
Process Order Image - Generate PDF from Claude Code analysis

This script is used by Claude Code to generate PDFs after analyzing order images.

Usage:
    # Called by Claude Code with extracted data
    python process_order_image.py --data '<json_string>'

    # Or with a JSON file
    python process_order_image.py --file order_data.json

JSON format:
{
    "order_name": "Puerto Arista - Tortugas",
    "instructions": "50 pzas de cada diseno",
    "designs": [
        {"type": "Imanes", "quantity": 50, "image_path": "path/to/image.png"},
        {"type": "Llaveros", "quantity": 50, "image_path": "path/to/image2.png"},
        ...
    ]
}
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from generate_axkan import AxkanPDFGenerator, open_file


def process_order(data):
    """
    Process order data and generate PDF

    Args:
        data: dict with order_name, instructions, and designs list

    Returns:
        Path to generated PDF
    """
    generator = AxkanPDFGenerator()

    order_name = data.get('order_name', 'Untitled Order')
    instructions = data.get('instructions', '')
    designs = data.get('designs', [])

    num_designs = len(designs)

    if num_designs == 0:
        raise ValueError("No designs provided in order data")

    # Prepare slot data
    slot_data = {
        'image_paths': {},
        'types': {},
        'quantities': {}
    }

    for i, design in enumerate(designs):
        if 'type' in design:
            slot_data['types'][i] = design['type']
        if 'quantity' in design:
            slot_data['quantities'][i] = design['quantity']
        if 'image_path' in design and design['image_path']:
            if Path(design['image_path']).exists():
                slot_data['image_paths'][i] = design['image_path']

    # Generate PDF
    output_path = generator.generate_pdf(order_name, instructions, num_designs, slot_data)

    return output_path


def main():
    parser = argparse.ArgumentParser(description='Process order image and generate PDF')
    parser.add_argument('--data', type=str, help='JSON string with order data')
    parser.add_argument('--file', type=str, help='Path to JSON file with order data')
    parser.add_argument('--open', action='store_true', help='Open PDF after generation')

    args = parser.parse_args()

    if not args.data and not args.file:
        print("Error: Please provide order data via --data or --file")
        print("\nExample:")
        print('  python process_order_image.py --data \'{"order_name": "Test", "designs": [{"type": "Imanes", "quantity": 50}]}\'')
        sys.exit(1)

    try:
        if args.file:
            with open(args.file, 'r') as f:
                data = json.load(f)
        else:
            data = json.loads(args.data)

        print("=" * 60)
        print("AXKAN - Processing Order")
        print("=" * 60)
        print(f"\nOrder: {data.get('order_name', 'Untitled')}")
        print(f"Instructions: {data.get('instructions', 'None')}")
        print(f"Designs: {len(data.get('designs', []))}")
        print()

        output_path = process_order(data)

        print("=" * 60)
        print("[SUCCESS] PDF Generated!")
        print("=" * 60)
        print(f"\nFile: {output_path}")

        if args.open:
            print("\nOpening PDF...")
            open_file(output_path)

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON data - {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
