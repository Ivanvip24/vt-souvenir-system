#!/usr/bin/env python3
"""
Facebook Marketplace Upload Runner

This script:
1. Fetches pending designs from the API
2. Downloads images locally
3. Generates CSV for the bot
4. Runs the bot
5. Marks listings as uploaded

Usage:
    python3 run_upload.py
"""

import os
import sys
import json
import csv
import requests
from pathlib import Path

# Configuration
API_BASE = "https://vt-souvenir-backend.onrender.com/api"
PHOTOS_FOLDER = Path(__file__).parent / "fotos-pending"
CSV_PATH = Path(__file__).parent / "csvs" / "items.csv"

# Default listing settings
DEFAULT_PRICE = "11"
DEFAULT_CATEGORY = "Home & Garden"
DEFAULT_CONDITION = "New"
DEFAULT_BRAND = "AXKAN"
DEFAULT_LOCATION = "Mexico City, Mexico"
DEFAULT_DESCRIPTION = """🎁 SOUVENIRS PERSONALIZADOS AXKAN - SOUVENIRS ÚNICOS 🎁

✨ Imanes de MDF de alta calidad
✨ Diseños personalizados
✨ Perfectos para recuerdos, eventos y regalos

📦 Pedido mínimo: 50 piezas
💰 Precio por pieza desde $11 MXN

📱 Contáctanos para tu pedido personalizado
🌐 axkan-pedidos.vercel.app

#souvenirs #imanes #personalizados #recuerdos #eventos #bodas #xvaños #bautizos"""


def fetch_pending_uploads():
    """Fetch pending uploads from the API"""
    print("📡 Fetching pending uploads from API...")

    try:
        response = requests.get(f"{API_BASE}/facebook/export")
        data = response.json()

        if not data.get('success'):
            print(f"❌ API error: {data.get('error', 'Unknown error')}")
            return []

        listings = data.get('listings', [])
        print(f"✅ Found {len(listings)} pending uploads")
        return listings

    except Exception as e:
        print(f"❌ Failed to fetch from API: {e}")
        return []


def download_images(listings):
    """Download images from URLs to local folder"""
    print(f"\n📥 Downloading {len(listings)} images...")

    # Create folder if it doesn't exist
    PHOTOS_FOLDER.mkdir(parents=True, exist_ok=True)

    downloaded = []
    for listing in listings:
        try:
            image_url = listing['imageUrl']
            filename = os.path.basename(image_url.split('?')[0])  # Remove query params
            local_path = PHOTOS_FOLDER / filename

            # Skip if already exists
            if local_path.exists():
                print(f"   ⏭️  Already exists: {filename}")
                downloaded.append((listing, filename))
                continue

            # Download
            response = requests.get(image_url, stream=True)
            response.raise_for_status()

            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            print(f"   ✅ Downloaded: {filename}")
            downloaded.append((listing, filename))

        except Exception as e:
            print(f"   ❌ Failed to download {listing.get('title', 'unknown')}: {e}")

    return downloaded


def generate_csv(downloaded_listings):
    """Generate CSV file for the bot"""
    print(f"\n📝 Generating CSV for {len(downloaded_listings)} listings...")

    # Create csvs folder if it doesn't exist
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

    with open(CSV_PATH, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_ALL)

        # Header
        writer.writerow([
            "Title", "Photos Folder", "Photos Names", "Price",
            "Category", "Condition", "Brand", "Description", "Location", "Groups"
        ])

        # Rows
        for listing, filename in downloaded_listings:
            writer.writerow([
                listing['title'],
                str(PHOTOS_FOLDER.absolute()),
                filename,
                listing.get('price', DEFAULT_PRICE),
                DEFAULT_CATEGORY,
                DEFAULT_CONDITION,
                DEFAULT_BRAND,
                DEFAULT_DESCRIPTION,
                DEFAULT_LOCATION,
                ""  # No groups
            ])

    print(f"✅ CSV generated: {CSV_PATH}")
    return [l[0] for l in downloaded_listings]  # Return listing objects


def run_bot():
    """Run the Facebook Marketplace bot"""
    print("\n🤖 Starting Facebook Marketplace bot...")
    print("   (Make sure you're logged into Facebook in Chrome)")
    print("-" * 50)

    try:
        # Import and run the bot
        bot_path = Path(__file__).parent
        sys.path.insert(0, str(bot_path))

        import main
        # The bot will run when imported if it has a main block
        # Or we can call its main function if it has one

        print("-" * 50)
        print("✅ Bot finished running")
        return True

    except Exception as e:
        print(f"❌ Bot error: {e}")
        return False


def mark_as_uploaded(listings):
    """Mark listings as uploaded in the API"""
    if not listings:
        return

    print(f"\n📤 Marking {len(listings)} listings as uploaded...")

    try:
        listing_ids = [l['id'] for l in listings]
        response = requests.post(
            f"{API_BASE}/facebook/mark-uploaded",
            json={"listingIds": listing_ids},
            headers={"Content-Type": "application/json"}
        )

        data = response.json()
        if data.get('success'):
            print(f"✅ Marked {data.get('marked', 0)} listings as uploaded")
        else:
            print(f"❌ Failed to mark as uploaded: {data.get('error')}")

    except Exception as e:
        print(f"❌ Error marking as uploaded: {e}")


def main_flow():
    """Main upload flow"""
    print("=" * 50)
    print("🚀 Facebook Marketplace Upload Runner")
    print("=" * 50)

    # 1. Fetch pending uploads
    listings = fetch_pending_uploads()
    if not listings:
        print("\n✅ No pending uploads. All done!")
        return

    # 2. Download images
    downloaded = download_images(listings)
    if not downloaded:
        print("\n❌ No images downloaded. Aborting.")
        return

    # 3. Generate CSV
    processed_listings = generate_csv(downloaded)

    # 4. Ask user to run bot
    print("\n" + "=" * 50)
    print("📋 CSV is ready at:", CSV_PATH)
    print("=" * 50)

    run_now = input("\n🤖 Run the bot now? (y/n): ").strip().lower()

    if run_now == 'y':
        success = run_bot()

        if success:
            # 5. Mark as uploaded
            mark_uploaded = input("\n✅ Mark all listings as uploaded? (y/n): ").strip().lower()
            if mark_uploaded == 'y':
                mark_as_uploaded(processed_listings)
    else:
        print("\n📝 You can run the bot manually with:")
        print(f"   cd {Path(__file__).parent}")
        print("   python3 main.py")
        print("\nAfter successful upload, mark them as uploaded with:")
        print(f"   curl -X POST {API_BASE}/facebook/mark-uploaded \\")
        print(f"        -H 'Content-Type: application/json' \\")
        print(f"        -d '{{\"listingIds\": {[l['id'] for l in processed_listings]}}}'")

    print("\n🎉 Done!")


if __name__ == "__main__":
    main_flow()
