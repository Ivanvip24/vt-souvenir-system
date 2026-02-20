/**
 * WhatsApp Conversations Module
 * Split-panel chat interface for managing WhatsApp AI conversations
 */

// ==========================================
// STATE
// ==========================================

const waState = {
  conversations: [],
  filteredConversations: [],
  selectedConversationId: null,
  messages: [],
  searchQuery: '',
  pollingInterval: null,
  mobileShowChat: false,
  pendingImageUrl: null
};

// ==========================================
// STYLES
// ==========================================

function injectWhatsAppStyles() {
  if (document.getElementById('whatsapp-styles')) return;

  const style = document.createElement('style');
  style.id = 'whatsapp-styles';
  style.textContent = `
    .wa-layout {
      display: flex;
      height: calc(100vh - 120px);
      background: #fff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      border: 1px solid #e5e7eb;
    }

    /* Left panel - conversation list */
    .wa-list-panel {
      width: 360px;
      min-width: 300px;
      border-right: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      background: #fff;
    }

    .wa-list-header {
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .wa-list-title {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .wa-search-input {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    .wa-search-input:focus {
      border-color: #e72a88;
    }

    .wa-search-input::placeholder {
      color: #aaa;
    }

    .wa-conv-list {
      flex: 1;
      overflow-y: auto;
    }

    .wa-conv-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      cursor: pointer;
      transition: background 0.15s;
      border-bottom: 1px solid #f5f5f5;
      position: relative;
    }

    .wa-conv-item:hover {
      background: #faf5f8;
    }

    .wa-conv-item.active {
      background: #fdf2f8;
      border-left: 3px solid #e72a88;
      padding-left: 13px;
    }

    .wa-conv-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e72a88 0%, #f39223 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 16px;
      flex-shrink: 0;
    }

    .wa-conv-info {
      flex: 1;
      min-width: 0;
    }

    .wa-conv-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .wa-conv-name {
      font-weight: 600;
      font-size: 14px;
      color: #1a1a1a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
    }

    .wa-conv-time {
      font-size: 11px;
      color: #999;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .wa-conv-preview {
      font-size: 13px;
      color: #777;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .wa-conv-meta {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .wa-intent-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    .wa-intent-order { background: #dcfce7; color: #166534; }
    .wa-intent-pricing { background: #dbeafe; color: #1e40af; }
    .wa-intent-question { background: #fef9c3; color: #854d0e; }
    .wa-intent-complaint { background: #fee2e2; color: #991b1b; }
    .wa-intent-greeting { background: #f3f4f6; color: #4b5563; }

    .wa-unread-count {
      background: #e72a88;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      min-width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
    }

    /* Right panel - chat view */
    .wa-chat-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #fafafa;
      min-width: 0;
    }

    .wa-chat-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #aaa;
      gap: 12px;
      padding: 40px;
      text-align: center;
    }

    .wa-chat-empty-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }

    .wa-chat-header {
      padding: 16px 20px;
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .wa-chat-header-info {
      flex: 1;
      min-width: 0;
    }

    .wa-chat-header-name {
      font-weight: 700;
      font-size: 16px;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .wa-chat-header-phone {
      font-size: 13px;
      color: #888;
      margin-top: 2px;
    }

    .wa-chat-header-summary {
      font-size: 12px;
      color: #666;
      margin-top: 6px;
      padding: 6px 10px;
      background: #f9fafb;
      border-radius: 8px;
      border-left: 3px solid #e72a88;
      line-height: 1.4;
    }

    .wa-back-btn {
      display: none;
      background: none;
      border: none;
      cursor: pointer;
      color: #e72a88;
      font-size: 20px;
      padding: 4px;
      margin-right: 4px;
      flex-shrink: 0;
    }

    .wa-messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .wa-msg {
      max-width: 75%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.45;
      word-wrap: break-word;
      position: relative;
    }

    .wa-msg-inbound {
      align-self: flex-start;
      background: #e8e8e8;
      color: #1a1a1a;
      border-bottom-left-radius: 4px;
    }

    .wa-msg-ai {
      align-self: flex-end;
      background: #fce4ec;
      color: #1a1a1a;
      border-bottom-right-radius: 4px;
    }

    .wa-msg-admin {
      align-self: flex-end;
      background: #e72a88;
      color: #fff;
      border-bottom-right-radius: 4px;
    }

    .wa-msg-time {
      font-size: 10px;
      margin-top: 4px;
      opacity: 0.6;
    }

    .wa-msg-admin .wa-msg-time {
      opacity: 0.75;
    }

    .wa-msg-sender {
      font-size: 10px;
      font-weight: 600;
      margin-bottom: 2px;
      opacity: 0.7;
    }

    /* Input area */
    .wa-input-area {
      padding: 12px 16px;
      background: #fff;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .wa-input-field {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      font-size: 14px;
      outline: none;
      resize: none;
      max-height: 100px;
      min-height: 40px;
      line-height: 1.4;
      font-family: inherit;
      box-sizing: border-box;
    }

    .wa-input-field:focus {
      border-color: #e72a88;
    }

    .wa-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #e72a88;
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s, transform 0.1s;
    }

    .wa-send-btn:hover {
      background: #c91f73;
    }

    .wa-send-btn:active {
      transform: scale(0.94);
    }

    .wa-send-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    /* Empty state */
    .wa-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      color: #888;
      text-align: center;
      height: calc(100vh - 120px);
    }

    .wa-empty-state h3 {
      font-size: 16px;
      color: #555;
      margin-bottom: 8px;
    }

    .wa-empty-state p {
      font-size: 13px;
      color: #999;
      max-width: 320px;
      line-height: 1.5;
    }

    /* Loading */
    .wa-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #aaa;
      font-size: 14px;
    }

    /* Date separator */
    .wa-date-sep {
      text-align: center;
      font-size: 11px;
      color: #999;
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .wa-date-sep::before,
    .wa-date-sep::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #e5e7eb;
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .wa-layout {
        height: calc(100vh - 80px);
        border-radius: 0;
      }

      .wa-list-panel {
        width: 100%;
        min-width: unset;
      }

      .wa-chat-panel {
        display: none;
        position: absolute;
        inset: 0;
        z-index: 10;
      }

      .wa-layout.wa-mobile-chat .wa-list-panel {
        display: none;
      }

      .wa-layout.wa-mobile-chat .wa-chat-panel {
        display: flex;
      }

      .wa-layout.wa-mobile-chat {
        position: relative;
      }

      .wa-back-btn {
        display: flex;
      }

      .wa-msg {
        max-width: 85%;
      }
    }

    /* Media elements in messages */
    .wa-msg-media-img {
      max-width: 250px;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 4px;
      display: block;
    }

    .wa-msg-audio {
      max-width: 250px;
      margin-bottom: 4px;
      display: block;
    }

    .wa-msg-transcription {
      font-size: 12px;
      font-style: italic;
      opacity: 0.7;
      margin-bottom: 4px;
      line-height: 1.3;
    }

    .wa-msg-doc-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: rgba(0,0,0,0.05);
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      font-size: 13px;
      margin-bottom: 4px;
      word-break: break-all;
    }

    .wa-msg-admin .wa-msg-doc-link {
      background: rgba(255,255,255,0.15);
      color: #fff;
    }

    .wa-msg-doc-link:hover {
      background: rgba(0,0,0,0.1);
    }

    .wa-msg-admin .wa-msg-doc-link:hover {
      background: rgba(255,255,255,0.25);
    }

    .wa-msg-thumbnails {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
      margin-bottom: 4px;
    }

    .wa-msg-thumbnail {
      width: 60px;
      height: 60px;
      border-radius: 6px;
      object-fit: cover;
      cursor: pointer;
      border: 1px solid rgba(0,0,0,0.1);
    }

    .wa-img-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #f3f4f6;
      color: #666;
      border: 1px solid #e5e7eb;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s, border-color 0.2s;
    }

    .wa-img-btn:hover {
      background: #e5e7eb;
      border-color: #d1d5db;
    }
  `;
  document.head.appendChild(style);
}

