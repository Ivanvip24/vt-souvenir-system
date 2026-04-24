# WhatsApp CRM Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that injects a CRM sidebar into WhatsApp Web, letting AXKAN admins view client orders, create new orders, upload files, and send template messages without leaving the chat.

**Architecture:** Manifest V3 extension with a service worker (`background.js`) handling all API calls and JWT storage, a content script (`content.js`) injecting into WhatsApp Web for phone detection, and a sidebar rendered inside Shadow DOM (`sidebar.js`) with all UI logic. Login happens via the extension popup.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, Shadow DOM, WhatsApp Web DOM parsing, AXKAN backend REST API (`vt-souvenir-backend.onrender.com`)

**Spec:** `docs/superpowers/specs/2026-03-13-whatsapp-crm-extension-design.md`

---

## File Structure

```
frontend/chrome-extension-whatsapp-crm/
  manifest.json          # Manifest V3 config, permissions, content script match
  background.js          # Service worker: JWT auth, all API calls via message passing
  content.js             # Content script: phone detection, MutationObserver, sidebar mount
  sidebar.js             # Sidebar UI: inlined HTML/CSS, rendering, events, templates, orders, uploads
  popup.html             # Extension popup: login form UI
  popup.js               # Popup logic: login, status, logout
  popup.css              # Popup styles
  icons/
    icon-16.png          # Extension icon 16px (copy from T1 Sync or generate from JAGUAR.png)
    icon-48.png          # Extension icon 48px
    icon-128.png         # Extension icon 128px
```

**Responsibilities:**

| File | Single Responsibility |
|------|----------------------|
| `manifest.json` | Declares permissions, content script match pattern, service worker, popup |
| `background.js` | Holds JWT in `chrome.storage.local`, proxies all API calls from content script, handles auth state |
| `content.js` | Injects into WhatsApp Web, observes chat switches, extracts phone numbers, mounts sidebar Shadow DOM host, loads `sidebar.js` logic |
| `sidebar.js` | All sidebar UI: CSS strings, HTML templates, rendering functions, event handlers, order list, templates tab, new order form, file uploads. Communicates with `background.js` via `chrome.runtime.sendMessage` |
| `popup.html/js/css` | Admin login form in extension popup. Sends credentials to `background.js`, shows connection status |

---

## Chunk 1: Foundation (manifest, background, popup login)

### Task 1: Create manifest.json

**Files:**
- Create: `frontend/chrome-extension-whatsapp-crm/manifest.json`

- [ ] **Step 1: Create the extension directory and manifest**

```json
{
  "manifest_version": 3,
  "name": "AXKAN WhatsApp CRM",
  "version": "1.0.0",
  "description": "CRM sidebar for WhatsApp Web — view orders, create orders, send templates",
  "permissions": ["storage"],
  "host_permissions": [
    "https://web.whatsapp.com/*",
    "https://vt-souvenir-backend.onrender.com/*"
  ],
  "content_scripts": [{
    "matches": ["https://web.whatsapp.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Create placeholder icons**

Copy icons from the T1 Sync extension as placeholders:
```bash
mkdir -p frontend/chrome-extension-whatsapp-crm/icons
cp frontend/chrome-extension-t1-sync/icons/icon16.png frontend/chrome-extension-whatsapp-crm/icons/icon-16.png
cp frontend/chrome-extension-t1-sync/icons/icon48.png frontend/chrome-extension-whatsapp-crm/icons/icon-48.png
cp frontend/chrome-extension-t1-sync/icons/icon128.png frontend/chrome-extension-whatsapp-crm/icons/icon-128.png
```

- [ ] **Step 3: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/manifest.json frontend/chrome-extension-whatsapp-crm/icons/
git commit -m "feat(whatsapp-crm): create manifest.json with MV3 config and placeholder icons"
```

---

### Task 2: Build background.js (service worker with auth + API proxy)

**Files:**
- Create: `frontend/chrome-extension-whatsapp-crm/background.js`

The background service worker handles:
1. JWT storage in `chrome.storage.local`
2. Login/logout
3. All API calls (proxied from content script via `chrome.runtime.sendMessage`)
4. Auth state checking

- [ ] **Step 1: Create background.js**

