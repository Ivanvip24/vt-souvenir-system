#!/usr/bin/env python3
"""
AXKAN Catalog Image Downloader
Downloads all product images from vtanunciando.com Shopify store
"""

import os
import re
import json
import requests
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
CATALOG_URL = "https://vtanunciando.com/collections/catalogo/products.json"
OUTPUT_DIR = "/Users/ivanvalenciaperez/Downloads/CLAUDE/facebook-marketplace-bot/fotos-axkan"
MAX_WORKERS = 5  # Parallel downloads
PRODUCTS_PER_PAGE = 50  # Shopify's max per page

def sanitize_filename(name):
    """Remove invalid characters from filename"""
    # Remove special characters, keep alphanumeric, spaces, and hyphens
    clean = re.sub(r'[^\w\s\-]', '', name)
    # Replace multiple spaces with single space
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def download_image(url, filepath):
    """Download a single image"""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        with open(filepath, 'wb') as f:
            f.write(response.content)
        return True, filepath
    except Exception as e:
        return False, f"Error downloading {url}: {e}"

def get_all_products():
    """Fetch all products from Shopify JSON API (handles pagination)"""
    all_products = []
    page = 1

    while True:
        url = f"{CATALOG_URL}?limit={PRODUCTS_PER_PAGE}&page={page}"
        print(f"Fetching page {page}...")

        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()

        products = data.get('products', [])
        if not products:
            break

        all_products.extend(products)
        print(f"  Found {len(products)} products (total: {len(all_products)})")
        page += 1

        # Safety limit (213 products / 50 per page = 5 pages max)
        if page > 10:
            break

    return all_products

def download_product_images(product, output_dir):
    """Download all images for a single product"""
    title = product.get('title', 'Unknown')
    handle = product.get('handle', 'unknown')
    images = product.get('images', [])

    if not images:
        return [], f"No images for: {title}"

    # Create folder for this product
    folder_name = sanitize_filename(title)
    product_dir = os.path.join(output_dir, folder_name)
    os.makedirs(product_dir, exist_ok=True)

    downloaded = []

    for i, img in enumerate(images, 1):
        img_url = img.get('src', '')
        if not img_url:
            continue

        # Get file extension from URL
        parsed = urlparse(img_url)
        path = parsed.path
        ext = os.path.splitext(path)[1] or '.jpg'

        # Clean extension (remove query params if any)
        ext = ext.split('?')[0]

        filename = f"{handle}_{i:02d}{ext}"
        filepath = os.path.join(product_dir, filename)

        # Skip if already exists
        if os.path.exists(filepath):
            downloaded.append(filename)
            continue

        success, result = download_image(img_url, filepath)
        if success:
            downloaded.append(filename)
        else:
            print(f"  Warning: {result}")

    return downloaded, folder_name

def generate_csv_entry(product, folder_path, filenames):
    """Generate a CSV line for the Facebook Marketplace bot"""
    title = product.get('title', 'Unknown').replace(' - Catálogo VT', '')

    return {
        'title': f"Souvenirs Personalizados {title} (50 piezas)",
        'photos_folder': folder_path,
        'photos_names': '; '.join(filenames[:10]),  # Max 10 photos
        'price': '850',
        'category': 'Home & Garden',
        'condition': 'New',
        'brand': 'AXKAN',
        'description': f"Imanes, llaveros, destapadores y botones personalizados de {title}. Ideales para recuerdos de XV años, bodas, bautizos, baby showers. Diseño personalizado incluido. Envío a todo México.",
        'location': 'Ciudad de México, México',
        'groups': ''
    }

def main():
    print("=" * 60)
    print("AXKAN Catalog Image Downloader")
    print("=" * 60)

    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Fetch all products
    print("\nFetching products from Shopify...")
    products = get_all_products()
    print(f"Found {len(products)} products")

    # Count total images
    total_images = sum(len(p.get('images', [])) for p in products)
    print(f"Total images to download: {total_images}")

    # Download images for each product
    print("\nDownloading images...")
    csv_entries = []

    for i, product in enumerate(products, 1):
        title = product.get('title', 'Unknown')
        images = product.get('images', [])
        print(f"\n[{i}/{len(products)}] {title} ({len(images)} images)")

        downloaded, folder_name = download_product_images(product, OUTPUT_DIR)

        if downloaded:
            folder_path = os.path.join(OUTPUT_DIR, folder_name)
            csv_entry = generate_csv_entry(product, folder_path, downloaded)
            csv_entries.append(csv_entry)
            print(f"  ✓ Downloaded {len(downloaded)} images to: {folder_name}/")

    # Generate CSV file for Facebook Marketplace bot
    csv_path = "/Users/ivanvalenciaperez/Downloads/CLAUDE/facebook-marketplace-bot/csvs/items.csv"

    print(f"\nGenerating CSV file with {len(csv_entries)} products...")

    with open(csv_path, 'w', encoding='utf-8') as f:
        # Header
        f.write('"Title","Photos Folder","Photos Names","Price","Category","Condition","Brand","Description","Location","Groups"\n')

        # Data rows
        for entry in csv_entries:
            line = '"{title}","{photos_folder}","{photos_names}","{price}","{category}","{condition}","{brand}","{description}","{location}","{groups}"\n'.format(**entry)
            f.write(line)

    print(f"✓ CSV saved to: {csv_path}")

    # Summary
    print("\n" + "=" * 60)
    print("DOWNLOAD COMPLETE")
    print("=" * 60)
    print(f"Products processed: {len(products)}")
    print(f"Images downloaded to: {OUTPUT_DIR}")
    print(f"CSV generated: {csv_path}")
    print("\nNext step: Run the Facebook Marketplace bot")
    print("  cd /Users/ivanvalenciaperez/Downloads/CLAUDE/facebook-marketplace-bot")
    print("  python3 main.py")

if __name__ == "__main__":
    main()
