"""
Debug version of main.py - tries multiple selectors to detect login
"""
from helpers.scraper import Scraper
from helpers.csv_helper import get_data_from_csv
from helpers.listing_helper import update_listings
import time

print("=" * 50)
print("FACEBOOK MARKETPLACE BOT - DEBUG MODE")
print("=" * 50)

# Try multiple possible selectors for logged-in state
LOGIN_SELECTORS = [
    'svg[aria-label="Your profile"]',
    'svg[aria-label="Tu perfil"]',  # Spanish version
    '[aria-label="Your profile"]',
    '[aria-label="Tu perfil"]',
    'div[aria-label="Account"]',
    'div[aria-label="Cuenta"]',
    '[data-pagelet="ProfileTile"]',
    'image[href*="profile"]',
]

print("\n1. Starting Chrome and navigating to Facebook...")
scraper = Scraper('https://facebook.com')

print("\n2. Trying to detect login status...")
print("   If you see the login page, please log in manually.")
print("   Waiting up to 5 minutes for login...\n")

# Check if already logged in with any of the selectors
logged_in = False
for selector in LOGIN_SELECTORS:
    print(f"   Trying selector: {selector[:40]}...")
    element = scraper.find_element(selector, exit_on_missing_element=False, wait_element_time=3)
    if element:
        print(f"   ✓ Found! Using: {selector}")
        logged_in = True
        break

if not logged_in:
    print("\n   Not logged in yet. Please log in manually in the browser...")
    print("   Waiting for login (checking every 5 seconds)...\n")

    # Wait for manual login
    start_time = time.time()
    timeout = 300  # 5 minutes

    while time.time() - start_time < timeout:
        for selector in LOGIN_SELECTORS:
            element = scraper.find_element(selector, exit_on_missing_element=False, wait_element_time=2)
            if element:
                print(f"\n   ✓ Login detected with selector: {selector}")
                logged_in = True
                break

        if logged_in:
            break

        elapsed = int(time.time() - start_time)
        print(f"   Still waiting... ({elapsed}s elapsed)")
        time.sleep(5)

if not logged_in:
    print("\n   ✗ Login timeout. Please try again.")
    exit(1)

# Save cookies manually
print("\n3. Saving cookies...")
import os
import pickle

cookies_folder = 'cookies/'
if not os.path.exists(cookies_folder):
    os.makedirs(cookies_folder)

cookies_file = open(cookies_folder + 'facebook.pkl', 'wb')
cookies = scraper.driver.get_cookies()
pickle.dump(cookies, cookies_file)
cookies_file.close()
print("   ✓ Cookies saved!")

print("\n4. Navigating to Marketplace...")
scraper.go_to_page('https://facebook.com/marketplace/you/selling')
time.sleep(3)

print("\n5. Loading products from CSV...")
item_listings = get_data_from_csv('items')
print(f"   Found {len(item_listings)} products to publish")

if not item_listings:
    print("   No products found in CSV. Exiting.")
    exit(0)

print("\n6. Starting to publish listings...")
for i, item in enumerate(item_listings, 1):
    print(f"\n   [{i}/{len(item_listings)}] Publishing: {item.get('Title', 'Unknown')[:50]}...")

update_listings(item_listings, 'item', scraper)

print("\n" + "=" * 50)
print("DONE!")
print("=" * 50)