// ==========================================
// UTILITIES
// ==========================================

function waEsc(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function waTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return 'ahora';
  if (mins < 60) return 'hace ' + mins + ' min';
  if (hrs < 24) return 'hace ' + hrs + (hrs === 1 ? ' hora' : ' horas');
  if (days < 30) return 'hace ' + days + (days === 1 ? ' dia' : ' dias');
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function waFormatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function waFormatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function waGetInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

function waGetIntentBadgeHTML(intent) {
  const intents = {
    order:     { emoji: '\uD83D\uDED2', label: 'Pedido',      cls: 'wa-intent-order' },
    pricing:   { emoji: '\uD83D\uDCB0', label: 'Cotizacion',  cls: 'wa-intent-pricing' },
    question:  { emoji: '\u2753',        label: 'Pregunta',    cls: 'wa-intent-question' },
    complaint: { emoji: '\u26A0\uFE0F',  label: 'Queja',       cls: 'wa-intent-complaint' },
    greeting:  { emoji: '\uD83D\uDC4B',  label: 'Saludo',      cls: 'wa-intent-greeting' }
  };
  if (!intent || !intents[intent]) return '';
  const i = intents[intent];
  return '<span class="wa-intent-badge ' + i.cls + '">' + i.emoji + ' ' + i.label + '</span>';
}

function waTruncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

// ==========================================
// DATA LOADING
// ==========================================

async function loadWhatsAppConversations() {
  injectWhatsAppStyles();

  const container = document.getElementById('whatsapp-container');
  if (!container) return;

  // Show loading only on first load
  if (waState.conversations.length === 0) {
    container.textContent = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'wa-loading';
    loadingDiv.textContent = 'Cargando conversaciones...';
    container.appendChild(loadingDiv);
  }

  try {
    const res = await fetch(API_BASE + '/whatsapp/conversations', {
      headers: getAuthHeaders()
    });
    const json = await res.json();

    if (json.success) {
      waState.conversations = json.data || [];
      waFilterConversations();
      renderWhatsApp();
      updateWaUnreadBadge();
      startWhatsAppPolling();
    } else {
      container.textContent = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'wa-loading';
      errDiv.style.color = '#e74c3c';
      errDiv.textContent = 'Error cargando conversaciones';
      container.appendChild(errDiv);
    }
  } catch (err) {
    console.error('Error loading WhatsApp conversations:', err);
    container.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.className = 'wa-loading';
    errDiv.style.color = '#e74c3c';
    errDiv.textContent = 'Error de conexion';
    container.appendChild(errDiv);
  }
}

async function fetchConversationMessages(conversationId) {
  try {
    const res = await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/messages', {
      headers: getAuthHeaders()
    });
    const json = await res.json();
    if (json.success) {
      waState.messages = json.data || [];
      return true;
    }
  } catch (err) {
    console.error('Error loading messages:', err);
  }
  return false;
}

