// ==UserScript==
// @name         AXKAN → T1 Envios Auto-fill
// @namespace    https://axkan.art
// @version      1.0
// @description  Auto-fills T1 Envios shipping form with AXKAN client data
// @match        https://shipping.t1.com/shippings/create-shipping*
// @match        https://shipping.t1envios.com/shippings/create-shipping*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  function tryFill() {
    var h = location.hash;
    if (!h || !h.includes('axkan=')) return false;

    var encoded = h.split('axkan=')[1];
    if (!encoded) return false;

    try {
      var json = decodeURIComponent(escape(atob(encoded)));
      var d = JSON.parse(json);

      function setVal(name, val) {
        if (!val) return;
        var el = document.querySelector('input[name="' + name + '"]');
        if (!el) return;
        var nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      var names = d.name ? d.name.split(' ') : ['', ''];
      setVal('destination.fname', names[0] || '');
      setVal('destination.lname', names.slice(1).join(' ') || '');
      setVal('destination.email', d.email);
      setVal('destination.street', d.street);
      setVal('destination.extNumber', d.streetNumber);
      setVal('destination.postalCode', d.postal);

      // Phone input has a different selector
      var phoneInput = document.getElementById('phone-input');
      if (phoneInput && d.phone) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        ns.call(phoneInput, d.phone.replace(/\D/g, '').slice(-10));
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Clean the hash so it doesn't re-trigger
      history.replaceState(null, '', location.pathname + location.search);

      console.log('[AXKAN] T1 form auto-filled for:', d.name);
      return true;
    } catch (e) {
      console.error('[AXKAN] Auto-fill error:', e);
      return false;
    }
  }

  // T1 is a React SPA — inputs may not exist immediately. Retry until they appear.
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    var inputs = document.querySelector('input[name="destination.fname"]');
    if (inputs) {
      clearInterval(interval);
      // Small delay for React to fully hydrate
      setTimeout(function() { tryFill(); }, 500);
    }
    if (attempts > 30) clearInterval(interval); // Give up after 15s
  }, 500);
})();
