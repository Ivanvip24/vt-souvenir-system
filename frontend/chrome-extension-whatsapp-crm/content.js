/**
 * AXKAN WhatsApp CRM — Content Script
 * Injects into WhatsApp Web, detects active chat phone, mounts sidebar.
 */

(function() {
  'use strict';

  var SIDEBAR_WIDTH = 320;
  var sidebarHost = null;
  var sidebarReady = false;
  var currentPhone = null;
  var observer = null;
  var clientCache = {};

  console.log('[AXKAN CRM] Content script loaded');

  // ── Wait for WhatsApp to Load ──────────────────────────

  function waitForApp() {
    var app = document.getElementById('app');
    if (app && app.querySelector('header')) {
      init();
      return;
    }

    var loadObserver = new MutationObserver(function() {
      var app = document.getElementById('app');
      if (app && app.querySelector('header')) {
        loadObserver.disconnect();
        init();
      }
    });

    loadObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { loadObserver.disconnect(); }, 30000);
  }

  // ── Initialize ─────────────────────────────────────────

  function init() {
    console.log('[AXKAN CRM] WhatsApp Web detected, initializing...');
    createSidebarHost();
    observeChatChanges();
  }

  // ── Shadow DOM Host ────────────────────────────────────

  function createSidebarHost() {
    sidebarHost = document.createElement('div');
    sidebarHost.id = 'axkan-crm-host';
    sidebarHost.style.cssText = 'position:fixed;top:0;right:0;width:0;height:100vh;z-index:99999;';
    document.body.appendChild(sidebarHost);

    var shadow = sidebarHost.attachShadow({ mode: 'closed' });

    if (typeof AxkanSidebar !== 'undefined') {
      AxkanSidebar.init(shadow, {
        onToggle: handleSidebarToggle,
        sendMessage: sendToBackground,
        pasteToWhatsApp: pasteToWhatsAppInput,
        getClientCache: function() { return clientCache; },
        setClientCache: function(phone, data) { clientCache[phone] = data; }
      });
      sidebarReady = true;
    } else {
      console.error('[AXKAN CRM] sidebar.js not loaded');
    }
  }

  // ── Sidebar Toggle ─────────────────────────────────────

  function handleSidebarToggle(isOpen) {
    var app = document.getElementById('app') || document.querySelector('._app');
    if (app) {
      app.style.marginRight = isOpen ? SIDEBAR_WIDTH + 'px' : '0';
      app.style.transition = 'margin-right 0.3s ease';
    } else {
      // Fallback: overlay with shadow
      sidebarHost.style.boxShadow = isOpen ? '-4px 0 20px rgba(0,0,0,0.3)' : 'none';
    }
    sidebarHost.style.width = isOpen ? SIDEBAR_WIDTH + 'px' : '0';
    chrome.storage.local.set({ sidebarOpen: isOpen });
  }

  // ── Observe Chat Changes ───────────────────────────────

  function observeChatChanges() {
    var targetNode = document.getElementById('app');
    if (!targetNode) return;

    var debounceTimer = null;

    observer = new MutationObserver(function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        var phone = extractPhoneFromChat();
        if (phone && phone !== currentPhone) {
          currentPhone = phone;
          console.log('[AXKAN CRM] Phone detected:', phone);
          if (sidebarReady) {
            AxkanSidebar.onPhoneDetected(phone);
          }
        }
      }, 500);
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // ── Phone Extraction ───────────────────────────────────

  function extractPhoneFromChat() {
    // Look for the conversation header (second header in WhatsApp Web — first is the app header)
    var headers = document.querySelectorAll('header');
    var chatHeader = headers.length > 1 ? headers[1] : headers[0];
    if (!chatHeader) return null;

    var headerText = chatHeader.textContent || '';

    // Check if this is a group chat
    if (headerText.indexOf('participante') !== -1 || headerText.indexOf('participant') !== -1) {
      return null;
    }

    // Look for phone number patterns
    var phoneMatch = headerText.match(/\+?\d[\d\s\-()]{8,}/);
    if (phoneMatch) {
      return normalizePhone(phoneMatch[0]);
    }

    // Strategy 2: contact info panel
    var contactInfo = document.querySelector('[data-testid="contact-info-drawer"]');
    if (contactInfo) {
      var infoText = contactInfo.textContent || '';
      var infoPhoneMatch = infoText.match(/\+?\d[\d\s\-()]{8,}/);
      if (infoPhoneMatch) {
        return normalizePhone(infoPhoneMatch[0]);
      }
    }

    return null;
  }

  function normalizePhone(raw) {
    var digits = raw.replace(/\D/g, '');
    // Remove +521 prefix (13 digits — Mexico mobile with old prefix)
    if (digits.indexOf('521') === 0 && digits.length === 13) {
      digits = digits.substring(3);
    }
    // Remove +52 prefix (12 digits — Mexico)
    if (digits.indexOf('52') === 0 && digits.length === 12) {
      digits = digits.substring(2);
    }
    // Remove leading 1 if 11 digits
    if (digits.length === 11 && digits.charAt(0) === '1') {
      digits = digits.substring(1);
    }
    return digits.length >= 10 ? digits : null;
  }

  // ── WhatsApp Message Paste ─────────────────────────────

  function pasteToWhatsAppInput(text) {
    var input = document.querySelector('footer [contenteditable="true"]') ||
                document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                document.querySelector('div[role="textbox"][contenteditable="true"]');

    if (!input) {
      console.warn('[AXKAN CRM] WhatsApp input not found');
      return false;
    }

    input.focus();

    // Strategy 1: execCommand (works best with React-controlled inputs)
    document.execCommand('selectAll', false, null);
    var inserted = document.execCommand('insertText', false, text);

    if (!inserted) {
      // Strategy 2: Clipboard fallback
      navigator.clipboard.writeText(text).then(function() {
        console.log('[AXKAN CRM] Text copied to clipboard — user can Ctrl+V');
      });
      return 'clipboard';
    }

    return true;
  }

  // ── Communication with Background ──────────────────────

  function sendToBackground(msg) {
    return new Promise(function(resolve) {
      chrome.runtime.sendMessage(msg, function(res) {
        resolve(res);
      });
    });
  }

  // ── Start ──────────────────────────────────────────────

  waitForApp();
})();
