#!/usr/bin/env python3
"""
Fetch products from Shopify and generate Facebook Marketplace CSV
Downloads images from Shopify CDN and creates local folder structure
"""

import os
import csv
import json
import requests
import time
from urllib.parse import urlparse
from pathlib import Path

# Configuration
SHOPIFY_URL = "https://vtanunciando.com/collections/all/products.json"
OUTPUT_DIR = Path(__file__).parent / "fotos-shopify"
CSV_OUTPUT = Path(__file__).parent / "csvs" / "items_shopify.csv"
PRICE = "11"
CATEGORY = "Home & Garden"
CONDITION = "New"
BRAND = "AXKAN"
LOCATION = "Mexico City, Mexico"

# Description template
DESCRIPTION_TEMPLATE = """🎁 SOUVENIRS PERSONALIZADOS AXKAN - SOUVENIRS ÚNICOS 🎁

✨ IMANES | LLAVEROS | DESTAPADORES | BOTONES ✨

📍 Diseño: {location_name}
🎨 100% PERSONALIZABLES con tu foto, nombre, fecha o diseño

💰 PRECIOS INCREÍBLES:
• $11 por pieza (mínimo 100 pzas)
• $1,100 por 100 piezas
• Diseño personalizado INCLUIDO

🎉 PERFECTOS PARA:
✓ XV Años y Quinceañeras
✓ Bodas y Despedidas
✓ Bautizos y Comuniones
✓ Baby Showers
✓ Cumpleaños
✓ Eventos Corporativos
✓ Graduaciones

📦 ENVÍO A TODO MÉXICO
• Envío express disponible
• Empaque seguro garantizado

⏰ TIEMPO DE ENTREGA: 5-7 días hábiles

💬 ESCRÍBENOS AHORA:
📱 WhatsApp: 55-3825-3251
🌐 www.vtanunciando.com
📧 contacto@vtanunciando.com

🏭 Fabricantes directos - ¡Los mejores precios!

#souvenirs #recuerdos #personalizados #{location_tag} #imanes #llaveros #mexico #axkan"""


def fetch_all_products():
    """Fetch all products from Shopify, handling pagination"""
    all_products = []
    page = 1

    while True:
        url = f"{SHOPIFY_URL}?page={page}&limit=250"
        print(f"📥 Fetching page {page}...")

        response = requests.get(url)
        if response.status_code != 200:
            print(f"❌ Error fetching page {page}: {response.status_code}")
            break

        data = response.json()
        products = data.get("products", [])

        if not products:
            break

        all_products.extend(products)
        print(f"   Found {len(products)} products (total: {len(all_products)})")

        page += 1
        time.sleep(0.5)  # Be nice to the API

    return all_products


def filter_catalog_products(products):
    """Filter only catalog products (locations)"""
    catalog_products = []

    for product in products:
        title = product.get("title", "")
        # Only get "Catálogo VT" products (these are location catalogs)
        if "Catálogo VT" in title:
            catalog_products.append(product)

    return catalog_products


def get_location_name(title):
    """Extract location name from product title"""
    # "Acapulco - Catálogo VT" -> "Acapulco"
    return title.replace(" - Catálogo VT", "").strip()


def download_image(image_url, save_path):
    """Download an image from URL to local path"""
    try:
        response = requests.get(image_url, stream=True, timeout=30)
        if response.status_code == 200:
            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(1024):
                    f.write(chunk)
            return True
    except Exception as e:
        print(f"   ⚠️ Failed to download {image_url}: {e}")
    return False


def sanitize_filename(name):
    """Make filename safe for filesystem"""
    # Remove or replace problematic characters
    unsafe_chars = '<>:"/\\|?*'
    for char in unsafe_chars:
        name = name.replace(char, '_')
    return name


def process_products(products, download_images=True):
    """Process products and generate CSV data"""
    rows = []

    for product in products:
        title = product.get("title", "")
        location_name = get_location_name(title)
        location_tag = location_name.lower().replace(" ", "").replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")

        images = product.get("images", [])
        if not images:
            print(f"   ⚠️ No images for {location_name}")
            continue

        # Create folder for this location
        safe_location = sanitize_filename(location_name)
        location_folder = OUTPUT_DIR / safe_location

        if download_images:
            location_folder.mkdir(parents=True, exist_ok=True)

        print(f"📍 Processing {location_name} ({len(images)} images)")

        # Process each image
        for idx, image in enumerate(images, 1):
            image_url = image.get("src", "")
            if not image_url:
                continue

            # Generate filename
            image_filename = f"{safe_location.lower().replace(' ', '-')}_{idx:02d}.png"
            image_path = location_folder / image_filename

            # Download image if requested
            if download_images:
                if not image_path.exists():
                    print(f"   ⬇️ Downloading image {idx}/{len(images)}")
                    download_image(image_url, image_path)
                    time.sleep(0.2)  # Be nice
                else:
                    print(f"   ✓ Image {idx} already exists")

            # Generate CSV row
            description = DESCRIPTION_TEMPLATE.format(
                location_name=location_name,
                location_tag=location_tag
            )

            row = {
                "Title": f"Souvenir {location_name} #{idx} - AXKAN",
                "Photos Folder": str(location_folder.absolute()),
                "Photos Names": image_filename,
                "Price": PRICE,
                "Category": CATEGORY,
                "Condition": CONDITION,
                "Brand": BRAND,
                "Description": description,
                "Location": LOCATION,
                "Groups": ""
            }
            rows.append(row)

    return rows


def write_csv(rows, output_path):
    """Write rows to CSV file"""
    fieldnames = ["Title", "Photos Folder", "Photos Names", "Price", "Category", "Condition", "Brand", "Description", "Location", "Groups"]

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n✅ CSV written to: {output_path}")
    print(f"   Total rows: {len(rows)}")


def main():
    print("🚀 Shopify to Facebook Marketplace CSV Generator")
    print("=" * 50)

    # Fetch products
    print("\n📦 Fetching products from Shopify...")
    all_products = fetch_all_products()
    print(f"   Total products found: {len(all_products)}")

    # Filter catalog products
    catalog_products = filter_catalog_products(all_products)
    print(f"   Catalog products: {len(catalog_products)}")

    if not catalog_products:
        print("❌ No catalog products found!")
        return

    # Process and download
    print("\n🖼️ Processing products and downloading images...")
    rows = process_products(catalog_products, download_images=True)

    # Write CSV
    print("\n📝 Writing CSV...")
    CSV_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    write_csv(rows, CSV_OUTPUT)

    print("\n🎉 Done! You can now use the CSV with the Facebook bot:")
    print(f"   python3 main.py  (after updating csv path)")


if __name__ == "__main__":
    main()
