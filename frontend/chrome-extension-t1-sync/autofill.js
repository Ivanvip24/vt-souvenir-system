/**
 * AXKAN T1 Auto-fill — Content Script
 * Runs on shipping.t1.com/shippings/create-shipping*
 * Reads client data from URL hash (#axkan=BASE64) and fills the form.
 */

(function () {
  'use strict';

  var h = location.hash;
  if (!h || !h.includes('axkan=')) {
    console.log('[AXKAN T1] No auto-fill data in URL');
    return;
  }

  console.log('[AXKAN T1] Auto-fill data detected, waiting for form...');

  var encoded = h.split('axkan=')[1];
  var json, data;
  try {
    json = decodeURIComponent(escape(atob(encoded)));
    data = JSON.parse(json);
    console.log('[AXKAN T1] Client:', data.name);
  } catch (e) {
    console.error('[AXKAN T1] Failed to decode data:', e);
    return;
  }

  function setInputValue(el, val) {
    var nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSet.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function fillForm() {
    var fname = document.querySelector('input[name="destination.fname"]');
    if (!fname) return false;

    var names = data.name ? data.name.split(' ') : ['', ''];

    // Fill each field
    var fields = {
      'destination.fname': names[0] || '',
      'destination.lname': names.slice(1).join(' ') || '',
      'destination.email': data.email || '',
      'destination.street': data.street || '',
      'destination.extNumber': data.streetNumber || '',
      'destination.postalCode': data.postal || ''
    };

    for (var name in fields) {
      if (!fields[name]) continue;
      var el = document.querySelector('input[name="' + name + '"]');
      if (el) setInputValue(el, fields[name]);
    }

    // Phone has a special selector
    var phoneInput = document.getElementById('phone-input');
    if (phoneInput && data.phone) {
      setInputValue(phoneInput, data.phone.replace(/\D/g, '').slice(-10));
    }

    // Clean hash so it doesn't re-trigger on refresh
    history.replaceState(null, '', location.pathname + location.search);

    // Show success badge
    var badge = document.createElement('div');
    badge.textContent = 'AXKAN: Datos llenados para ' + data.name;
    badge.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;padding:10px 18px;border-radius:8px;font-family:-apple-system,sans-serif;font-size:13px;font-weight:600;color:white;background:#1a73e8;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;';
    document.body.appendChild(badge);
    setTimeout(function () {
      badge.style.opacity = '0';
      setTimeout(function () { badge.remove(); }, 300);
    }, 4000);

    console.log('[AXKAN T1] Form filled successfully');
    return true;
  }

  // T1 is a React SPA — wait for the form inputs to render
  var attempts = 0;
  var interval = setInterval(function () {
    attempts++;
    if (fillForm()) {
      clearInterval(interval);
    }
    if (attempts > 30) {
      clearInterval(interval);
      console.warn('[AXKAN T1] Gave up waiting for form after 15s');
    }
  }, 500);
})();
