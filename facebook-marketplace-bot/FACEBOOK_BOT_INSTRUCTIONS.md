# Facebook Marketplace Bot - Detailed Instructions

## GOAL

Automatically publish product listings to Facebook Marketplace using Selenium browser automation. The bot reads product data from a CSV file and publishes each item with images, title, price, category, condition, description, and location.

---

## WHAT THE BOT DOES

1. Opens Chrome browser (visible, not headless - Facebook detects headless mode)
2. Loads saved Facebook cookies or waits for manual login
3. Reads product data from `csvs/items.csv`
4. For each product:
   - Navigates to `https://facebook.com/marketplace/create/item`
   - Uploads product images
   - Fills in: Title, Price, Category, Condition, Description, Location
   - Clicks "Next" then "Publish"
5. Saves cookies for future sessions

---

## DIRECTORY STRUCTURE

```
facebook-marketplace-bot/
├── main.py                    # PRIMARY entry point - run this
├── main_v2.py                 # Alternative version with more debugging
├── helpers/
│   ├── scraper.py             # Selenium wrapper class (Chrome setup, element finding)
│   ├── listing_helper.py      # Form filling logic (THE MAIN FILE TO DEBUG)
│   └── csv_helper.py          # CSV reader
├── csvs/
│   └── items.csv              # Product data to publish
├── cookies/
│   └── facebook.pkl           # Saved login session (auto-created)
└── fotos-pending/             # Product images folder
```

---

## CSV FORMAT (items.csv)

```csv
"Title","Photos Folder","Photos Names","Price","Category","Condition","Brand","Description","Location","Groups"
"Product Name","/path/to/images","image1.png;image2.png","11","Home & Garden","New","AXKAN","Product description","Mexico City, Mexico",""
```

**Fields:**
- `Title` - Product name (required)
- `Photos Folder` - Absolute path to images folder (required)
- `Photos Names` - Semicolon-separated image filenames (required)
- `Price` - Price in local currency (required)
- `Category` - One of: "Home & Garden", "Electronics", "Clothing", "Sports & Outdoors", "Toys & Games", "Health & Beauty"
- `Condition` - One of: "New", "Used - Like New", "Used - Good", "Used - Fair"
- `Brand` - Brand name (optional, used for some categories)
- `Description` - Product description text (required)
- `Location` - City location like "Mexico City, Mexico" (required)
- `Groups` - Facebook groups to share to, semicolon-separated (optional, can be empty)

---

## SETUP INSTRUCTIONS

### 1. Install Python Dependencies

```bash
pip install selenium webdriver-manager
```

### 2. Prepare Your Data

1. Place product images in `fotos-pending/` folder (or any folder)
2. Edit `csvs/items.csv` with your products
3. Make sure image paths in CSV match actual file locations

### 3. First Run - Login Setup

```bash
cd facebook-marketplace-bot
python3 main.py
```

On first run:
- Chrome opens to Facebook
- **YOU MUST LOG IN MANUALLY** within 5 minutes
- Bot waits and watches for login
- Once logged in, cookies are saved to `cookies/facebook.pkl`
- Future runs use saved cookies (no login needed)

---

## HOW TO RUN

```bash
cd facebook-marketplace-bot
python3 main.py
```

The bot will:
1. Open Chrome
2. Load cookies (or wait for manual login)
3. Go to your selling page
4. Publish each item from the CSV
5. Print progress/errors to terminal

---

## SPANISH LANGUAGE SUPPORT

The bot supports both English and Spanish Facebook interfaces. It tries Spanish selectors first, then English:

| English | Spanish |
|---------|---------|
| Title | Título |
| Price | Precio |
| Category | Categoría |
| Condition | Estado |
| Description | Descripción |
| Location | Ubicación |
| Next | Siguiente |
| Publish | Publicar |
| New | Nuevo |
| Home & Garden | Hogar y jardín |

---

## KEY FILE: helpers/listing_helper.py

This is where all the form-filling logic lives. Key functions:

### `publish_listing(data, listing_type, scraper)`
Main function that publishes one listing. Flow:
1. Go to create page
2. Upload images
3. Call `add_fields_for_item()` to fill form
4. Fill price, description, location
5. Click location dropdown to select suggestion
6. Click Next, then Publish

### `add_fields_for_item(data, scraper)`
Fills item-specific fields:
1. Title field
2. Category dropdown (click to open, select option)
3. Condition dropdown (click to open, select option)
4. Brand field (only for certain categories)

---

## KNOWN ISSUES AND RECENT FIXES

### Issue 1: Location Dropdown Timeout
**Error:** `Timed out waiting for the element with css selector "ul[role="listbox"] li:first-child > div"`

**Cause:** After typing location, the bot immediately tried to click the dropdown without waiting.

**Fix Applied:** Added 2-second wait and multiple fallback selectors in `listing_helper.py` lines 112-135.

### Issue 2: Empty Groups Field Error
**Error:** `Timed out waiting for the element with xpath "//span[text()=""]"`

**Cause:** When Groups field is empty (`""`), `''.split(';')` returns `['']` not `[]`, so it tries to click an empty span.

**Fix Applied:** Changed to filter empty strings: `[g.strip() for g in data['Groups'].split(';') if g.strip()]`

---

## TROUBLESHOOTING GUIDE

### Problem: "Timed out waiting for element"
**Solution:** Facebook changed their UI. Open browser manually, inspect the element, and update the selector in `listing_helper.py`.