```javascript
/**
 * AXKAN WhatsApp CRM — Background Service Worker
 * Handles JWT auth and proxies all API calls from content script.
 */

const API_BASE = 'https://vt-souvenir-backend.onrender.com';

// ── Message Handler ──────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg.type) return false;
  handleMessage(msg).then(sendResponse).catch(err => {
    sendResponse({ success: false, error: err.message });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'LOGIN':
      return handleLogin(msg.username, msg.password);
    case 'LOGOUT':
      return handleLogout();
    case 'CHECK_AUTH':
      return checkAuth();
    case 'API_CALL':
      return proxyApiCall(msg.method, msg.endpoint, msg.body, msg.auth);
    case 'UPLOAD_FILE':
      return proxyFileUpload(msg.endpoint, msg.fileData, msg.fileName, msg.mimeType, msg.extraFields);
    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// ── Auth ─────────────────────────────────────────────────

async function handleLogin(username, password) {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.success && data.token) {
    await chrome.storage.local.set({ jwt: data.token, user: data.user });
    return { success: true, user: data.user };
  }
  return { success: false, error: data.error || 'Login failed' };
}

async function handleLogout() {
  await chrome.storage.local.remove(['jwt', 'user']);
  return { success: true };
}

async function checkAuth() {
  const { jwt, user } = await chrome.storage.local.get(['jwt', 'user']);
  return { success: true, authenticated: !!jwt, user: user || null };
}

async function getToken() {
  const { jwt } = await chrome.storage.local.get('jwt');
  return jwt || null;
}

// ── API Proxy ────────────────────────────────────────────

async function proxyApiCall(method, endpoint, body, requiresAuth) {
  const headers = { 'Content-Type': 'application/json' };

  if (requiresAuth !== false) {
    const token = await getToken();
    if (!token) return { success: false, error: 'Not authenticated', authExpired: true };
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method: method || 'GET', headers };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, options);

  if (res.status === 401) {
    return { success: false, error: 'Session expired', authExpired: true };
  }

  const data = await res.json();
  return data;
}

// ── File Upload Proxy ────────────────────────────────────

async function proxyFileUpload(endpoint, fileData, fileName, mimeType, extraFields) {
  // Convert base64 back to blob
  const byteString = atob(fileData);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, fileName);

  // Add any extra fields (like phone for upload-proof)
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
  }

  const headers = {};
  const token = await getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData
  });

  const data = await res.json();
  return data;
}
```

- [ ] **Step 2: Verify it loads by loading extension in Chrome**

Go to `chrome://extensions` → Enable Developer Mode → Load unpacked → Select `frontend/chrome-extension-whatsapp-crm/`
Expected: Extension loads without errors. Click "Service Worker" link to verify `background.js` is running.

- [ ] **Step 3: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/background.js
git commit -m "feat(whatsapp-crm): add background.js service worker with auth + API proxy"
```

---

### Task 3: Build popup (login form)

**Files:**
- Create: `frontend/chrome-extension-whatsapp-crm/popup.html`
- Create: `frontend/chrome-extension-whatsapp-crm/popup.css`
- Create: `frontend/chrome-extension-whatsapp-crm/popup.js`

- [ ] **Step 1: Create popup.html**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="popup">
    <div class="header">
      <img src="icons/icon-48.png" alt="AXKAN" class="logo">
      <h1>AXKAN CRM</h1>
    </div>

    <!-- Login Form -->
    <form id="loginForm" class="login-form">
      <input type="text" id="username" placeholder="Usuario" required autocomplete="username">
      <input type="password" id="password" placeholder="Contraseña" required autocomplete="current-password">
      <button type="submit" id="loginBtn">Iniciar sesión</button>
      <p id="loginError" class="error" hidden></p>
    </form>

    <!-- Logged In State -->
    <div id="loggedIn" class="logged-in" hidden>
      <p class="status">Conectado como <strong id="userName"></strong></p>
      <p class="hint">Abre WhatsApp Web para usar el sidebar CRM</p>
      <button id="logoutBtn" class="logout-btn">Cerrar sesión</button>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  width: 280px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
}

.popup { padding: 20px; }

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.header .logo { width: 32px; height: 32px; }
.header h1 { font-size: 16px; color: #e72a88; }

.login-form { display: flex; flex-direction: column; gap: 10px; }

.login-form input {
  padding: 10px 12px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #16213e;
  color: #e0e0e0;
  font-size: 13px;
  outline: none;
}

.login-form input:focus { border-color: #e72a88; }

.login-form button {
  padding: 10px;
  background: #e72a88;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.login-form button:hover { background: #c91f73; }
.login-form button:disabled { background: #555; cursor: not-allowed; }

.error { color: #ef4444; font-size: 12px; margin-top: 4px; }

.logged-in { text-align: center; }
.status { font-size: 13px; margin-bottom: 8px; }
.hint { font-size: 11px; color: #888; margin-bottom: 16px; }

.logout-btn {
  padding: 8px 16px;
  background: transparent;
  color: #888;
  border: 1px solid #444;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.logout-btn:hover { color: #ef4444; border-color: #ef4444; }
```

