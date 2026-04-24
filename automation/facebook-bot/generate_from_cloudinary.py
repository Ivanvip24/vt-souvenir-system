#!/usr/bin/env python3
"""
Fetch AXKAN product images from Cloudinary and generate Facebook Marketplace CSV
"""

import os
import csv
import requests
import time
from pathlib import Path
from collections import defaultdict

# Cloudinary credentials
CLOUD_NAME = "dg1owvdhw"
API_KEY = "174498474347792"
API_SECRET = "OSPubSQNqaAUwlzacVHU6obg-Nc"

# Output paths
OUTPUT_DIR = Path(__file__).parent / "fotos-cloudinary"
CSV_OUTPUT = Path(__file__).parent / "csvs" / "items_cloudinary.csv"

# Facebook listing settings
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

🏭 Fabricantes directos - ¡Los mejores precios!

#souvenirs #recuerdos #personalizados #{location_tag} #imanes #llaveros #mexico #axkan"""


def list_all_cloudinary_images():
    """Fetch ALL images from Cloudinary (handling pagination)"""
    all_resources = []
    next_cursor = None

    while True:
        url = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/resources/image"
        params = {"max_results": 500}

        if next_cursor:
            params["next_cursor"] = next_cursor

        print(f"📥 Fetching images... (found {len(all_resources)} so far)")

        response = requests.get(url, auth=(API_KEY, API_SECRET), params=params)

        if response.status_code != 200:
            print(f"❌ Error: {response.status_code}")
            break

        data = response.json()
        resources = data.get("resources", [])
        all_resources.extend(resources)

        next_cursor = data.get("next_cursor")
        if not next_cursor:
            break

        time.sleep(0.3)

    return all_resources


def filter_axkan_products(resources):
    """Filter only axkan-products images"""
    return [r for r in resources if r.get("asset_folder", "").startswith("axkan-products/")]


def group_by_location(resources):
    """Group images by location folder"""
    locations = defaultdict(list)

    for r in resources:
        folder = r.get("asset_folder", "")
        # "axkan-products/Tampico" -> "Tampico"
        if "/" in folder:
            location = folder.split("/")[1]
            locations[location].append(r)

    return locations


def clean_location_name(folder_name):
    """Convert folder name to display name"""
    # "San-Luis-de-la-Paz" -> "San Luis de la Paz"
    return folder_name.replace("-", " ")


def make_tag(name):
    """Create hashtag from location name"""
    return name.lower().replace(" ", "").replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ñ", "n")


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
    print("🚀 Cloudinary AXKAN Products → Facebook Marketplace CSV")
    print("=" * 60)

    # Fetch all images
    print("\n📦 Fetching all images from Cloudinary...")
    all_resources = list_all_cloudinary_images()
    print(f"   Total images found: {len(all_resources)}")

    # Filter AXKAN products only
    axkan_resources = filter_axkan_products(all_resources)
    print(f"   AXKAN product images: {len(axkan_resources)}")

    if not axkan_resources:
        print("❌ No AXKAN product images found!")
        return

    # Group by location
    locations = group_by_location(axkan_resources)
    print(f"   Locations: {len(locations)}")

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Process each location
    rows = []
    total_downloaded = 0

    for location_folder, images in sorted(locations.items()):
        location_name = clean_location_name(location_folder)
        location_tag = make_tag(location_name)

        # Create location folder
        location_dir = OUTPUT_DIR / location_folder
        location_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n📍 {location_name} ({len(images)} images)")

        for idx, resource in enumerate(images, 1):
            public_id = resource.get("public_id", "")
            secure_url = resource.get("secure_url", "")
            fmt = resource.get("format", "png")

            if not secure_url:
                continue

            # Filename
            filename = f"{location_folder.lower()}_{idx:02d}.{fmt}"
            local_path = location_dir / filename

            # Download if not exists
            if not local_path.exists():
                print(f"   ⬇️ [{idx}/{len(images)}] Downloading...")
                if download_image(secure_url, local_path):
                    total_downloaded += 1
                time.sleep(0.1)
            else:
                print(f"   ✓ [{idx}/{len(images)}] Already exists")

            # Create CSV row
            description = DESCRIPTION_TEMPLATE.format(
                location_name=location_name,
                location_tag=location_tag
            )

            row = {
                "Title": f"Souvenir {location_name} #{idx} - AXKAN",
                "Photos Folder": str(location_dir.absolute()),
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
    print(f"   Total listings: {len(rows)}")
    print(f"   Images downloaded: {total_downloaded}")
    print(f"\n🎉 To use with Facebook bot:")
    print(f"   cp {CSV_OUTPUT} csvs/items.csv")
    print(f"   python3 main.py")


if __name__ == "__main__":
    main()
