/**
 * AXKAN WhatsApp CRM — Content Script
 * Injects into WhatsApp Web, detects active chat phone, mounts sidebar.
 */

(function() {
  'use strict';

  var DEFAULT_SIDEBAR_WIDTH = 300;
  var MIN_SIDEBAR_WIDTH = 240;
  var MAX_SIDEBAR_WIDTH = 420;
  var sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
  var sidebarHost = null;
  var sidebarReady = false;
  var currentPhone = null;
  var observer = null;
  var clientCache = {};

  // Restore saved width
  chrome.storage.local.get('sidebarWidth', function(data) {
    if (data.sidebarWidth && data.sidebarWidth >= MIN_SIDEBAR_WIDTH && data.sidebarWidth <= MAX_SIDEBAR_WIDTH) {
      sidebarWidth = data.sidebarWidth;
    }
  });

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
        onResize: handleSidebarResize,
        sendMessage: sendToBackground,
        pasteToWhatsApp: pasteToWhatsAppInput,
        getClientCache: function() { return clientCache; },
        setClientCache: function(phone, data) { clientCache[phone] = data; },
        getWidth: function() { return sidebarWidth; }
      });
      sidebarReady = true;
    } else {
      console.error('[AXKAN CRM] sidebar.js not loaded');
    }
  }

  // ── Sidebar Toggle & Resize ────────────────────────────

  function applySidebarWidth(isOpen, animate) {
    var app = document.getElementById('app') || document.querySelector('._app');
    var w = isOpen ? sidebarWidth : 0;
    if (app) {
      if (animate) {
        app.style.transition = 'width 0.3s ease';
        sidebarHost.style.transition = 'width 0.3s ease';
      } else {
        app.style.transition = 'none';
        sidebarHost.style.transition = 'none';
      }
      // Use width instead of marginRight so WhatsApp's internal flex layout reflows correctly
      app.style.width = isOpen ? 'calc(100% - ' + w + 'px)' : '';
      app.style.marginRight = '0';
    }
    sidebarHost.style.width = w + 'px';
    // Tell sidebar the current width so it can size its panel
    if (sidebarReady && AxkanSidebar.setSidebarWidth) {
      AxkanSidebar.setSidebarWidth(w);
    }
  }

  function handleSidebarToggle(isOpen) {
    applySidebarWidth(isOpen, true);
    chrome.storage.local.set({ sidebarOpen: isOpen });
  }

  function handleSidebarResize(newWidth) {
    newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth));
    sidebarWidth = Math.round(newWidth);
    applySidebarWidth(true, false);
    chrome.storage.local.set({ sidebarWidth: sidebarWidth });
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
    // Strategy 1: Scan ALL headers for a phone number
    // WhatsApp Business Web has 4+ headers; the conversation header varies by version
    var headers = document.querySelectorAll('header');
    for (var i = 0; i < headers.length; i++) {
      var headerText = headers[i].textContent || '';

      // Skip group chats
      if (headerText.indexOf('participante') !== -1 || headerText.indexOf('participant') !== -1 ||
          headerText.indexOf('miembro') !== -1 || headerText.indexOf('member') !== -1) {
        continue;
      }

      var phoneMatch = headerText.match(/\+?\d[\d\s\-()]{8,}/);
      if (phoneMatch) {
        var normalized = normalizePhone(phoneMatch[0]);
        if (normalized) {
          console.log('[AXKAN CRM] Phone found in header', i, ':', phoneMatch[0], '->', normalized);
          return normalized;
        }
      }
    }

    // Strategy 2: Look for the conversation panel title span directly
    var titleSpan = document.querySelector('[data-testid="conversation-info-header-chat-title"] span[title]') ||
                    document.querySelector('[data-testid="conversation-header"] span[title]');
    if (titleSpan) {
      var titleText = titleSpan.getAttribute('title') || titleSpan.textContent || '';
      var titleMatch = titleText.match(/\+?\d[\d\s\-()]{8,}/);
      if (titleMatch) {
        var normalized2 = normalizePhone(titleMatch[0]);
        if (normalized2) {
          console.log('[AXKAN CRM] Phone found in title span:', titleMatch[0], '->', normalized2);
          return normalized2;
        }
      }
    }

    // Strategy 3: contact info panel
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