Common selector patterns to look for:
- XPath: `//span[text()="Categoría"]` - finds span with exact text
- CSS: `div[aria-label="Publicar"]` - finds div with aria-label
- CSS: `ul[role="listbox"] li:first-child` - finds first item in dropdown

### Problem: Bot detected / Login loop
**Solution:**
1. Delete `cookies/facebook.pkl`
2. Run bot again
3. Log in manually with 2FA if needed
4. Don't rush - act human-like

### Problem: Images not uploading
**Solution:** Check that:
1. Image paths in CSV are absolute paths
2. Images exist at those paths
3. Image format is supported (PNG, JPG)

### Problem: Category/Condition not selecting
**Solution:** The exact text must match Facebook's UI. Check if Facebook changed the option names. Update the mappings in `listing_helper.py`:

```python
category_mapping = {
    'Home & Garden': 'Hogar y jardín',
    'Electronics': 'Electrónica',
    # ... etc
}

condition_mapping = {
    'New': 'Nuevo',
    'Used - Like New': 'Usado - Como nuevo',
    # ... etc
}
```

---

## DEBUGGING TIPS

### 1. Watch the browser
Don't minimize the Chrome window. Watch what happens to see where it fails.

### 2. Add sleep statements
If timing is an issue, add `time.sleep(2)` before problematic steps in `listing_helper.py`.

### 3. Check Facebook's current UI
1. Open Facebook Marketplace manually
2. Start creating a listing
3. Right-click on elements → Inspect
4. Find the current selectors Facebook uses
5. Update `listing_helper.py` with new selectors

### 4. Use main_v2.py for more logging
```bash
python3 main_v2.py
```
This version has more detailed logging and a progress bar.

---

## SELECTOR PATTERNS USED

The bot uses these selector strategies (in order of preference):

1. **XPath with text:**
   ```python
   '//span[text()="Categoría"]'
   ```

2. **XPath with following-sibling (for input fields):**
   ```python
   '//span[text()="Título"]/following-sibling::input[1]'
   ```

3. **CSS with aria-label:**
   ```python
   'div[aria-label="Publicar"]'
   ```

4. **CSS with role:**
   ```python
   'ul[role="listbox"] li:first-child'
   'div[role="option"]'
   ```

---

## FLOW DIAGRAM

```
START
  │
  ▼
Open Chrome → Load cookies or wait for manual login
  │
  ▼
Read items.csv
  │
  ▼
FOR EACH ITEM:
  │
  ├─► Go to /marketplace/create/item
  │
  ├─► Upload images (input[accept="image/*"])
  │
  ├─► Fill Title (//span[text()="Título"]/following-sibling::input)
  │
  ├─► Select Category:
  │     1. Click "Categoría" to open dropdown
  │     2. Click category option (e.g., "Hogar y jardín")
  │
  ├─► Select Condition:
  │     1. Click "Estado" to open dropdown
  │     2. Click condition option (e.g., "Nuevo")
  │
  ├─► Fill Price (//span[text()="Precio"]/following-sibling::input)
  │
  ├─► Fill Description (textarea)
  │
  ├─► Fill Location:
  │     1. Type in location input
  │     2. Wait 2 seconds for dropdown
  │     3. Click first suggestion in listbox
  │
  ├─► Click "Siguiente" (Next)
  │
  ├─► Click "Publicar" (Publish)
  │
  └─► Wait for publish to complete
  │
  ▼
DONE - Go to next item or finish
```

---

## ANTI-DETECTION FEATURES

The bot includes these measures to avoid Facebook detecting automation:

1. **Chrome flags:**
   - `--disable-blink-features=AutomationControlled`
   - `excludeSwitches: ['enable-automation']`

2. **Random delays:**
   - 0.2 to 1.2 seconds between actions (simulates human behavior)

3. **Visible browser:**
   - Not headless (Facebook detects headless mode)

4. **Cookie persistence:**
   - Saves session to avoid repeated logins

---

## COMPLETE FILE REFERENCE

### main.py (entry point)
```python
from helpers.scraper import Scraper
from helpers.csv_helper import get_data_from_csv
from helpers.listing_helper import update_listings

scraper = Scraper('https://facebook.com')
scraper.add_login_functionality('https://facebook.com', 'svg[aria-label="Tu perfil"]', 'facebook')
scraper.go_to_page('https://facebook.com/marketplace/you/selling')

item_listings = get_data_from_csv('items')
update_listings(item_listings, 'item', scraper)
```

### Key scraper methods (scraper.py)
- `find_element(css_selector, exit_on_fail, timeout)` - Find by CSS
- `find_element_by_xpath(xpath, exit_on_fail, timeout)` - Find by XPath
- `element_click(selector)` - Click element
- `element_send_keys(selector, text)` - Type into element
- `input_file_add_files(selector, paths)` - Upload files

---

## SUMMARY FOR AI ASSISTANT

**Your task:** Get this Facebook Marketplace bot working.

**Entry point:** `python3 main.py`

**Main logic file:** `helpers/listing_helper.py`

**When it fails:**
1. Look at the error message - it tells you which selector failed
2. The selector probably doesn't match Facebook's current UI
3. Manually inspect Facebook's UI to find the correct selector
4. Update the selector in `listing_helper.py`
5. Add fallback selectors (try multiple patterns)
6. Add `time.sleep()` if timing issues

**Test with one item first:**
Edit `csvs/items.csv` to have only one product, then run and watch the browser to see exactly where it fails.
