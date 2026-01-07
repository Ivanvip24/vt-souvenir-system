"""
Facebook Marketplace - Edit Existing Listings
Updates descriptions on already published products
"""
import os
import pickle
import time
import re
from datetime import datetime
from helpers.scraper import Scraper
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains

def log(msg):
    print(msg, flush=True)

# Configuration
HEADLESS_MODE = False  # Visible but MINIMIZED - won't interrupt you
TEST_MODE = True  # Test with 10 listings first

log("=" * 60)
log("FACEBOOK MARKETPLACE - EDIT EXISTING LISTINGS")
log(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
log("=" * 60)

# New description with emojis
NEW_DESCRIPTION = """🎁 SOUVENIRS PERSONALIZADOS AXKAN - SOUVENIRS ÚNICOS 🎁

✨ IMANES | LLAVEROS | DESTAPADORES | BOTONES ✨

100% PERSONALIZABLES con tu foto, nombre, fecha o diseño

💰 PRECIOS INCREÍBLES:
• $11 por pieza (mínimo 100 pzas)
• $1,100 por 100 piezas
• 2 Diseños personalizados INCLUIDOS

🎯 PERFECTOS PARA:
• Venta al mayoreo
• Centros turísticos
• Venta en volumen
• Eventos corporativos
• Regalos de marca
• Graduaciones
• Bodas

📦 ENVÍO A TODO MÉXICO
• Envío express disponible
• Empaque seguro garantizado

⏰ TIEMPO DE ENTREGA: 5-7 días hábiles

📞 Contáctanos para cotización personalizada!
"""

log("\n1. Starting Chrome...")
scraper = Scraper('https://www.facebook.com', headless=HEADLESS_MODE)

log("\n2. Loading cookies...")
try:
    cookies_file = open('cookies/facebook.pkl', 'rb')
    cookies = pickle.load(cookies_file)
    for cookie in cookies:
        try:
            scraper.driver.add_cookie(cookie)
        except:
            pass
    cookies_file.close()
    log("   Cookies loaded")
except:
    log("   No cookies found")

log("\n3. Going to your Marketplace listings...")
scraper.go_to_page('https://www.facebook.com/marketplace/you/selling')
time.sleep(5)

# Scroll down multiple times to load ALL listings
log("   Scrolling to load all listings (this may take a while)...")
last_height = 0
scroll_attempts = 0
max_scroll_attempts = 50  # Scroll up to 50 times to load ~1000 listings

while scroll_attempts < max_scroll_attempts:
    scraper.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(1.5)
    new_height = scraper.driver.execute_script("return document.body.scrollHeight")

    # Count current listings
    count = scraper.driver.execute_script("""
        var count = 0;
        var spans = document.querySelectorAll('span');
        for (var i = 0; i < spans.length; i++) {
            if (spans[i].textContent.includes('Souvenir') && spans[i].textContent.includes('AXKAN')) {
                count++;
            }
        }
        return count;
    """)

    scroll_attempts += 1
    if scroll_attempts % 10 == 0:
        log(f"   Scroll {scroll_attempts}: loaded {count} listings so far...")

    # Stop if we've loaded enough or no new content
    if new_height == last_height:
        log(f"   Reached end of page after {scroll_attempts} scrolls")
        break
    last_height = new_height

# Scroll back to top
scraper.driver.execute_script("window.scrollTo(0, 0);")
time.sleep(2)

scraper.driver.save_screenshot("/tmp/fb_my_listings.png")
log("   Screenshot saved: /tmp/fb_my_listings.png")

log("\n4. Finding '...' menu buttons for each listing...")

# Find all the "..." menu buttons
find_menus_script = """
var menus = [];
// Look for the three-dot menu buttons next to each listing
var buttons = document.querySelectorAll('div[aria-label="Más"], div[aria-label="More"], [aria-haspopup="menu"]');
for (var i = 0; i < buttons.length; i++) {
    var btn = buttons[i];
    if (btn.offsetParent !== null) {
        menus.push({index: i, visible: true});
    }
}
// Also look for ... text buttons
var allDivs = document.querySelectorAll('div[role="button"]');
for (var i = 0; i < allDivs.length; i++) {
    var div = allDivs[i];
    // Look for buttons that are likely menu buttons (small, near listings)
    if (div.offsetWidth < 50 && div.offsetHeight < 50 && div.offsetParent !== null) {
        var rect = div.getBoundingClientRect();
        if (rect.top > 100 && rect.top < 2000) {  // In the listing area
            menus.push({index: menus.length, element: 'small button', top: rect.top});
        }
    }
}
return menus.length;
"""
menu_count = scraper.driver.execute_script(find_menus_script)
log(f"   Found approximately {menu_count} menu buttons")

# Count listings by looking for "Souvenir" text
count_script = """
var count = 0;
var spans = document.querySelectorAll('span');
for (var i = 0; i < spans.length; i++) {
    if (spans[i].textContent.includes('Souvenir') && spans[i].textContent.includes('AXKAN')) {
        count++;
    }
}
return count;
"""
listing_count = scraper.driver.execute_script(count_script)
log(f"   Found {listing_count} listings with 'Souvenir AXKAN'")

if listing_count == 0:
    log("   No listings found. Check screenshot.")
    scraper.driver.quit()
    exit(1)

# Limit to TEST_MODE count
max_listings = 10 if TEST_MODE else listing_count

# RESUME: Start from beginning
START_FROM = 0  # Start from first listing
log(f"\n   Will edit up to {max_listings} listings (starting from #{START_FROM + 1})")

log("\n5. Editing listings...")

success_count = 0
fail_count = 0

edited_count = 0
batch_size = 10  # Edit 10 listings per batch before scrolling
current_scroll_position = 0

for i in range(START_FROM, max_listings):
    log(f"\n[{i+1}/{max_listings}] Editing listing {i+1}...")

    try:
        # Go back to listings page
        scraper.go_to_page('https://www.facebook.com/marketplace/you/selling')
        time.sleep(5)

        # Scroll down to load listings up to our target position
        target_batch = i // batch_size
        log(f"   Scrolling to batch {target_batch}...")

        # First scroll to bottom to trigger loading, then back up
        for scroll_num in range(min(target_batch + 3, 20)):
            scraper.driver.execute_script("window.scrollBy(0, 600);")
            time.sleep(0.8)

        # Scroll to target position
        scroll_amount = target_batch * 600
        scraper.driver.execute_script(f"window.scrollTo(0, {scroll_amount});")
        time.sleep(2)

        # Click on listing title to go to its page
        log("   Finding listing...")
        listing_index = i % batch_size

        click_listing_script = f"""
        var listings = [];

        // Find all spans with "Souvenir" and "AXKAN" that are clickable
        var allSpans = document.querySelectorAll('span');
        for (var j = 0; j < allSpans.length; j++) {{
            var span = allSpans[j];
            var text = span.textContent;
            if (text.includes('Souvenir') && text.includes('AXKAN') && text.includes('#')) {{
                // This is a listing title - find clickable parent
                var clickable = span.closest('a') || span.closest('[role="link"]') || span.closest('[role="button"]');
                if (!clickable) {{
                    // Try parent elements
                    var parent = span.parentElement;
                    for (var k = 0; k < 5; k++) {{
                        if (parent && (parent.tagName === 'A' || parent.getAttribute('role') === 'link')) {{
                            clickable = parent;
                            break;
                        }}
                        parent = parent ? parent.parentElement : null;
                    }}
                }}
                if (clickable && !listings.some(l => l.element === clickable)) {{
                    listings.push({{element: clickable, text: text.substring(0, 40)}});
                }}
            }}
        }}

        // Click on the listing at the specified index
        if (listings.length > {listing_index}) {{
            var target = listings[{listing_index}];
            target.element.scrollIntoView({{block: 'center'}});
            target.element.click();
            return 'clicked: ' + target.text + ' (' + {listing_index} + ' of ' + listings.length + ')';
        }}

        // Fallback: click directly on the span
        var souvenirSpans = [];
        for (var j = 0; j < allSpans.length; j++) {{
            var span = allSpans[j];
            if (span.textContent.includes('Souvenir') && span.textContent.includes('AXKAN') && span.textContent.includes('#')) {{
                souvenirSpans.push(span);
            }}
        }}
        if (souvenirSpans.length > {listing_index}) {{
            souvenirSpans[{listing_index}].scrollIntoView({{block: 'center'}});
            souvenirSpans[{listing_index}].click();
            return 'clicked span: ' + souvenirSpans[{listing_index}].textContent.substring(0, 40);
        }}

        return 'not found, total spans: ' + souvenirSpans.length;
        """
        listing_result = scraper.driver.execute_script(click_listing_script)
        log(f"   Listing click: {listing_result}")

        if 'not found' in listing_result:
            log("   Could not find listing, skipping...")
            fail_count += 1
            continue

        time.sleep(3)

        # Listing detail page opens - need to click the "✏️ Editar" button
        log("   Looking for Edit button on detail page...")

        # Wait for detail page to load fully
        time.sleep(2)

        # Click the "Editar" or "Editar publicación" button
        # Two possible flows:
        # 1. Detail page with "✏️ Editar" near top
        # 2. Popup modal with "Editar publicación" icon button
        click_edit_script = """
        // Strategy 1: Look for "Editar publicación" button in popup (icon + text)
        // The button is an icon with text below it - need to find the clickable container
        var allSpans = document.querySelectorAll('span');
        for (var i = 0; i < allSpans.length; i++) {
            var span = allSpans[i];
            var text = span.textContent.trim();
            // Match "Editar publicación" or just "Editar" with "publicación" nearby
            if ((text === 'Editar publicación' || text === 'Editarpublicación' ||
                 (text === 'Editar' && span.nextSibling && span.nextSibling.textContent &&
                  span.nextSibling.textContent.includes('publicación'))) && span.offsetParent !== null) {

                // Find the clickable parent container (usually 3-5 levels up)
                var clickTarget = span;
                var parent = span.parentElement;
                for (var j = 0; j < 6; j++) {
                    if (parent) {
                        // Check if this is a clickable element
                        var role = parent.getAttribute('role');
                        var tabindex = parent.getAttribute('tabindex');
                        if (role === 'button' || tabindex === '0' || parent.onclick) {
                            clickTarget = parent;
                        }
                        parent = parent.parentElement;
                    }
                }

                clickTarget.scrollIntoView({block: 'center'});

                // Try multiple click methods
                clickTarget.click();

                // Also try dispatching click event
                var evt = new MouseEvent('click', {bubbles: true, cancelable: true, view: window});
                clickTarget.dispatchEvent(evt);

                return 'clicked (popup button): ' + text;
            }
        }

        // Strategy 1b: Look for div[role="button"] containing "Editar"
        var buttons = document.querySelectorAll('div[role="button"], [tabindex="0"]');
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var text = btn.textContent.trim();
            if (text.includes('Editar') && text.includes('publicación') && btn.offsetParent !== null) {
                btn.scrollIntoView({block: 'center'});
                btn.click();
                var evt = new MouseEvent('click', {bubbles: true, cancelable: true, view: window});
                btn.dispatchEvent(evt);
                return 'clicked (role button): ' + text.substring(0, 30);
            }
        }

        // Strategy 2: Look for clickable elements with just "Editar" (detail page)
        var clickables = document.querySelectorAll('a, [role="link"], [role="button"]');
        for (var i = 0; i < clickables.length; i++) {
            var el = clickables[i];
            var text = el.textContent.trim();
            // Match "Editar" but not full paragraphs
            if ((text === 'Editar' || text === '✏️ Editar') && el.offsetParent !== null) {
                var rect = el.getBoundingClientRect();
                if (rect.top < 500) {
                    el.scrollIntoView({block: 'center'});
                    el.click();
                    return 'clicked (detail): ' + text + ' at y=' + Math.round(rect.top);
                }
            }
        }

        // Strategy 3: Look for any span/div with just "Editar"
        var candidates = [];
        for (var i = 0; i < allSpans.length; i++) {
            var el = allSpans[i];
            var text = el.textContent.trim();
            if (text === 'Editar' && el.offsetParent !== null) {
                var rect = el.getBoundingClientRect();
                candidates.push({el: el, text: text, top: rect.top});
            }
        }
        // Sort by position and click
        candidates.sort(function(a, b) { return a.top - b.top; });
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            if (c.top > 50 && c.top < 800) {
                c.el.click();
                if (c.el.parentElement) c.el.parentElement.click();
                return 'clicked (fallback): ' + c.text + ' at y=' + Math.round(c.top);
            }
        }

        return 'not found';
        """
        click_result = scraper.driver.execute_script(click_edit_script)
        log(f"   Edit click: {click_result}")

        if 'not found' in click_result:
            log("   Could not find Edit button, skipping...")
            fail_count += 1
            continue

        # Wait for edit FORM modal to appear
        time.sleep(4)

        # Take debug screenshot to see if edit form loaded
        scraper.driver.save_screenshot(f"/tmp/fb_after_edit_{i}.png")
        log(f"   Screenshot: /tmp/fb_after_edit_{i}.png")

        # Check if edit form/modal actually opened
        check_form_script = """
        // Check for typical edit form elements
        var signs = {
            hasModal: !!document.querySelector('[role="dialog"]'),
            hasForm: !!document.querySelector('form'),
            hasInputs: document.querySelectorAll('input[type="text"], textarea').length,
            hasTitle: !!document.querySelector('[aria-label*="Título"], [aria-label*="Title"]'),
            hasMasDetalles: false
        };
        // Check for "Más detalles" text
        var spans = document.querySelectorAll('span');
        for (var i = 0; i < spans.length; i++) {
            if (spans[i].textContent.trim().startsWith('Más detalles')) {
                signs.hasMasDetalles = true;
                break;
            }
        }
        return signs;
        """
        form_check = scraper.driver.execute_script(check_form_script)
        log(f"   Form check: {form_check}")

        # If no form signs, try clicking edit again or scroll modal into view
        if not form_check.get('hasModal') and not form_check.get('hasMasDetalles') and form_check.get('hasInputs', 0) == 0:
            log("   Edit form not detected, trying to scroll and click again...")
            scraper.driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(1)

            # Try clicking edit one more time
            retry_click = scraper.driver.execute_script(click_edit_script)
            log(f"   Retry edit click: {retry_click}")
            time.sleep(4)

            # Check again
            form_check = scraper.driver.execute_script(check_form_script)
            log(f"   Form check after retry: {form_check}")

        # Scroll down to see "Más detalles" in the edit form
        scraper.driver.execute_script("window.scrollTo(0, 400);")
        time.sleep(1)

        # Now expand "Más detalles" section
        log("   Expanding 'Más detalles'...")

        # Try multiple times to expand
        expanded = False
        for attempt in range(3):
            # Method 1: ActionChains click
            try:
                mas_detalles_elements = scraper.driver.find_elements(By.XPATH, "//*[contains(text(), 'Más detalles')]")
                for elem in mas_detalles_elements:
                    if elem.is_displayed() and 'Incluye' not in elem.text:
                        scraper.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", elem)
                        time.sleep(0.5)
                        parent = elem.find_element(By.XPATH, "./..")
                        actions = ActionChains(scraper.driver)
                        actions.move_to_element(parent).click().perform()
                        log(f"   Clicked via ActionChains")
                        time.sleep(1)
                        break
            except Exception as e:
                log(f"   ActionChains error: {e}")

            # Method 2: JavaScript - find and click "Más detalles" section
            expand_script = """
            // Look for "Más detalles" text
            var allElements = document.querySelectorAll('span, div');
            for (var i = 0; i < allElements.length; i++) {
                var el = allElements[i];
                var text = el.textContent.trim();
                // Match "Más detalles" but not the subtitle
                if (text === 'Más detalles' || (text.startsWith('Más detalles') && text.length < 20)) {
                    el.scrollIntoView({block: 'center'});

                    // Try clicking the element itself
                    el.click();

                    // Also try clicking parent containers
                    var parent = el.parentElement;
                    for (var j = 0; j < 4; j++) {
                        if (parent) {
                            parent.click();
                            parent = parent.parentElement;
                        }
                    }
                    return 'clicked: ' + text;
                }
            }
            return 'not found';
            """
            result = scraper.driver.execute_script(expand_script)
            log(f"   JS click: {result}")
            time.sleep(1.5)

            # Check if textarea appeared
            check_script = """
            var textareas = document.querySelectorAll('textarea');
            var count = 0;
            for (var i = 0; i < textareas.length; i++) {
                if (textareas[i].offsetParent !== null && textareas[i].offsetHeight > 50) count++;
            }
            return count;
            """
            textarea_count = scraper.driver.execute_script(check_script)
            log(f"   Visible textareas: {textarea_count}")

            if textarea_count >= 1:
                expanded = True
                log(f"   Section expanded!")
                break

            time.sleep(1)

        if not expanded:
            log("   Could not expand Más detalles")
            fail_count += 1
            continue

        # Fill description using execCommand
        log("   Filling description...")

        # Focus the textarea
        focus_script = """
        var textareas = document.querySelectorAll('textarea');
        for (var i = 0; i < textareas.length; i++) {
            var ta = textareas[i];
            if (ta.offsetParent !== null && ta.offsetHeight >= 70) {
                ta.focus();
                ta.click();
                ta.select();
                return 'focused';
            }
        }
        return 'not found';
        """
        focus_result = scraper.driver.execute_script(focus_script)
        log(f"   Focus: {focus_result}")

        if 'focused' in focus_result:
            time.sleep(0.3)

            # Insert text using execCommand
            insert_script = """
            var desc = arguments[0];
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, desc);
            return 'inserted';
            """
            insert_result = scraper.driver.execute_script(insert_script, NEW_DESCRIPTION)
            log(f"   Insert: {insert_result}")
            time.sleep(0.5)

            # Verify
            verify_script = """
            var textareas = document.querySelectorAll('textarea');
            for (var i = 0; i < textareas.length; i++) {
                var ta = textareas[i];
                if (ta.offsetParent !== null && ta.offsetHeight >= 70) {
                    return {length: ta.value.length, preview: ta.value.substring(0, 30)};
                }
            }
            return null;
            """
            verify = scraper.driver.execute_script(verify_script)
            log(f"   Verification: {verify}")

            if verify and verify.get('length', 0) > 50:
                log("   Description filled!")

                # Take screenshot before saving
                scraper.driver.save_screenshot(f"/tmp/fb_before_save_{i}.png")
                log(f"   Screenshot: /tmp/fb_before_save_{i}.png")

                # Click "Actualizar" button to save
                log("   Clicking 'Actualizar' to save...")
                time.sleep(1)

                save_script = """
                var buttons = document.querySelectorAll('div[role="button"], button, span');
                for (var i = 0; i < buttons.length; i++) {
                    var btn = buttons[i];
                    var text = btn.textContent.trim().toLowerCase();
                    if (text === 'actualizar' || text === 'update' || text === 'guardar' || text === 'save') {
                        if (btn.offsetParent !== null) {
                            btn.scrollIntoView({block: 'center'});
                            btn.click();
                            return 'clicked: ' + btn.textContent;
                        }
                    }
                }
                return 'not found';
                """
                save_result = scraper.driver.execute_script(save_script)
                log(f"   Save click: {save_result}")

                if 'clicked' in save_result:
                    time.sleep(3)
                    scraper.driver.save_screenshot(f"/tmp/fb_after_save_{i}.png")
                    log(f"   Screenshot after save: /tmp/fb_after_save_{i}.png")
                    success_count += 1
                    log("   SUCCESS!")
                else:
                    log("   Could not find save button")
                    fail_count += 1
            else:
                log("   Description not filled properly")
                fail_count += 1
        else:
            log("   Could not focus textarea")
            fail_count += 1

    except Exception as e:
        log(f"   Error: {e}")
        fail_count += 1

log("\n" + "=" * 60)
log("COMPLETE!")
log(f"Success: {success_count}")
log(f"Failed: {fail_count}")
log("=" * 60)

scraper.driver.quit()
