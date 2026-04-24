#!/usr/bin/env python3
"""
Generate Facebook CSV with ONLY recent images from Cloudinary (last 2 days)
"""

import os
import csv
import requests
import time
import re
from pathlib import Path
from datetime import datetime, timedelta

# Cloudinary credentials
CLOUD_NAME = "dg1owvdhw"
API_KEY = "174498474347792"
API_SECRET = "OSPubSQNqaAUwlzacVHU6obg-Nc"

# Output paths
OUTPUT_DIR = Path(__file__).parent / "fotos-recent"
CSV_OUTPUT = Path(__file__).parent / "csvs" / "items_recent.csv"

# Facebook listing settings
PRICE = "11"
CATEGORY = "Home & Garden"
CONDITION = "New"
BRAND = "AXKAN"
LOCATION = "Mexico City, Mexico"

# Description template (NO EMOJIS - ChromeDriver compatibility)
DESCRIPTION_TEMPLATE = """SOUVENIRS PERSONALIZADOS AXKAN - SOUVENIRS UNICOS

*** IMANES | LLAVEROS | DESTAPADORES | BOTONES ***

Diseno: {design_name}
100% PERSONALIZABLES con tu foto, nombre, fecha o diseno

PRECIOS INCREIBLES:
- $11 por pieza (minimo 100 pzas)
- $1,100 por 100 piezas
- Diseno personalizado INCLUIDO

PERFECTOS PARA:
- XV Anos y Quinceañeras
- Bodas y Despedidas
- Bautizos y Comuniones
- Baby Showers
- Cumpleanos
- Eventos Corporativos
- Graduaciones

ENVIO A TODO MEXICO
- Envio express disponible
- Empaque seguro garantizado

TIEMPO DE ENTREGA: 5-7 dias habiles

ESCRIBENOS AHORA:
WhatsApp: 55-3825-3251
www.vtanunciando.com

Fabricantes directos - Los mejores precios!

#souvenirs #recuerdos #personalizados #imanes #llaveros #mexico #axkan"""


def list_all_cloudinary_images():
    """Fetch ALL images from Cloudinary"""
    all_resources = []
    next_cursor = None

    while True:
        url = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/resources/image"
        params = {"max_results": 500}

        if next_cursor:
            params["next_cursor"] = next_cursor

        response = requests.get(url, auth=(API_KEY, API_SECRET), params=params)

        if response.status_code != 200:
            break

        data = response.json()
        resources = data.get("resources", [])
        all_resources.extend(resources)

        next_cursor = data.get("next_cursor")
        if not next_cursor:
            break

        time.sleep(0.3)

    return all_resources


def extract_design_name(public_id):
    """Extract design name from public_id like design_Cozumel_1767728110447_4"""
    name = public_id.split("/")[-1]  # Get filename part

    # Remove 'design_' prefix
    if name.startswith("design_"):
        name = name[7:]

    # Remove timestamp and index at the end (e.g., _1767728110447_4)
    name = re.sub(r'_\d{13}_\d+$', '', name)

    # Replace underscores with spaces
    name = name.replace("_", " ")

    # Handle "Product X" case
    if name.startswith("Product "):
        return "Diseño Personalizado"

    return name.strip() or "Diseño Personalizado"


def download_image(url, save_path):
    """Download image from URL"""
    try:
        response = requests.get(url, stream=True, timeout=30)
        if response.status_code == 200:
            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(1024):
                    f.write(chunk)
            return True
    except Exception as e:
        print(f"   ⚠️ Failed: {e}")
    return False


def main():
    print("🚀 Generate Facebook CSV for RECENT images only")
    print("=" * 55)

    # Calculate date range
    today = datetime.now()
    cutoff_date = today - timedelta(days=2)
    print(f"\n📅 Including images from: {cutoff_date.strftime('%Y-%m-%d')} onwards")

    # Fetch all images
    print("\n📦 Fetching images from Cloudinary...")
    all_resources = list_all_cloudinary_images()
    print(f"   Total images: {len(all_resources)}")

    # Filter design-gallery images from last 2 days
    recent_designs = []
    for r in all_resources:
        folder = r.get("asset_folder", "")

        # Only design-gallery (not payment-receipts)
        if folder != "design-gallery":
            continue

        # Check date
        created_at = r.get("created_at", "")
        if created_at:
            created_date = datetime.strptime(created_at[:10], "%Y-%m-%d")
            if created_date >= cutoff_date.replace(hour=0, minute=0, second=0, microsecond=0):
                recent_designs.append(r)

    print(f"   Recent design-gallery images: {len(recent_designs)}")

    if not recent_designs:
        print("\n❌ No new images found from the last 2 days!")
        return

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Process images
    rows = []

    for idx, resource in enumerate(recent_designs, 1):
        public_id = resource.get("public_id", "")
        secure_url = resource.get("secure_url", "")
        created_at = resource.get("created_at", "")[:10]
        fmt = resource.get("format", "png")

        if not secure_url:
            continue

        design_name = extract_design_name(public_id)

        # Filename
        filename = f"recent_{idx:03d}.{fmt}"
        local_path = OUTPUT_DIR / filename

        print(f"\n📍 [{idx}/{len(recent_designs)}] {design_name} ({created_at})")

        # Download
        if not local_path.exists():
            print(f"   ⬇️ Downloading...")
            download_image(secure_url, local_path)
        else:
            print(f"   ✓ Already exists")

        # Create CSV row
        description = DESCRIPTION_TEMPLATE.format(design_name=design_name)

        row = {
            "Title": f"Souvenir {design_name} #{idx} - AXKAN",
            "Photos Folder": str(OUTPUT_DIR.absolute()),
            "Photos Names": filename,
            "Price": PRICE,
            "Category": CATEGORY,
            "Condition": CONDITION,
            "Brand": BRAND,
            "Description": description,
            "Location": LOCATION,
            "Groups": ""
        }
        rows.append(row)

    # Write CSV
    print(f"\n📝 Writing CSV with {len(rows)} listings...")
    CSV_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = ["Title", "Photos Folder", "Photos Names", "Price", "Category", "Condition", "Brand", "Description", "Location", "Groups"]

    with open(CSV_OUTPUT, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n✅ Done!")
    print(f"   CSV: {CSV_OUTPUT}")
    print(f"   Total new listings: {len(rows)}")
    print(f"\n🎉 To upload to Facebook:")
    print(f"   cp {CSV_OUTPUT} csvs/items.csv")
    print(f"   python3 main.py")


if __name__ == "__main__":
    main()