- [ ] **Step 3: Create popup.js**

```javascript
/**
 * AXKAN WhatsApp CRM — Popup (Login/Status)
 */

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const loggedInDiv = document.getElementById('loggedIn');
const userNameSpan = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');

// Check auth state on popup open
chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (res) => {
  if (res?.authenticated) {
    showLoggedIn(res.user);
  } else {
    showLoginForm();
  }
});

// Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Conectando...';

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  chrome.runtime.sendMessage({ type: 'LOGIN', username, password }, (res) => {
    if (res?.success) {
      showLoggedIn(res.user);
    } else {
      loginError.textContent = res?.error || 'Error al iniciar sesión';
      loginError.hidden = false;
      loginBtn.disabled = false;
      loginBtn.textContent = 'Iniciar sesión';
    }
  });
});

// Logout
logoutBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
    showLoginForm();
  });
});

function showLoggedIn(user) {
  loginForm.hidden = true;
  loggedInDiv.hidden = false;
  userNameSpan.textContent = user?.username || 'Admin';
}

function showLoginForm() {
  loginForm.hidden = false;
  loggedInDiv.hidden = true;
  loginBtn.disabled = false;
  loginBtn.textContent = 'Iniciar sesión';
}
```

- [ ] **Step 4: Test popup login flow**

1. Load/reload extension in `chrome://extensions`
2. Click the extension icon → popup appears with login form
3. Enter admin credentials → should show "Conectado como Admin"
4. Click extension icon again → should show logged-in state (persisted)
5. Click "Cerrar sesión" → should show login form again

- [ ] **Step 5: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/popup.html frontend/chrome-extension-whatsapp-crm/popup.css frontend/chrome-extension-whatsapp-crm/popup.js
git commit -m "feat(whatsapp-crm): add popup login form with auth flow"
```

---

## Chunk 2: Content Script + Phone Detection

### Task 4: Create content.js (WhatsApp Web injection + phone detection)

**Files:**
- Create: `frontend/chrome-extension-whatsapp-crm/content.js`

The content script:
1. Waits for WhatsApp Web to fully load
2. Creates a Shadow DOM host element for the sidebar
3. Watches for chat switches via MutationObserver
4. Extracts phone numbers from the chat header
5. Passes phone to sidebar for lookup

**Important WhatsApp Web DOM notes:**
- WhatsApp Web is a React app with frequently changing class names
- The chat header contains the contact name/phone
- The message input is a `div[contenteditable]` inside the footer area
- We should use broad selectors and `data-*` attributes where possible, falling back to structural queries

- [ ] **Step 1: Create content.js**

```javascript
/**
 * AXKAN WhatsApp CRM — Content Script
 * Injects into WhatsApp Web, detects active chat phone, mounts sidebar.
 */

