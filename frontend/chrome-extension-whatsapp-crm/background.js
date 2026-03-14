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
