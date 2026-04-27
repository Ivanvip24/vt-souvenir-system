#!/usr/bin/env python3
"""
Generate individual listings - ONE listing per image
For AXKAN Facebook Marketplace Bot
"""

import os
import csv

# Configuration
PHOTOS_DIR = "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan-brain-v2/automation/facebook-bot/fotos-axkan"
OUTPUT_CSV = "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan-brain-v2/automation/facebook-bot/csvs/items.csv"

# Description template
DESCRIPTION_TEMPLATE = """🎁 SOUVENIRS PERSONALIZADOS AXKAN - SOUVENIRS ÚNICOS 🎁

✨ IMANES | LLAVEROS | DESTAPADORES | BOTONES ✨

📍 Diseño: {city}
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

⭐ +500 clientes satisfechos
⭐ Calidad garantizada AXKAN
⭐ Atención personalizada

¡Personaliza cada recuerdo! 🌟"""

def extract_city_name(folder_name):
    """Extract city name from folder like 'Acapulco - Catálogo VT'"""
    city = folder_name.replace(" - Catálogo VT", "").strip()
    return city

def generate_listings():
    """Generate one listing per image"""
    listings = []

    # Get all product folders
    folders = sorted([f for f in os.listdir(PHOTOS_DIR) if os.path.isdir(os.path.join(PHOTOS_DIR, f))])

    print(f"Found {len(folders)} product folders")

    for folder in folders:
        folder_path = os.path.join(PHOTOS_DIR, folder)
        city = extract_city_name(folder)

        # Get all images in this folder
        images = sorted([f for f in os.listdir(folder_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))])

        for i, image in enumerate(images, 1):
            # Create unique title for each image
            title = f"Souvenir {city} #{i} - AXKAN"

            # Make sure title isn't too long (Facebook limit)
            if len(title) > 99:
                title = f"Souvenir {city[:50]} #{i}"

            listing = {
                'Title': title,
                'Photos Folder': folder_path,
                'Photos Names': image,  # Single image only
                'Price': '11',
                'Category': 'Home & Garden',
                'Condition': 'New',
                'Brand': 'AXKAN',
                'Description': DESCRIPTION_TEMPLATE.format(city=city),
                'Location': 'Ciudad de México, México',
                'Groups': ''
            }
            listings.append(listing)

    return listings

def write_csv(listings):
    """Write listings to CSV file"""
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['Title', 'Photos Folder', 'Photos Names', 'Price', 'Category', 'Condition', 'Brand', 'Description', 'Location', 'Groups']
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(listings)

def main():
    print("=" * 60)
    print("AXKAN - Individual Listings Generator")
    print("=" * 60)

    print("\nGenerating one listing per image...")
    listings = generate_listings()

    print(f"\nTotal listings to create: {len(listings)}")

    # Show sample
    print("\nSample listings:")
    for listing in listings[:5]:
        print(f"  - {listing['Title']}")
    print(f"  ... and {len(listings) - 5} more")

    # Write CSV
    write_csv(listings)
    print(f"\n✓ CSV saved to: {OUTPUT_CSV}")

    # Summary by city
    cities = {}
    for listing in listings:
        city = listing['Title'].split('#')[0].replace('Souvenir ', '').strip()
        cities[city] = cities.get(city, 0) + 1

    print(f"\nListings per city (top 10):")
    for city, count in sorted(cities.items(), key=lambda x: -x[1])[:10]:
        print(f"  {city}: {count} listings")

    print("\n" + "=" * 60)
    print(f"DONE! {len(listings)} individual listings ready")
    print("Run: python3 main_v2.py to start publishing")
    print("=" * 60)

if __name__ == "__main__":
    main()