(function() {
  'use strict';

  const SIDEBAR_WIDTH = 320;
  let sidebarHost = null;
  let sidebarReady = false;
  let currentPhone = null;
  let observer = null;
  let clientCache = {};

  console.log('[AXKAN CRM] Content script loaded');

  // ── Wait for WhatsApp to Load ──────────────────────────

  function waitForApp() {
    const app = document.getElementById('app');
    if (app && app.querySelector('header')) {
      init();
      return;
    }

    const loadObserver = new MutationObserver(() => {
      const app = document.getElementById('app');
      if (app && app.querySelector('header')) {
        loadObserver.disconnect();
        init();
      }
    });

    loadObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => loadObserver.disconnect(), 30000);
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

    const shadow = sidebarHost.attachShadow({ mode: 'closed' });

    // Load sidebar module
    if (typeof AxkanSidebar !== 'undefined') {
      AxkanSidebar.init(shadow, {
        onToggle: handleSidebarToggle,
        sendMessage: sendToBackground,
        pasteToWhatsApp: pasteToWhatsAppInput,
        getClientCache: () => clientCache,
        setClientCache: (phone, data) => { clientCache[phone] = data; }
      });
      sidebarReady = true;
    } else {
      console.error('[AXKAN CRM] sidebar.js not loaded');
    }
  }

  // ── Sidebar Toggle ─────────────────────────────────────

  function handleSidebarToggle(isOpen) {
    const app = document.getElementById('app') || document.querySelector('._app');
    if (app) {
      // Compress WhatsApp's layout to make room
      app.style.marginRight = isOpen ? `${SIDEBAR_WIDTH}px` : '0';
      app.style.transition = 'margin-right 0.3s ease';
    } else {
      // Fallback: overlay with shadow (no compression)
      sidebarHost.style.boxShadow = isOpen ? '-4px 0 20px rgba(0,0,0,0.3)' : 'none';
    }
    sidebarHost.style.width = isOpen ? `${SIDEBAR_WIDTH}px` : '0';
    // Persist state
    chrome.storage.local.set({ sidebarOpen: isOpen });
  }

  // ── Observe Chat Changes ───────────────────────────────

  function observeChatChanges() {
    // Watch for changes in the main chat area (conversation switches)
    const targetNode = document.getElementById('app');
    if (!targetNode) return;

    let debounceTimer = null;

    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const phone = extractPhoneFromChat();
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
    // Strategy 1: Look for phone in the chat header (unsaved contacts show the number)
    const header = document.querySelector('header');
    if (!header) return null;

    // Get the contact title/name span in the header
    const headerText = header.textContent || '';

    // Check if this is a group chat (groups show member count or member names)
    if (headerText.includes('participante') || headerText.includes('participant')) {
      return null; // Group chat — skip
    }

    // Look for phone number patterns in the header
    const phoneMatch = headerText.match(/\+?\d[\d\s\-()]{8,}/);
    if (phoneMatch) {
      return normalizePhone(phoneMatch[0]);
    }

    // Strategy 2: Look in the contact info panel (when user clicks on contact name)
    const contactInfo = document.querySelector('[data-testid="contact-info-drawer"]');
    if (contactInfo) {
      const infoText = contactInfo.textContent || '';
      const infoPhoneMatch = infoText.match(/\+?\d[\d\s\-()]{8,}/);
      if (infoPhoneMatch) {
        return normalizePhone(infoPhoneMatch[0]);
      }
    }

    return null;
  }

  function normalizePhone(raw) {
    // Strip everything except digits
    let digits = raw.replace(/\D/g, '');
    // Remove country code +521 (Mexico mobile with old prefix)
    if (digits.startsWith('521') && digits.length === 13) {
      digits = digits.substring(3);
    }
    // Remove country code +52 (Mexico)
    if (digits.startsWith('52') && digits.length === 12) {
      digits = digits.substring(2);
    }
    // Remove leading 1 if 11 digits (some Mexican numbers include area prefix)
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.substring(1);
    }
    // Should be 10 digits for Mexican numbers
    return digits.length >= 10 ? digits : null;
  }

  // ── WhatsApp Message Paste ─────────────────────────────

  function pasteToWhatsAppInput(text) {
    // Find the message input (contenteditable div in footer)
    const input = document.querySelector('footer [contenteditable="true"]') ||
                  document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                  document.querySelector('div[role="textbox"][contenteditable="true"]');

    if (!input) {
      console.warn('[AXKAN CRM] WhatsApp input not found');
      return false;
    }

    // Focus the input
    input.focus();

    // Strategy 1: execCommand (works best with React-controlled inputs like WhatsApp)
    document.execCommand('selectAll', false, null);
    const inserted = document.execCommand('insertText', false, text);

    if (!inserted) {
      // Strategy 2: Clipboard API fallback — copy text, user presses Ctrl+V
      navigator.clipboard.writeText(text).then(() => {
        console.log('[AXKAN CRM] Text copied to clipboard — user can Ctrl+V');
      });
      return 'clipboard'; // Signal to UI to show "Copiado! Presiona Ctrl+V"
    }

    return true;
  }

  // ── Communication with Background ──────────────────────

  function sendToBackground(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (res) => {
        resolve(res);
      });
    });
  }

  // ── Start ──────────────────────────────────────────────

  waitForApp();
})();
```

- [ ] **Step 2: Update manifest.json to include sidebar.js in content_scripts**

The manifest needs to load both `content.js` and `sidebar.js` as content scripts (sidebar.js first so `AxkanSidebar` is available):

```json
"content_scripts": [{
  "matches": ["https://web.whatsapp.com/*"],
  "js": ["sidebar.js", "content.js"],
  "run_at": "document_idle"
}]
```

- [ ] **Step 3: Create a minimal sidebar.js stub so content.js loads without errors**

```javascript
/**
 * AXKAN WhatsApp CRM — Sidebar (stub for Task 4)
 * Full implementation in Task 5+
 */