async function markConversationRead(conversationId) {
  try {
    await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/read', {
      method: 'PUT',
      headers: getAuthHeaders()
    });
    const conv = waState.conversations.find(function(c) { return c.id === conversationId; });
    if (conv) conv.unread_count = 0;
    updateWaUnreadBadge();
  } catch (err) {
    console.error('Error marking read:', err);
  }
}

async function sendReply(conversationId, message, imageUrl) {
  try {
    var payload = { message: message };
    if (imageUrl) {
      payload.imageUrl = imageUrl;
    }
    const res = await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/reply', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    return json.success;
  } catch (err) {
    console.error('Error sending reply:', err);
    return false;
  }
}

// ==========================================
// POLLING
// ==========================================

function startWhatsAppPolling() {
  stopWhatsAppPolling();
  waState.pollingInterval = setInterval(async function() {
    try {
      const res = await fetch(API_BASE + '/whatsapp/conversations', {
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success) {
        waState.conversations = json.data || [];
        waFilterConversations();
        renderConversationList();
        updateWaUnreadBadge();

        // If a conversation is open, refresh its messages too
        if (waState.selectedConversationId) {
          const ok = await fetchConversationMessages(waState.selectedConversationId);
          if (ok) renderChatMessages();
        }
      }
    } catch (err) {
      console.error('WhatsApp polling error:', err);
    }
  }, 5000);
}

function stopWhatsAppPolling() {
  if (waState.pollingInterval) {
    clearInterval(waState.pollingInterval);
    waState.pollingInterval = null;
  }
}

function updateWaUnreadBadge() {
  var badge = document.getElementById('wa-unread-badge');
  if (!badge) return;

  var total = 0;
  for (var i = 0; i < waState.conversations.length; i++) {
    total += (waState.conversations[i].unread_count || 0);
  }

  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = 'inline-flex';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

// ==========================================
// FILTERING
// ==========================================

function waFilterConversations() {
  var q = waState.searchQuery.toLowerCase().trim();
  if (!q) {
    waState.filteredConversations = waState.conversations.slice();
  } else {
    waState.filteredConversations = waState.conversations.filter(function(c) {
      var name = (c.client_name || '').toLowerCase();
      var phone = (c.wa_id || '').toLowerCase();
      return name.indexOf(q) !== -1 || phone.indexOf(q) !== -1;
    });
  }
  // Sort by most recent message
  waState.filteredConversations.sort(function(a, b) {
    var dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    var dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return dateB - dateA;
  });
}

// ==========================================
// RENDERING - MAIN LAYOUT
// ==========================================

function renderWhatsApp() {
  var container = document.getElementById('whatsapp-container');
  if (!container) return;

  // Clear container
  container.textContent = '';

  // Empty state: no conversations at all
  if (waState.conversations.length === 0) {
    var emptyWrap = document.createElement('div');
    emptyWrap.className = 'wa-empty-state';

    var iconWrap = document.createElement('div');
    iconWrap.style.cssText = 'width:80px;height:80px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:16px;';
    var iconEl = document.createElement('i');
    iconEl.setAttribute('data-lucide', 'message-circle');
    iconEl.style.cssText = 'width:36px;height:36px;color:#ccc;';
    iconWrap.appendChild(iconEl);
    emptyWrap.appendChild(iconWrap);

    var emptyH3 = document.createElement('h3');
    emptyH3.textContent = 'No hay conversaciones aun';
    emptyWrap.appendChild(emptyH3);

    var emptyP = document.createElement('p');
    emptyP.textContent = 'Los mensajes de WhatsApp apareceran aqui automaticamente.';
    emptyWrap.appendChild(emptyP);

    container.appendChild(emptyWrap);
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Build split-panel layout
  var layout = document.createElement('div');
  layout.className = 'wa-layout';
  layout.id = 'wa-layout';
  if (waState.mobileShowChat && waState.selectedConversationId) {
    layout.classList.add('wa-mobile-chat');
  }

  // --- Left panel ---
  var listPanel = document.createElement('div');
  listPanel.className = 'wa-list-panel';

  var listHeader = document.createElement('div');
  listHeader.className = 'wa-list-header';

  var titleDiv = document.createElement('div');
  titleDiv.className = 'wa-list-title';
  var titleIcon = document.createElement('i');
  titleIcon.setAttribute('data-lucide', 'message-circle');
  titleIcon.style.cssText = 'width:20px;height:20px;color:#25d366;';
  titleDiv.appendChild(titleIcon);
  titleDiv.appendChild(document.createTextNode(' Conversaciones'));
  listHeader.appendChild(titleDiv);

  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'wa-search-input';
  searchInput.id = 'wa-search';
  searchInput.placeholder = 'Buscar por nombre...';
  searchInput.value = waState.searchQuery;
  listHeader.appendChild(searchInput);

  listPanel.appendChild(listHeader);

  var convListDiv = document.createElement('div');
  convListDiv.className = 'wa-conv-list';
  convListDiv.id = 'wa-conv-list';
  buildConversationListDOM(convListDiv);
  listPanel.appendChild(convListDiv);

  layout.appendChild(listPanel);

  // --- Right panel ---
  var chatPanel = document.createElement('div');
  chatPanel.className = 'wa-chat-panel';
  chatPanel.id = 'wa-chat-panel';

  if (waState.selectedConversationId) {
    buildChatViewDOM(chatPanel);
  } else {
    buildChatEmptyDOM(chatPanel);
  }

  layout.appendChild(chatPanel);
  container.appendChild(layout);

  // Bind events
  bindWhatsAppEvents();

  if (typeof lucide !== 'undefined') lucide.createIcons();

  if (waState.selectedConversationId) {
    scrollChatToBottom();
  }
}

// ==========================================
// RENDERING - CONVERSATION LIST (DOM)
// ==========================================

function buildConversationListDOM(parentEl) {
  parentEl.textContent = '';
  var convs = waState.filteredConversations;

  if (convs.length === 0) {
    var noResult = document.createElement('div');
    noResult.style.cssText = 'padding:30px 20px;text-align:center;color:#999;font-size:13px;';
    if (waState.searchQuery) {
      noResult.textContent = 'Sin resultados para "' + waState.searchQuery + '"';
    } else {
      noResult.textContent = 'Sin conversaciones';
    }
    parentEl.appendChild(noResult);
    return;
  }

  for (var i = 0; i < convs.length; i++) {
    var c = convs[i];
    parentEl.appendChild(buildConversationItemDOM(c));
  }
}

function buildConversationItemDOM(c) {
  var displayName = c.client_name || c.wa_id || 'Desconocido';
  var rawPreview = c.last_message || '';
  // Replace media placeholders with emoji indicators
  if (rawPreview.startsWith('[Imagen]') || rawPreview === '[Imagen]') {
    rawPreview = '\uD83D\uDCF7 Imagen';
  } else if (rawPreview.startsWith('[Audio')) {
    rawPreview = '\uD83C\uDFA4 Audio';
  } else if (rawPreview.startsWith('[Documento')) {
    rawPreview = '\uD83D\uDCC4 Documento';
  }
  var preview = waTruncate(rawPreview, 50);
  var time = waTimeAgo(c.last_message_at);
  var isActive = c.id === waState.selectedConversationId;
  var unread = c.unread_count || 0;
  var initials = waGetInitials(displayName);

  var item = document.createElement('div');
  item.className = 'wa-conv-item' + (isActive ? ' active' : '');
  item.setAttribute('data-conv-id', c.id);

  // Avatar
  var avatar = document.createElement('div');
  avatar.className = 'wa-conv-avatar';
  avatar.textContent = initials;
  item.appendChild(avatar);

  // Info container
  var info = document.createElement('div');
  info.className = 'wa-conv-info';

  // Header row (name + time)
  var headerRow = document.createElement('div');
  headerRow.className = 'wa-conv-header-row';

  var nameSpan = document.createElement('span');
  nameSpan.className = 'wa-conv-name';
  nameSpan.textContent = displayName;
  headerRow.appendChild(nameSpan);

  var timeSpan = document.createElement('span');
  timeSpan.className = 'wa-conv-time';
  timeSpan.textContent = time;
  headerRow.appendChild(timeSpan);

  info.appendChild(headerRow);

  // Preview
  var previewDiv = document.createElement('div');
  previewDiv.className = 'wa-conv-preview';
  previewDiv.textContent = preview;
  info.appendChild(previewDiv);

  // Meta (intent badge + unread)
  var metaDiv = document.createElement('div');
  metaDiv.className = 'wa-conv-meta';

  if (c.intent) {
    var badgeSpan = buildIntentBadgeDOM(c.intent);
    if (badgeSpan) metaDiv.appendChild(badgeSpan);
  }

  if (unread > 0) {
    var unreadSpan = document.createElement('span');
    unreadSpan.className = 'wa-unread-count';
    unreadSpan.textContent = unread;
    metaDiv.appendChild(unreadSpan);
  }

  info.appendChild(metaDiv);
  item.appendChild(info);

  return item;
}

function buildIntentBadgeDOM(intent) {
  var intents = {
    order:     { emoji: '\uD83D\uDED2', label: 'Pedido',      cls: 'wa-intent-order' },
    pricing:   { emoji: '\uD83D\uDCB0', label: 'Cotizacion',  cls: 'wa-intent-pricing' },
    question:  { emoji: '\u2753',        label: 'Pregunta',    cls: 'wa-intent-question' },
    complaint: { emoji: '\u26A0\uFE0F',  label: 'Queja',       cls: 'wa-intent-complaint' },
    greeting:  { emoji: '\uD83D\uDC4B',  label: 'Saludo',      cls: 'wa-intent-greeting' }
  };
  if (!intent || !intents[intent]) return null;
  var i = intents[intent];
  var span = document.createElement('span');
  span.className = 'wa-intent-badge ' + i.cls;
  span.textContent = i.emoji + ' ' + i.label;
  return span;
}

function renderConversationList() {
  waFilterConversations();
  var list = document.getElementById('wa-conv-list');
  if (!list) return;
  buildConversationListDOM(list);
  bindConversationClickEvents();
}

// ==========================================
// RENDERING - CHAT VIEW (DOM)
// ==========================================

function buildChatEmptyDOM(parentEl) {
  var emptyDiv = document.createElement('div');
  emptyDiv.className = 'wa-chat-empty';

  var iconWrap = document.createElement('div');
  iconWrap.className = 'wa-chat-empty-icon';
  var iconEl = document.createElement('i');
  iconEl.setAttribute('data-lucide', 'message-square');
  iconEl.style.cssText = 'width:28px;height:28px;color:#ccc;';
  iconWrap.appendChild(iconEl);
  emptyDiv.appendChild(iconWrap);

  var msgDiv = document.createElement('div');
  msgDiv.style.cssText = 'font-size:15px;font-weight:500;color:#888;';
  msgDiv.textContent = 'Selecciona una conversacion';
  emptyDiv.appendChild(msgDiv);

  var subDiv = document.createElement('div');
  subDiv.style.cssText = 'font-size:13px;color:#bbb;';
  subDiv.textContent = 'Elige una conversacion del panel izquierdo para ver los mensajes';
  emptyDiv.appendChild(subDiv);

  parentEl.appendChild(emptyDiv);
}

function buildChatViewDOM(parentEl) {
  parentEl.textContent = '';

  var conv = waState.conversations.find(function(c) { return c.id === waState.selectedConversationId; });
  if (!conv) {
    var errDiv = document.createElement('div');
    errDiv.className = 'wa-chat-empty';
    var errText = document.createElement('div');
    errText.style.color = '#999';
    errText.textContent = 'Conversacion no encontrada';
    errDiv.appendChild(errText);
    parentEl.appendChild(errDiv);
    return;
  }

  var displayName = conv.client_name || conv.wa_id || 'Desconocido';
  var phone = conv.wa_id || '';

  // --- Header ---
  var header = document.createElement('div');
  header.className = 'wa-chat-header';

  // Back button (mobile)
  var backBtn = document.createElement('button');
  backBtn.className = 'wa-back-btn';
  backBtn.id = 'wa-back-btn';
  backBtn.title = 'Volver';
  var backIcon = document.createElement('i');
  backIcon.setAttribute('data-lucide', 'arrow-left');
  backIcon.style.cssText = 'width:20px;height:20px;';
  backBtn.appendChild(backIcon);
  header.appendChild(backBtn);

  // Avatar
  var avatar = document.createElement('div');
  avatar.className = 'wa-conv-avatar';
  avatar.style.cssText = 'width:40px;height:40px;font-size:14px;';
  avatar.textContent = waGetInitials(displayName);
  header.appendChild(avatar);

  // Header info
  var headerInfo = document.createElement('div');
  headerInfo.className = 'wa-chat-header-info';

  var nameRow = document.createElement('div');
  nameRow.className = 'wa-chat-header-name';
  nameRow.appendChild(document.createTextNode(displayName + ' '));
  if (conv.intent) {
    var badge = buildIntentBadgeDOM(conv.intent);
    if (badge) nameRow.appendChild(badge);
  }
  headerInfo.appendChild(nameRow);

  if (phone) {
    var phoneDiv = document.createElement('div');
    phoneDiv.className = 'wa-chat-header-phone';
    phoneDiv.textContent = '+' + phone;
    headerInfo.appendChild(phoneDiv);
  }

  if (conv.ai_summary) {
    var summaryDiv = document.createElement('div');
    summaryDiv.className = 'wa-chat-header-summary';
    summaryDiv.textContent = conv.ai_summary;
    headerInfo.appendChild(summaryDiv);
  }

  header.appendChild(headerInfo);
  parentEl.appendChild(header);

  // --- Messages area ---
  var messagesArea = document.createElement('div');
  messagesArea.className = 'wa-messages-area';
  messagesArea.id = 'wa-messages-area';
  buildMessagesDOM(messagesArea);
  parentEl.appendChild(messagesArea);

  // --- Input area ---
  var inputArea = document.createElement('div');
  inputArea.className = 'wa-input-area';

  var textarea = document.createElement('textarea');
  textarea.className = 'wa-input-field';
  textarea.id = 'wa-input';
  textarea.placeholder = 'Escribe un mensaje...';
  textarea.rows = 1;
  inputArea.appendChild(textarea);

  // Image attach button
  var imgBtn = document.createElement('button');
  imgBtn.className = 'wa-img-btn';
  imgBtn.id = 'wa-img-btn';
  imgBtn.title = 'Adjuntar imagen';
  var imgBtnIcon = document.createElement('i');
  imgBtnIcon.setAttribute('data-lucide', 'image');
  imgBtnIcon.style.cssText = 'width:18px;height:18px;';
  imgBtn.appendChild(imgBtnIcon);
  inputArea.appendChild(imgBtn);

  var sendBtn = document.createElement('button');
  sendBtn.className = 'wa-send-btn';
  sendBtn.id = 'wa-send-btn';
  sendBtn.title = 'Enviar';
  // SVG send icon - build with DOM
  var sendSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sendSvg.setAttribute('width', '18');
  sendSvg.setAttribute('height', '18');
  sendSvg.setAttribute('viewBox', '0 0 24 24');
  sendSvg.setAttribute('fill', 'none');
  sendSvg.setAttribute('stroke', 'currentColor');
  sendSvg.setAttribute('stroke-width', '2');
  sendSvg.setAttribute('stroke-linecap', 'round');
  sendSvg.setAttribute('stroke-linejoin', 'round');
  var sendLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  sendLine.setAttribute('x1', '22');
  sendLine.setAttribute('y1', '2');
  sendLine.setAttribute('x2', '11');
  sendLine.setAttribute('y2', '13');
  sendSvg.appendChild(sendLine);
  var sendPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  sendPoly.setAttribute('points', '22 2 15 22 11 13 2 9 22 2');
  sendSvg.appendChild(sendPoly);
  sendBtn.appendChild(sendSvg);
  inputArea.appendChild(sendBtn);

  parentEl.appendChild(inputArea);
}

function buildMessagesDOM(parentEl) {
  parentEl.textContent = '';
  var msgs = waState.messages;

  if (msgs.length === 0) {
    var emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'text-align:center;padding:40px;color:#bbb;font-size:13px;';
    emptyDiv.textContent = 'Sin mensajes';
    parentEl.appendChild(emptyDiv);
    return;
  }

  var lastDate = '';

  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    var msgDate = waFormatDate(m.created_at);

    // Date separator
    if (msgDate !== lastDate) {
      var dateSep = document.createElement('div');
      dateSep.className = 'wa-date-sep';
      dateSep.textContent = msgDate;
      parentEl.appendChild(dateSep);
      lastDate = msgDate;
    }

    // Message bubble
    var msgDiv = document.createElement('div');
    msgDiv.className = 'wa-msg ';

    if (m.direction === 'inbound') {
      msgDiv.className += 'wa-msg-inbound';
    } else if (m.sender === 'ai' || m.sender === 'bot') {
      msgDiv.className += 'wa-msg-ai';
    } else {
      msgDiv.className += 'wa-msg-admin';
    }

    // Sender label
    if (m.direction === 'outbound') {
      var senderDiv = document.createElement('div');
      senderDiv.className = 'wa-msg-sender';
      if (m.sender === 'ai' || m.sender === 'bot') {
        senderDiv.textContent = 'IA AXKAN';
      } else if (m.sender) {
        senderDiv.textContent = m.sender;
      }
      if (senderDiv.textContent) {
        msgDiv.appendChild(senderDiv);
      }
    }

    // Content - render based on message_type
    var contentDiv = document.createElement('div');
    var contentText = m.content || '';
    var msgType = m.message_type || 'text';
    var meta = null;
    if (m.metadata) {
      try {
        meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata || '{}') : (m.metadata || {});
      } catch (e) {
        meta = {};
      }
    } else {
      meta = {};
    }

    if (msgType === 'image' && m.media_url) {
      // Image message
      var img = document.createElement('img');
      img.src = m.media_url;
      img.alt = 'Imagen';
      img.className = 'wa-msg-media-img';
      img.addEventListener('click', (function(url) {
        return function() { window.open(url, '_blank'); };
      })(m.media_url));
      contentDiv.appendChild(img);
      // Show caption below if it exists and isn't the placeholder
      if (contentText && contentText !== '[Imagen]') {
        var captionDiv = document.createElement('div');
        var captionLines = contentText.split('\n');
        for (var j = 0; j < captionLines.length; j++) {
          if (j > 0) captionDiv.appendChild(document.createElement('br'));
          captionDiv.appendChild(document.createTextNode(captionLines[j]));
        }
        contentDiv.appendChild(captionDiv);
      }
    } else if (msgType === 'audio' && m.media_url) {
      // Audio message
      var audio = document.createElement('audio');
      audio.controls = true;
      audio.src = m.media_url;
      audio.className = 'wa-msg-audio';
      contentDiv.appendChild(audio);
      // Show transcription if available
      if (meta && meta.transcription) {
        var transSpan = document.createElement('span');
        transSpan.className = 'wa-msg-transcription';
        transSpan.textContent = meta.transcription;
        contentDiv.appendChild(transSpan);
      }
    } else if (msgType === 'document' && m.media_url) {
      // Document message
      var docLink = document.createElement('a');
      docLink.href = m.media_url;
      docLink.target = '_blank';
      docLink.className = 'wa-msg-doc-link';
      var docFilename = (meta && meta.filename) ? meta.filename : 'Documento';
      docLink.textContent = '\uD83D\uDCC4 ' + docFilename;
      contentDiv.appendChild(docLink);
      // Show caption below if it exists and isn't the placeholder
      if (contentText && !contentText.startsWith('[Documento')) {
        var docCaptionDiv = document.createElement('div');
        var docCaptionLines = contentText.split('\n');
        for (var j = 0; j < docCaptionLines.length; j++) {
          if (j > 0) docCaptionDiv.appendChild(document.createElement('br'));
          docCaptionDiv.appendChild(document.createTextNode(docCaptionLines[j]));
        }
        contentDiv.appendChild(docCaptionDiv);
      }
    } else {
      // Text message (default) - handle newlines
      var lines = contentText.split('\n');
      for (var j = 0; j < lines.length; j++) {
        if (j > 0) contentDiv.appendChild(document.createElement('br'));
        contentDiv.appendChild(document.createTextNode(lines[j]));
      }
    }

    // Outbound messages: show sent image thumbnails from metadata
    if (m.direction === 'outbound' && meta && meta.imagesSent && Array.isArray(meta.imagesSent)) {
      var thumbsDiv = document.createElement('div');
      thumbsDiv.className = 'wa-msg-thumbnails';
      for (var k = 0; k < meta.imagesSent.length; k++) {
        var thumb = document.createElement('img');
        thumb.src = meta.imagesSent[k];
        thumb.alt = 'Imagen enviada';
        thumb.className = 'wa-msg-thumbnail';
        thumb.addEventListener('click', (function(url) {
          return function() { window.open(url, '_blank'); };
        })(meta.imagesSent[k]));
        thumbsDiv.appendChild(thumb);
      }
      contentDiv.appendChild(thumbsDiv);
    }

    msgDiv.appendChild(contentDiv);

    // Timestamp
    var timeDiv = document.createElement('div');
    timeDiv.className = 'wa-msg-time';
    timeDiv.textContent = waFormatTime(m.created_at);
    msgDiv.appendChild(timeDiv);

    parentEl.appendChild(msgDiv);
  }
}

function renderChatMessages() {
  var area = document.getElementById('wa-messages-area');
  if (!area) return;
  var wasAtBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
  buildMessagesDOM(area);
  if (wasAtBottom) {
    area.scrollTop = area.scrollHeight;
  }
}

function renderChatView() {
  var panel = document.getElementById('wa-chat-panel');
  if (!panel) return;
  buildChatViewDOM(panel);
  bindChatEvents();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  scrollChatToBottom();
}

function scrollChatToBottom() {
  var area = document.getElementById('wa-messages-area');
  if (area) {
    area.scrollTop = area.scrollHeight;
  }
}

// ==========================================
// EVENT BINDING
// ==========================================

function bindWhatsAppEvents() {
  // Search input
  var searchInput = document.getElementById('wa-search');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      waState.searchQuery = this.value;
      renderConversationList();
    });
  }

  bindConversationClickEvents();
  bindChatEvents();
}

