"""
Facebook Marketplace Bot v2 - Robust Spanish Version
With detailed debugging and flexible selectors
"""
import os
import pickle
import time
import sys
from datetime import datetime, timedelta
from helpers.scraper import Scraper
from helpers.csv_helper import get_data_from_csv

# Enable real-time output
def log(msg):
    print(msg, flush=True)

# Progress bar function
def progress_bar(current, total, success, fail, start_time):
    pct = (current / total) * 100
    bar_len = 30
    filled = int(bar_len * current / total)
    bar = '█' * filled + '░' * (bar_len - filled)

    elapsed = time.time() - start_time
    if current > 0:
        eta_seconds = (elapsed / current) * (total - current)
        eta = str(timedelta(seconds=int(eta_seconds)))
    else:
        eta = "calculating..."

    log(f"\n{'='*60}")
    log(f"PROGRESS: [{bar}] {pct:.1f}%")
    log(f"Completed: {current}/{total} | Success: {success} | Failed: {fail}")
    log(f"Elapsed: {str(timedelta(seconds=int(elapsed)))} | ETA: {eta}")
    log(f"{'='*60}\n")

# Run in HEADLESS mode (background)
# NOTE: Facebook detects headless mode, so running with visible browser
HEADLESS_MODE = False

log("=" * 60)
log("FACEBOOK MARKETPLACE BOT v2 - HEADLESS MODE")
log(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
log("=" * 60)

def save_cookies(driver):
    """Save cookies to file"""
    cookies_folder = 'cookies/'
    if not os.path.exists(cookies_folder):
        os.makedirs(cookies_folder)
    cookies_file = open(cookies_folder + 'facebook.pkl', 'wb')
    cookies = driver.get_cookies()
    pickle.dump(cookies, cookies_file)
    cookies_file.close()

def try_selectors(scraper, selectors, action='find', text=None, timeout=3):
    """Try multiple selectors until one works"""
    for selector in selectors:
        try:
            if selector.startswith('//'):
                # XPath
                element = scraper.find_element_by_xpath(selector, False, timeout)
            else:
                # CSS
                element = scraper.find_element(selector, False, timeout)

            if element:
                if action == 'click':
                    try:
                        element.click()
                    except:
                        scraper.driver.execute_script("arguments[0].click();", element)
                elif action == 'send_keys' and text:
                    try:
                        element.click()
                    except:
                        pass
                    element.send_keys(text)
                return True, selector
        except:
            continue
    return False, None

def publish_item(scraper, data):
    """Publish a single item to Facebook Marketplace"""
    from selenium.webdriver.common.by import By
    print(f"\n  Publishing: {data['Title'][:50]}...")

    # Go to create item page
    scraper.go_to_page('https://facebook.com/marketplace/create/item')
    time.sleep(3)

    # 1. Upload images
    print("    [1/6] Uploading images...")
    images_path = data['Photos Folder']
    if not images_path.endswith('/'):
        images_path += '/'

    image_names = [name.strip() for name in data['Photos Names'].split(';') if name.strip()]
    full_paths = '\n'.join([images_path + name for name in image_names[:10]])  # Max 10 images

    try:
        scraper.input_file_add_files('input[accept="image/*,image/heif,image/heic"]', full_paths)
        time.sleep(2)
    except Exception as e:
        print(f"    Warning: Image upload issue - {e}")

    # 2. Fill Title
    print("    [2/6] Filling title...")
    title_selectors = [
        '//label[contains(text(),"Título")]//following::input[1]',
        '//span[text()="Título"]/following-sibling::input[1]',
        '//label[contains(text(),"Title")]//following::input[1]',
        '//span[text()="Title"]/following-sibling::input[1]',
        'input[placeholder*="título" i]',
        'input[placeholder*="title" i]',
    ]
    success, used = try_selectors(scraper, title_selectors, 'send_keys', data['Title'])
    if success:
        print(f"      ✓ Title filled")
    else:
        print(f"      ✗ Could not find title field")

    time.sleep(1)

    # 3. Fill Price
    print("    [3/6] Filling price...")
    price_selectors = [
        '//label[contains(text(),"Precio")]//following::input[1]',
        '//span[text()="Precio"]/following-sibling::input[1]',
        '//label[contains(text(),"Price")]//following::input[1]',
        '//span[text()="Price"]/following-sibling::input[1]',
        'input[placeholder*="precio" i]',
        'input[placeholder*="price" i]',
    ]
    success, used = try_selectors(scraper, price_selectors, 'send_keys', data['Price'])
    if success:
        print(f"      ✓ Price filled")
    else:
        print(f"      ✗ Could not find price field")

    time.sleep(1)

    # 4. Select Category - Simple approach that worked before
    print("    [4/6] Selecting category...")

    # Click on category dropdown
    category_clicked = try_selectors(scraper, [
        '//span[text()="Categoría"]',
        '//label[contains(text(),"Categoría")]',
    ], 'click', timeout=3)

    if category_clicked[0]:
        time.sleep(2)
        # Now click on "Hogar" in the dropdown
        hogar_clicked = try_selectors(scraper, [
            '//span[text()="Hogar"]',
            '//div[text()="Hogar"]',
        ], 'click', timeout=5)

        if hogar_clicked[0]:
            print(f"      ✓ Category 'Hogar' selected")
        else:
            print(f"      ✗ Could not select 'Hogar'")
    else:
        print(f"      ✗ Could not open category dropdown")

    time.sleep(1)

    # 5. Select Condition
    print("    [5/6] Selecting condition...")
    condition_click_selectors = [
        '//label[contains(text(),"Estado")]',
        '//span[text()="Estado"]',
        '//label[contains(text(),"Condition")]',
        '//span[text()="Condition"]',
    ]
    success, used = try_selectors(scraper, condition_click_selectors, 'click')
    if success:
        time.sleep(1)
        condition_options = [
            '//span[text()="Nuevo"]',
            '//span[text()="New"]',
            '//span[contains(text(),"Nuevo")]',
            '//span[contains(text(),"New")]',
        ]
        success2, used2 = try_selectors(scraper, condition_options, 'click')
        if success2:
            print(f"      ✓ Condition selected")
        else:
            print(f"      ~ Condition dropdown opened but couldn't select")
    else:
        print(f"      ✗ Could not find condition field")

    time.sleep(1)

    # 6. Fill Description (on Step 1, under "Más detalles")
    print("    [6/6] Filling description...")

    # Clean description - remove emojis that cause issues with React/Facebook
    import re
    raw_desc = data['Description'][:1000]
    # Remove emojis and other non-BMP characters
    description_text = re.sub(r'[^\x00-\x7F\xA0-\xFF\u0100-\uFFFF]', '', raw_desc).strip()
    # If description is too short or empty after cleaning, use a default
    if len(description_text) < 10:
        product_name = data['Title']
        description_text = f"Souvenir {product_name} - Producto de alta calidad AXKAN. Ideal como recuerdo o regalo. Envios a todo Mexico."
    print(f"      Description to use: {description_text[:60]}...")
    desc_filled = False

    # Take screenshot before attempting description
    scraper.driver.save_screenshot("/tmp/fb_before_desc.png")
    print("      Screenshot saved: /tmp/fb_before_desc.png")

    # Scroll down to see "Más detalles" section
    scraper.driver.execute_script("window.scrollTo(0, document.body.scrollHeight / 2);")
    time.sleep(1)

    # First, expand "Más detalles" section by clicking on it
    print("      Looking for 'Más detalles' section...")

    from selenium.webdriver.common.action_chains import ActionChains

    # Try multiple times to expand "Más detalles"
    expanded = False
    for attempt in range(3):
        print(f"      Expand attempt {attempt + 1}...")

        # Method 1: Find element with Selenium and use ActionChains for real click
        try:
            mas_detalles_elements = scraper.driver.find_elements(By.XPATH, "//*[contains(text(), 'Más detalles')]")
            for elem in mas_detalles_elements:
                if elem.is_displayed() and 'Incluye' not in elem.text:
                    # Scroll to element
                    scraper.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", elem)
                    time.sleep(0.5)

                    # Try clicking the element's parent (the clickable container)
                    parent = elem.find_element(By.XPATH, "./..")
                    actions = ActionChains(scraper.driver)
                    actions.move_to_element(parent).click().perform()
                    print(f"      Clicked via ActionChains on parent")
                    time.sleep(1)
                    break
        except Exception as e:
            print(f"      ActionChains error: {e}")

        # Method 2: Use JavaScript to simulate mouse events
        expand_script = """
        var spans = document.querySelectorAll('span');
        for (var i = 0; i < spans.length; i++) {
            var span = spans[i];
            if (span.textContent.trim() === 'Más detalles') {
                // Go up to find the clickable container
                var target = span;
                for (var j = 0; j < 6; j++) {
                    target = target.parentElement;
                    if (!target) break;
                }
                if (target) {
                    target.scrollIntoView({block: 'center'});
                    // Simulate real mouse events
                    var rect = target.getBoundingClientRect();
                    var centerX = rect.left + rect.width / 2;
                    var centerY = rect.top + rect.height / 2;

                    var mouseDown = new MouseEvent('mousedown', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: centerX, clientY: centerY
                    });
                    var mouseUp = new MouseEvent('mouseup', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: centerX, clientY: centerY
                    });
                    var click = new MouseEvent('click', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: centerX, clientY: centerY
                    });

                    target.dispatchEvent(mouseDown);
                    target.dispatchEvent(mouseUp);
                    target.dispatchEvent(click);
                    return 'simulated click on container';
                }
            }
        }
        return 'not found';
        """
        result = scraper.driver.execute_script(expand_script)
        print(f"      JS mouse simulation: {result}")
        time.sleep(1.5)

        # Check if textarea appeared (means section expanded)
        check_script = """
        var textareas = document.querySelectorAll('textarea');
        var count = 0;
        for (var i = 0; i < textareas.length; i++) {
            if (textareas[i].offsetParent !== null && textareas[i].offsetHeight > 50) {
                count++;
            }
        }
        return count;
        """
        textarea_count = scraper.driver.execute_script(check_script)
        print(f"      Visible textareas: {textarea_count}")

        if textarea_count >= 1:
            expanded = True
            print(f"      ✓ Section expanded!")
            break

        time.sleep(1)

    if not expanded:
        print(f"      Warning: Could not confirm expansion after 3 attempts")

    # Scroll down more to see expanded content
    scraper.driver.execute_script("window.scrollBy(0, 300);")
    time.sleep(1)

    # Take screenshot after expanding
    scraper.driver.save_screenshot("/tmp/fb_after_expand.png")
    print("      Screenshot saved: /tmp/fb_after_expand.png")

    # Now look for description field - it should be a textarea or textbox
    # Method 1: Look for element with placeholder containing "descripción"
    find_desc_script = """
    var results = [];

    // Look for textareas
    var textareas = document.querySelectorAll('textarea');
    for (var i = 0; i < textareas.length; i++) {
        var ta = textareas[i];
        if (ta.offsetParent !== null) {
            results.push({
                type: 'textarea',
                placeholder: ta.placeholder,
                ariaLabel: ta.getAttribute('aria-label'),
                visible: true,
                height: ta.offsetHeight
            });
        }
    }

    // Look for contenteditable divs
    var editables = document.querySelectorAll('[contenteditable="true"], [role="textbox"]');
    for (var i = 0; i < editables.length; i++) {
        var ed = editables[i];
        if (ed.offsetParent !== null && ed.offsetHeight > 40) {
            results.push({
                type: ed.tagName + ' ' + (ed.getAttribute('role') || ''),
                ariaLabel: ed.getAttribute('aria-label'),
                placeholder: ed.getAttribute('data-placeholder'),
                visible: true,
                height: ed.offsetHeight
            });
        }
    }

    return results;
    """
    found_fields = scraper.driver.execute_script(find_desc_script)
    print(f"      Found {len(found_fields)} potential description fields:")
    for f in found_fields:
        print(f"        - {f}")

    # Method 1: Use execCommand to insert text (works with React controlled inputs)
    if not desc_filled:
        try:
            # First focus the textarea
            focus_script = """
            var textareas = document.querySelectorAll('textarea');
            for (var i = 0; i < textareas.length; i++) {
                var ta = textareas[i];
                if (ta.offsetParent !== null && ta.offsetHeight >= 70) {
                    ta.focus();
                    ta.click();
                    ta.select();
                    return 'focused: height=' + ta.offsetHeight;
                }
            }
            return 'no textarea found';
            """
            focus_result = scraper.driver.execute_script(focus_script)
            print(f"      Focus result: {focus_result}")

            if 'focused' in str(focus_result):
                time.sleep(0.3)

                # Use execCommand to insert text - this simulates real typing
                insert_script = """
                var desc = arguments[0];
                // Clear existing content first
                document.execCommand('selectAll', false, null);
                // Insert new text
                document.execCommand('insertText', false, desc);
                return 'inserted';
                """
                insert_result = scraper.driver.execute_script(insert_script, description_text)
                print(f"      Insert result: {insert_result}")

                time.sleep(0.5)

                # Verify by reading back
                verify_script = """
                var textareas = document.querySelectorAll('textarea');
                for (var i = 0; i < textareas.length; i++) {
                    var ta = textareas[i];
                    if (ta.offsetParent !== null && ta.offsetHeight >= 70) {
                        return {value: ta.value.substring(0, 50), length: ta.value.length};
                    }
                }
                return null;
                """
                verify = scraper.driver.execute_script(verify_script)
                print(f"      Verification: {verify}")

                if verify and verify.get('length', 0) > 10:
                    desc_filled = True
                    print(f"      ✓ Description filled via execCommand")
                else:
                    print(f"      execCommand didn't work, trying Selenium send_keys...")
                    # Fallback: Use Selenium send_keys with pure ASCII text
                    try:
                        textareas = scraper.driver.find_elements(By.TAG_NAME, 'textarea')
                        for ta in textareas:
                            if ta.is_displayed() and ta.size['height'] >= 70:
                                ta.click()
                                ta.clear()
                                time.sleep(0.2)
                                # Use ASCII-only description
                                ascii_desc = "Souvenir AXKAN - Producto de alta calidad. Ideal como recuerdo o regalo. Envios a todo Mexico."
                                ta.send_keys(ascii_desc)
                                desc_filled = True
                                print(f"      ✓ Description filled via send_keys")
                                break
                    except Exception as e2:
                        print(f"      send_keys error: {e2}")

                # Take screenshot
                scraper.driver.save_screenshot("/tmp/fb_desc_filled.png")
                print(f"      Screenshot after fill: /tmp/fb_desc_filled.png")
        except Exception as e:
            print(f"      execCommand error: {e}")

    # Method 2: Try contenteditable with aria-label containing "descripción"
    if not desc_filled:
        try:
            fill_script = """
            var desc = arguments[0];

            // Try aria-label
            var fields = document.querySelectorAll('[aria-label*="escripción"], [aria-label*="escription"]');
            for (var i = 0; i < fields.length; i++) {
                var field = fields[i];
                if (field.offsetParent !== null) {
                    field.focus();
                    field.click();

                    // Clear and type
                    if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
                        field.value = desc;
                    } else {
                        field.innerHTML = '<p>' + desc.replace(/\\n/g, '</p><p>') + '</p>';
                    }

                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                    return 'filled via aria-label';
                }
            }

            // Try any large textbox
            var textboxes = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
            for (var i = 0; i < textboxes.length; i++) {
                var tb = textboxes[i];
                if (tb.offsetParent !== null && tb.offsetHeight > 60) {
                    tb.focus();
                    tb.click();
                    tb.innerHTML = '<p>' + desc.replace(/\\n/g, '</p><p>') + '</p>';
                    tb.dispatchEvent(new Event('input', { bubbles: true }));
                    return 'filled via textbox';
                }
            }

            return false;
            """
            result = scraper.driver.execute_script(fill_script, description_text)
            if result:
                desc_filled = True
                print(f"      ✓ Description filled ({result})")
        except Exception as e:
            print(f"      JS fill error: {e}")

    # Method 3: Click on "Descripción" label and type
    if not desc_filled:
        try:
            click_label_script = """
            var labels = document.querySelectorAll('span, label');
            for (var i = 0; i < labels.length; i++) {
                var label = labels[i];
                if (label.textContent === 'Descripción' && label.offsetParent !== null) {
                    // Find the input area near this label
                    var parent = label.closest('div');
                    if (parent) {
                        var input = parent.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
                        if (input) {
                            input.click();
                            return {found: true, type: input.tagName};
                        }
                    }
                    // Just click the label area
                    label.click();
                    return {found: true, type: 'label clicked'};
                }
            }
            return {found: false};
            """
            label_result = scraper.driver.execute_script(click_label_script)
            print(f"      Label click result: {label_result}")

            if label_result.get('found'):
                time.sleep(0.5)
                # Use JavaScript to fill the active element (handles emojis)
                js_fill_active = """
                var desc = arguments[0];
                var active = document.activeElement;
                if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
                    active.value = desc;
                    active.dispatchEvent(new Event('input', { bubbles: true }));
                    return 'filled textarea/input';
                } else if (active && active.getAttribute('contenteditable')) {
                    active.innerHTML = desc;
                    active.dispatchEvent(new Event('input', { bubbles: true }));
                    return 'filled contenteditable';
                }
                return 'could not fill';
                """
                fill_result = scraper.driver.execute_script(js_fill_active, description_text)
                if 'filled' in fill_result:
                    desc_filled = True
                    print(f"      ✓ Description filled (via label click: {fill_result})")
        except Exception as e:
            print(f"      Label method error: {e}")

    if not desc_filled:
        print("      ~ Could not fill description on Step 1")
        # Debug: list available fields and save screenshot
        try:
            screenshot_path = f"/tmp/fb_desc_{int(time.time())}.png"
            scraper.driver.save_screenshot(screenshot_path)
            print(f"      Screenshot: {screenshot_path}")

            debug_script = """
            var results = [];
            // Look for ALL potential text input elements
            var selectors = 'div[role="textbox"], textarea, div[contenteditable="true"], input, span[data-text="true"]';
            var elements = document.querySelectorAll(selectors);
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                if (el.offsetParent !== null && el.offsetHeight > 30) {
                    results.push({
                        tag: el.tagName,
                        role: el.getAttribute('role'),
                        ariaLabel: el.getAttribute('aria-label'),
                        placeholder: el.getAttribute('placeholder'),
                        contentEditable: el.getAttribute('contenteditable'),
                        className: el.className.substring(0, 50),
                        height: el.offsetHeight
                    });
                }
            }
            return results;
            """
            elements = scraper.driver.execute_script(debug_script)
            print(f"      Found {len(elements)} visible fields:")
            for el in elements[:10]:  # Show first 10
                print(f"        {el}")
        except Exception as e:
            print(f"      Debug error: {e}")

    time.sleep(1)

    # Try to click Next or Publish
    print("    Attempting to publish...")

    # Scroll up first to see the Next button
    scraper.driver.execute_script("window.scrollTo(0, 0);")
    time.sleep(1)

    # Step 1: Click Next to go to step 2
    next_selectors = [
        'div[aria-label="Siguiente"]:not([aria-disabled="true"])',
        'div[aria-label="Next"]:not([aria-disabled="true"])',
        '//div[@aria-label="Siguiente" and not(@aria-disabled="true")]',
        '//div[@aria-label="Next" and not(@aria-disabled="true")]',
    ]
    success, used = try_selectors(scraper, next_selectors, 'click', timeout=5)
    if success:
        print("      ✓ Clicked Next (step 1 -> step 2)")
        time.sleep(3)

        # Click Next again to go to publish step (if needed)
        success2, used2 = try_selectors(scraper, next_selectors, 'click', timeout=3)
        if success2:
            print("      ✓ Clicked Next (step 2 -> step 3)")
            time.sleep(3)

    # Now try to find and click Publish
    publish_selectors = [
        'div[aria-label="Publicar"]:not([aria-disabled="true"])',
        'div[aria-label="Publish"]:not([aria-disabled="true"])',
        '//div[@aria-label="Publicar" and not(@aria-disabled="true")]',
        '//div[@aria-label="Publish" and not(@aria-disabled="true")]',
        '//span[text()="Publicar"]/ancestor::div[@role="button"]',
        '//span[text()="Publish"]/ancestor::div[@role="button"]',
    ]

    # Scroll to see publish button
    scraper.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(1)

    success, used = try_selectors(scraper, publish_selectors, 'click', timeout=5)
    if success:
        print("      ✓ Clicked Publish!")
        time.sleep(5)
        return True

    # If Publish not found, try clicking Next one more time (might be another step)
    success, used = try_selectors(scraper, next_selectors, 'click', timeout=3)
    if success:
        print("      ✓ Clicked Next (additional step)")
        time.sleep(3)
        success, used = try_selectors(scraper, publish_selectors, 'click', timeout=5)
        if success:
            print("      ✓ Clicked Publish!")
            time.sleep(5)
            return True

    print("      ✗ Could not find Publish button")

    # Take screenshot for debugging
    try:
        screenshot_path = f"/tmp/fb_debug_{int(time.time())}.png"
        scraper.driver.save_screenshot(screenshot_path)
        print(f"      Screenshot saved: {screenshot_path}")
    except:
        pass

    return False

# Main execution
log("\n1. Starting Chrome (headless mode - runs in background)...")
scraper = Scraper('https://facebook.com', headless=HEADLESS_MODE)

log("\n2. Checking login status...")
login_selectors = [
    'svg[aria-label="Tu perfil"]',
    'svg[aria-label="Your profile"]',
    '[aria-label="Tu perfil"]',
    '[aria-label="Your profile"]',
]

logged_in = False
for selector in login_selectors:
    if scraper.find_element(selector, False, 3):
        logged_in = True
        log("   ✓ Already logged in!")
        break

if not logged_in:
    # Check for saved cookies
    cookies_path = 'cookies/facebook.pkl'
    if os.path.exists(cookies_path):
        log("   Loading saved cookies...")
        cookies_file = open(cookies_path, 'rb')
        cookies = pickle.load(cookies_file)
        for cookie in cookies:
            try:
                scraper.driver.add_cookie(cookie)
            except:
                pass
        cookies_file.close()
        scraper.driver.refresh()
        time.sleep(3)

        for selector in login_selectors:
            if scraper.find_element(selector, False, 3):
                logged_in = True
                log("   ✓ Logged in with cookies!")
                break

if not logged_in:
    if HEADLESS_MODE:
        log("\n   ✗ ERROR: Not logged in and running in headless mode!")
        log("   Please run once with HEADLESS_MODE = False to login first")
        exit(1)
    else:
        log("\n   Please log in manually in the browser...")
        log("   Waiting up to 5 minutes...")

        start = time.time()
        while time.time() - start < 300:
            for selector in login_selectors:
                if scraper.find_element(selector, False, 2):
                    logged_in = True
                    break
            if logged_in:
                break
            log(f"   Waiting... ({int(time.time() - start)}s)")
            time.sleep(5)

        if not logged_in:
            log("   ✗ Login timeout!")
            exit(1)

# Save cookies
save_cookies(scraper.driver)
log("   ✓ Cookies saved!")

log("\n3. Loading products from CSV...")
items = get_data_from_csv('items')
log(f"   Found {len(items)} products to publish")

log("\n4. Starting publication process...")
log("   This will run in the background. Check progress below.\n")

success_count = 0
fail_count = 0
start_time = time.time()

# TEST MODE: Set to True to only publish 1 product for testing
TEST_MODE = False
if TEST_MODE:
    items = items[:1]  # Only first product
    log(f"   TEST MODE: Publishing only 1 product to test description")
TOTAL_ITEMS = len(items)

for i, item in enumerate(items, 1):
    log(f"[{i}/{TOTAL_ITEMS}] Publishing: {item['Title'][:40]}...")

    result = publish_item(scraper, item)
    if result:
        success_count += 1
        log(f"    ✓ SUCCESS")
    else:
        fail_count += 1
        log(f"    ✗ FAILED")

    # Show progress every 5 items or at the end
    if i % 5 == 0 or i == TOTAL_ITEMS:
        progress_bar(i, TOTAL_ITEMS, success_count, fail_count, start_time)

    # Go back to selling page and wait before next listing
    scraper.go_to_page('https://facebook.com/marketplace/you/selling')
    time.sleep(5)

log("\n" + "=" * 60)
log("COMPLETE!")
log(f"Started: {datetime.fromtimestamp(start_time).strftime('%Y-%m-%d %H:%M:%S')}")
log(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
log(f"Total time: {str(timedelta(seconds=int(time.time() - start_time)))}")
log(f"Successful: {success_count}")
log(f"Failed: {fail_count}")
log("=" * 60)

log("\nBot finished. Closing browser...")
time.sleep(2)