const AxkanSidebar = {
  shadow: null,
  config: null,

  init(shadowRoot, config) {
    this.shadow = shadowRoot;
    this.config = config;
    console.log('[AXKAN CRM] Sidebar stub initialized');

    // Minimal toggle button
    const style = document.createElement('style');
    style.textContent = `
      .axkan-toggle {
        position: fixed; top: 50%; right: 0; transform: translateY(-50%);
        width: 36px; height: 36px; background: #e72a88; color: white;
        border: none; border-radius: 8px 0 0 8px; cursor: pointer;
        font-size: 16px; font-weight: bold; z-index: 1;
        display: flex; align-items: center; justify-content: center;
      }
    `;
    shadowRoot.appendChild(style);

    const btn = document.createElement('button');
    btn.className = 'axkan-toggle';
    btn.textContent = 'A';
    btn.title = 'AXKAN CRM';
    btn.addEventListener('click', () => {
      console.log('[AXKAN CRM] Toggle clicked (stub)');
    });
    shadowRoot.appendChild(btn);
  },

  onPhoneDetected(phone) {
    console.log('[AXKAN CRM] Phone detected (stub):', phone);
  }
};
```

- [ ] **Step 4: Test phone detection**

1. Reload extension in `chrome://extensions`
2. Open `https://web.whatsapp.com`
3. Click on a chat with an unsaved contact (shows phone number in header)
4. Open DevTools console → look for `[AXKAN CRM] Phone detected: 55XXXXXXXX`
5. Verify the pink "A" toggle button appears on the right edge
6. Switch to another chat → verify new phone is logged

- [ ] **Step 5: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/content.js frontend/chrome-extension-whatsapp-crm/sidebar.js frontend/chrome-extension-whatsapp-crm/manifest.json
git commit -m "feat(whatsapp-crm): add content script with phone detection and sidebar stub"
```

---

## Chunk 3: Sidebar UI (full implementation)

### Task 5: Build sidebar.js — Core UI, CSS, and client lookup

**Files:**
- Modify: `frontend/chrome-extension-whatsapp-crm/sidebar.js`

Replace the stub with the full sidebar implementation. This task covers:
- Full CSS (inlined as string)
- Sidebar layout (header, tabs, content area)
- Toggle open/close with WhatsApp compression
- Client lookup via phone → display client info + orders list
- Loading/error states

- [ ] **Step 1: Write the full sidebar.js with CSS, layout, and client lookup**

Replace the entire `sidebar.js` stub with the full implementation. The complete code is provided in a separate reference section at the end of this plan (see **Appendix A: sidebar.js Complete Code**).

**Key architecture decisions in the code:**

1. **CSS** is a single template string (`SIDEBAR_CSS`) injected into Shadow DOM via `<style>` element
2. **DOM construction** uses `document.createElement` and `textContent` for all user data (XSS-safe). Only static structural HTML uses template strings.
3. **`AxkanSidebar`** is a global object with stub methods for Tasks 6-9 that get replaced incrementally
4. **Client lookup flow:**
   - Check `config.getClientCache()` for cached data → render if found
   - Show loading state
   - `sendMessage({ type: 'API_CALL', method: 'GET', endpoint: '/api/clients/search?phone=' + phone })` → get client matches
   - If found: fetch full details via `GET /api/clients/{id}` → get order list
   - Cache result, render client header + order cards
   - If not found: render "New client" state with phone pre-filled
5. **Order cards** show: order number, status badge (color-coded), date, total price. Click to expand (Task 6).
6. **Auth expired handling**: On 401 response, show red banner with re-login link
7. **Error/loading states**: Loading spinner, error with retry button, empty state with "Nuevo Pedido" button
8. **Status badge colors** use the `STATUS_COLORS` map; unknown statuses render gray
9. **`GET /api/orders/:orderId` items do NOT include `size`** — Task 6 renders items with product name, quantity, unit price, and line total only

**CSS constants:**
- Background: `#1a1a2e` (dark), cards: `#16213e`
- Rosa Mexicano: `#e72a88`, Verde Selva: `#8ab73b`
- Font: system font stack, sidebar width: `320px`