function bindConversationClickEvents() {
  var items = document.querySelectorAll('.wa-conv-item');
  items.forEach(function(item) {
    item.addEventListener('click', function() {
      var convId = parseInt(this.getAttribute('data-conv-id'), 10);
      selectConversation(convId);
    });
  });
}

function bindChatEvents() {
  // Back button (mobile)
  var backBtn = document.getElementById('wa-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      waState.mobileShowChat = false;
      var layout = document.getElementById('wa-layout');
      if (layout) layout.classList.remove('wa-mobile-chat');
    });
  }

  // Send button
  var sendBtn = document.getElementById('wa-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendMessage);
  }

  // Image attach button
  var imgBtn = document.getElementById('wa-img-btn');
  if (imgBtn) {
    imgBtn.addEventListener('click', function() {
      var url = prompt('URL de la imagen a enviar:');
      if (url && url.trim()) {
        waState.pendingImageUrl = url.trim();
        imgBtn.style.background = '#e72a88';
        imgBtn.style.color = '#fff';
        imgBtn.style.borderColor = '#e72a88';
        imgBtn.title = 'Imagen adjunta (click para quitar)';
      } else {
        waState.pendingImageUrl = null;
        imgBtn.style.background = '';
        imgBtn.style.color = '';
        imgBtn.style.borderColor = '';
        imgBtn.title = 'Adjuntar imagen';
      }
    });
  }

  // Textarea: auto-grow + Enter to send (Shift+Enter for newline)
  var input = document.getElementById('wa-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    input.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }
}