**Status badge color map:**
```javascript
const STATUS_COLORS = {
  pending: '#3b82f6', new: '#3b82f6',
  design: '#8b5cf6',
  production: '#f97316', printing: '#f97316',
  cutting: '#eab308',
  counting: '#6366f1',
  shipping: '#14b8a6', in_transit: '#14b8a6',
  delivered: '#8ab73b',
  cancelled: '#ef4444'
};
// Default for unknown: '#6b7280' (gray)
```

**Implementation notes for the agentic worker:**
- All user-facing text rendered with `textContent` (not innerHTML) to prevent XSS
- Static structural HTML can use template strings since it contains no user data
- Include retry logic in `onPhoneDetected`: if API call fails with network error, retry up to 3 times with 5s intervals, then show "No se pudo conectar" with manual retry button (handles Render cold starts)
- Include a `resolveTemplate(template, data)` function stub that Task 7 will use — it replaces `{varName}` with values from client/order data, and returns `null` if any required variable is missing (showing `[sin dato]` placeholder)
- The `showAuthExpired()` method must display a banner at the top of the sidebar with a link to trigger the popup re-login

- [ ] **Step 2: Test sidebar renders on WhatsApp Web**

1. Reload extension
2. Open WhatsApp Web
3. Click the AXKAN toggle → sidebar slides in, WhatsApp compresses
4. Click on a chat → sidebar shows loading → client info (or "New client")
5. Close sidebar → WhatsApp expands back

- [ ] **Step 3: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/sidebar.js
git commit -m "feat(whatsapp-crm): build sidebar UI with client lookup and order list"
```

---

### Task 6: Add order expansion (full details on click)

**Files:**
- Modify: `frontend/chrome-extension-whatsapp-crm/sidebar.js`

When an order card is clicked, fetch full details from `GET /api/orders/:orderId` and render:
- Line items (product name, quantity, size, unit price, line total)
- Design file thumbnails (if any)
- Payment status (deposit paid, remaining balance)
- Shipping/tracking info (if available)
- Quick action buttons: Copy order #, Copy tracking, Open in admin panel

- [ ] **Step 1: Add order detail expansion**

Add `expandOrder(orderId, cardElement)` function:
1. Call `GET /api/orders/${orderId}` via background
2. Parse response: items, deposit, tracking, attachments
3. Render expanded content below the order card
4. Add quick action buttons

**Quick action: "Open in admin panel"** opens:
`https://vt-souvenir-frontend.onrender.com/admin-dashboard/index.html#order-${orderId}`

**Quick action: "Copy order #"** uses `navigator.clipboard.writeText(orderNumber)`

**Quick action: "Copy tracking"** copies the first tracking number from shipping labels

- [ ] **Step 2: Test order expansion**

1. Open WhatsApp Web, click on a client's chat
2. Sidebar shows their orders
3. Click on an order → expands to show items, payment, tracking
4. Click "Copy order #" → verify clipboard has order number
5. Click "Open in admin" → new tab opens to admin panel

- [ ] **Step 3: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/sidebar.js
git commit -m "feat(whatsapp-crm): add order detail expansion with quick actions"
```

---

### Task 7: Add template messages tab

**Files:**
- Modify: `frontend/chrome-extension-whatsapp-crm/sidebar.js`

Add a "Templates" tab to the sidebar with 6 pre-built messages. Each template:
- Shows the template name and a preview of the message
- On click: resolves variables from the active order data, calls `config.pasteToWhatsApp(resolvedText)`
- Disabled (grayed out) if required variables can't be resolved

- [ ] **Step 1: Add templates tab and variable resolution**

```javascript
const TEMPLATES = [
  { name: 'Pedido recibido', msg: 'Hola {name}! Tu pedido {orderNumber} ha sido recibido. Te mantendremos informado del avance.', requires: ['name', 'orderNumber'] },
  { name: 'Diseño listo', msg: 'Hola {name}! Tu diseño para el pedido {orderNumber} está listo. Te lo comparto para tu aprobación.', requires: ['name', 'orderNumber'] },
  { name: 'En producción', msg: 'Hola {name}! Tu pedido {orderNumber} ya está en producción. Te avisamos cuando esté listo.', requires: ['name', 'orderNumber'] },
  { name: 'Listo para envío', msg: 'Hola {name}! Tu pedido {orderNumber} está listo para envío. El total restante es ${remaining}.', requires: ['name', 'orderNumber', 'remaining'] },
  { name: 'Número de rastreo', msg: 'Hola {name}! Tu pedido {orderNumber} ya fue enviado. Tu número de rastreo es: {tracking} ({carrier}).', requires: ['name', 'orderNumber', 'tracking', 'carrier'] },
  { name: 'Recordatorio de pago', msg: 'Hola {name}! Te recordamos que tu pedido {orderNumber} tiene un saldo pendiente de ${remaining}.', requires: ['name', 'orderNumber', 'remaining'] }
];
```

`resolveTemplate(template, data)` function replaces `{varName}` with values from the current client/order data. If a required variable is missing, the template button is disabled.

- [ ] **Step 2: Test template messages**

1. Open WhatsApp Web, navigate to a client chat
2. Sidebar shows client + orders
3. Click "Templates" tab
4. Click "Pedido recibido" → WhatsApp input field fills with the resolved message
5. Verify tracking template is disabled if no tracking exists
6. User can edit the text and hit Enter to send

- [ ] **Step 3: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/sidebar.js
git commit -m "feat(whatsapp-crm): add template messages tab with variable resolution"
```

---

## Chunk 4: Order Creation + File Uploads

### Task 8: Add new order form

**Files:**
- Modify: `frontend/chrome-extension-whatsapp-crm/sidebar.js`

Add expandable "New Order" form to the sidebar:
- Pre-fills client info (name, phone, email) from lookup
- For new clients: shows name + email fields
- Product dropdown (loaded from `GET /api/client/products`, auth: none)
- Quantity input, size variant selector
- "+ Add item" button for multi-product orders
- Submit button calls `POST /api/orders` via background

- [ ] **Step 1: Add order form UI and product loading**

On sidebar init (or first open), call `GET /api/client/products` (no auth needed) and cache the product list. Use it to populate the product dropdown.

Product sizes come from the product data. When product is selected, populate size options.

Form submit flow:
1. Build request body per spec (clientName, clientPhone, clientEmail, items array, eventType, notes)
2. Call `{ type: 'API_CALL', method: 'POST', endpoint: '/api/orders', body: orderData }`
3. On success: show order number, refresh orders list, offer "Share confirmation" template
4. On error: show error toast, keep form filled

- [ ] **Step 2: Test order creation**

1. Open WhatsApp Web → click on a chat
2. Click "New Order" button in sidebar
3. Select product, enter qty, select size
4. Click "Crear pedido"
5. Verify order created (order number shown)
6. Check admin dashboard to confirm order appears

- [ ] **Step 3: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/sidebar.js
git commit -m "feat(whatsapp-crm): add new order form with product selector"
```

---

### Task 9: Add file upload (design files + payment proof)

**Files:**
- Modify: `frontend/chrome-extension-whatsapp-crm/sidebar.js`
- Modify: `frontend/chrome-extension-whatsapp-crm/background.js` (if needed for file handling)

Two upload flows:
1. **Design files during order creation:** Drag-and-drop zone or file picker per item in the new order form
2. **On existing orders:** "Upload design" and "Upload proof" buttons on each expanded order card

File upload process:
1. User picks file → read as base64 via `FileReader`
2. Send to background: `{ type: 'UPLOAD_FILE', endpoint, fileData, fileName, mimeType, extraFields }`
3. Background reconstructs the blob and sends as `FormData`
4. Design files: `POST /api/client/upload-file` → returns Google Drive URL
5. Payment proof: `POST /api/client/orders/:orderId/upload-proof` → attaches to order
6. After upload: attach to order item via `POST /api/orders/:orderId/items/:itemId/attachment`

- [ ] **Step 1: Add file upload UI and logic**

For the order form:
- Add a drop zone per item line: "Arrastra un archivo o haz clic para seleccionar"
- Show thumbnail preview after selection
- Files upload on form submit (before order creation)

For existing orders (expanded view):
- Add "Subir diseño" button → file picker → uploads to Google Drive
- Add "Subir comprobante" button → file picker → uploads as payment proof
- Show progress bar during upload, green checkmark on success

- [ ] **Step 2: Test file uploads**

1. Create a new order with a design file attached → verify file appears in Google Drive
2. On an existing order, click "Subir comprobante" → pick an image → verify upload succeeds
3. Test drag-and-drop on the design file zone

- [ ] **Step 3: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/sidebar.js frontend/chrome-extension-whatsapp-crm/background.js
git commit -m "feat(whatsapp-crm): add file upload for design files and payment proof"
```