// ==========================================
// ACTIONS
// ==========================================

async function selectConversation(convId) {
  waState.selectedConversationId = convId;
  waState.mobileShowChat = true;

  // Update active state in list
  var items = document.querySelectorAll('.wa-conv-item');
  items.forEach(function(item) {
    var id = parseInt(item.getAttribute('data-conv-id'), 10);
    if (id === convId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Show mobile chat
  var layout = document.getElementById('wa-layout');
  if (layout) layout.classList.add('wa-mobile-chat');

  // Show loading in chat panel
  var panel = document.getElementById('wa-chat-panel');
  if (panel) {
    panel.textContent = '';
    var loadDiv = document.createElement('div');
    loadDiv.className = 'wa-loading';
    loadDiv.textContent = 'Cargando mensajes...';
    panel.appendChild(loadDiv);
  }

  // Fetch messages
  var ok = await fetchConversationMessages(convId);
  if (ok) {
    renderChatView();
    markConversationRead(convId);

    // Remove unread badge from list item
    var listItem = document.querySelector('.wa-conv-item[data-conv-id="' + convId + '"]');
    if (listItem) {
      var badge = listItem.querySelector('.wa-unread-count');
      if (badge) badge.remove();
    }
  } else {
    if (panel) {
      panel.textContent = '';
      var errWrap = document.createElement('div');
      errWrap.className = 'wa-chat-empty';
      var errMsg = document.createElement('div');
      errMsg.style.color = '#e74c3c';
      errMsg.textContent = 'Error al cargar mensajes';
      errWrap.appendChild(errMsg);
      panel.appendChild(errWrap);
    }
  }
}

async function handleSendMessage() {
  var input = document.getElementById('wa-input');
  var sendBtn = document.getElementById('wa-send-btn');
  if (!input || !waState.selectedConversationId) return;

  var message = input.value.trim();
  var imageUrl = waState.pendingImageUrl;
  if (!message && !imageUrl) return;

  // Disable controls while sending
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  // Optimistic UI: add the message locally
  var tempMsg = {
    id: 'temp-' + Date.now(),
    direction: 'outbound',
    sender: 'admin',
    message_type: imageUrl ? 'image' : 'text',
    content: message || '',
    media_url: imageUrl || null,
    created_at: new Date().toISOString()
  };
  waState.messages.push(tempMsg);
  renderChatMessages();
  scrollChatToBottom();

  // Clear input and reset image state
  input.value = '';
  input.style.height = 'auto';
  waState.pendingImageUrl = null;
  var imgBtn = document.getElementById('wa-img-btn');
  if (imgBtn) {
    imgBtn.style.background = '';
    imgBtn.style.color = '';
    imgBtn.style.borderColor = '';
    imgBtn.title = 'Adjuntar imagen';
  }

  // Send to API
  var success = await sendReply(waState.selectedConversationId, message || '', imageUrl);

  // Re-enable controls
  input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  input.focus();

  if (!success) {
    // Remove the temp message on failure
    waState.messages = waState.messages.filter(function(m) { return m.id !== tempMsg.id; });
    renderChatMessages();
    if (typeof window.showToast === 'function') {
      window.showToast('Error al enviar mensaje', 'error');
    }
  } else {
    // Refresh messages from server for accurate data
    var ok = await fetchConversationMessages(waState.selectedConversationId);
    if (ok) renderChatMessages();
    scrollChatToBottom();
  }
}

// ==========================================
// EXPOSE GLOBALLY
// ==========================================

window.loadWhatsAppConversations = loadWhatsAppConversations;
window.stopWhatsAppPolling = stopWhatsAppPolling;