---

## Chunk 5: Polish + Manual Phone Input + Final Testing

### Task 10: Add manual phone input fallback

**Files:**
- Modify: `frontend/chrome-extension-whatsapp-crm/sidebar.js`

When the content script can't detect a phone number (saved contact with no visible phone, or user wants to look up a different client), the sidebar header shows a manual phone input field.

- [ ] **Step 1: Add manual phone search**

Add a small search bar at the top of the sidebar (below header):
- Text input with placeholder "Buscar por teléfono..."
- Search icon button
- On submit: calls the same `onPhoneDetected(phone)` flow
- Clear button to reset

Also restore sidebar state from `chrome.storage.local`:
- On init, check if sidebar was open → restore open state
- Save toggle state on every open/close

- [ ] **Step 2: Test manual search**

1. Open WhatsApp Web → open a group chat (phone not detected)
2. Sidebar shows "No se detectó teléfono" with manual input
3. Type a known client phone → sidebar loads their data
4. Close and reopen WhatsApp Web → sidebar remembers open/closed state

- [ ] **Step 3: Commit**

```bash
git add frontend/chrome-extension-whatsapp-crm/sidebar.js
git commit -m "feat(whatsapp-crm): add manual phone search and sidebar state persistence"
```

---

### Task 11: Final integration test

**Files:** None (testing only)

- [ ] **Step 1: Full flow test**

Test the complete workflow end-to-end:

1. Load extension → login via popup → "Conectado como Admin"
2. Open WhatsApp Web → toggle button appears
3. Click toggle → sidebar opens, WhatsApp compresses
4. Click on a chat with a known client → client info loads, orders shown
5. Expand an order → items, payment status, tracking visible
6. Click "Copy order #" → verify clipboard
7. Click "Open in admin" → admin panel opens
8. Click "Templates" tab → click a template → message pastes into WhatsApp input
9. Click "New Order" → fill form → add design file → submit → order created
10. On existing order, upload payment proof → success
11. Switch to another chat → new client loads
12. Switch back → cached data loads instantly
13. Close sidebar → WhatsApp expands
14. Reload page → sidebar remembers state
15. Test with saved contact (no phone visible) → manual search works
16. Test with group chat → sidebar hides/shows "No se detectó teléfono"

- [ ] **Step 2: Error state testing**

1. Logout from popup → sidebar shows "Sesión expirada" banner
2. Turn off network → sidebar shows "No se pudo conectar" with retry
3. Try creating order with missing fields → form validation prevents submit

- [ ] **Step 3: Final commit**

```bash
git add -A frontend/chrome-extension-whatsapp-crm/
git commit -m "feat(whatsapp-crm): complete WhatsApp CRM extension v1.0"
```

---

## Summary

| Task | Description | Chunk |
|------|-------------|-------|
| 1 | manifest.json + icons | 1: Foundation |
| 2 | background.js (service worker, auth, API proxy) | 1: Foundation |
| 3 | popup.html/js/css (login form) | 1: Foundation |
| 4 | content.js (phone detection, sidebar mount) | 2: Content Script |
| 5 | sidebar.js (core UI, CSS, client lookup, orders) | 3: Sidebar UI |
| 6 | Order expansion (full details, quick actions) | 3: Sidebar UI |
| 7 | Template messages tab | 3: Sidebar UI |
| 8 | New order form | 4: Orders + Uploads |
| 9 | File uploads (design + payment proof) | 4: Orders + Uploads |
| 10 | Manual phone input + state persistence | 5: Polish |
| 11 | Full integration test | 5: Polish |
